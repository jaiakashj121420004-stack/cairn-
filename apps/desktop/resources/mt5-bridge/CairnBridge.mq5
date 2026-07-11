//+------------------------------------------------------------------+
//|                                                  CairnBridge.mq5  |
//|        Cairn — Discipline-First Trading Journal (Wave 4 bridge)   |
//|              Designed & built by Jai Akash                        |
//+------------------------------------------------------------------+
//|                                                                  |
//|  READ-ONLY MetaTrader 5 → Cairn bridge.                          |
//|                                                                  |
//|  This Expert Advisor observes trade activity and forwards it to  |
//|  the Cairn desktop app over a LOCAL loopback socket. It is       |
//|  read-only by design and by policy (CLAUDE.md §14 #37,           |
//|  docs/broker-integration.md §8): it NEVER places, modifies, or   |
//|  closes an order. There is intentionally no OrderSend /          |
//|  OrderModify / OrderClose / CTrade code path anywhere in this    |
//|  file, and a test in the Cairn repo greps this source to prove   |
//|  it. Do not add one.                                             |
//|                                                                  |
//|  Wire protocol (docs/broker-integration.md §2.1):                |
//|    Length-prefixed JSON frames over raw TCP to 127.0.0.1:<port>. |
//|    Each frame: [4-byte big-endian length][UTF-8 JSON envelope].  |
//|    Envelope: { "token": "<pairing token>", "event": { ... } }.   |
//|    The event normalises to Cairn's BrokerEvent shape.            |
//|                                                                  |
//+------------------------------------------------------------------+
#property copyright "Jai Akash"
#property link      "https://github.com/"
#property version   "1.00"
#property strict
#property description "Read-only bridge: forwards MT5 fills to the Cairn desktop app over loopback. Never trades."

//--- inputs ---------------------------------------------------------
input string InpHost         = "127.0.0.1";   // Cairn listener host (loopback only)
input int    InpPort         = 53127;          // Cairn listener port (see Settings -> Integrations -> MT5)
input string InpToken        = "";             // Pairing token (paste from Cairn Settings)
input int    InpHeartbeatSec = 5;              // Heartbeat interval in seconds
input int    InpBackfillDays  = 90;            // On attach, replay this many days of closed history (0 = off)

//--- state ----------------------------------------------------------
int g_socket = INVALID_HANDLE;

// ── Pre-trade gate (P0.7) chart-UI state. Read-only: this draws chart objects,
//    reports the trader's intent + dragged levels to Cairn, and renders levels
//    Cairn sends back. It NEVER places, modifies, or closes an order. ──
#define GATE_OBJ_BUY  "CairnGateBuy"
#define GATE_OBJ_SELL "CairnGateSell"
#define GATE_OBJ_SL   "CairnGateSL"
#define GATE_OBJ_TP   "CairnGateTP"
#define GATE_OBJ_INFO "CairnGateInfo"
string g_gateDir       = "";  // "long"/"short" while a gate session is active, else ""
uint   g_lastLevelsTick = 0;  // GetTickCount() throttle for gate.levels drag streaming
uchar  g_readBuf[];           // inbound (Cairn→EA) frame reassembly buffer

//+------------------------------------------------------------------+
//| Initialisation                                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpToken) == 0)
   {
      Print("CairnBridge: InpToken is empty. Paste the pairing token from Cairn Settings -> Integrations -> MT5.");
      return(INIT_FAILED);
   }

   bool connected = Connect();
   if(!connected)
      Print("CairnBridge: initial connect failed; will retry on the heartbeat timer.");

   EventSetTimer(InpHeartbeatSec > 0 ? InpHeartbeatSec : 5);
   Print("CairnBridge: started (read-only). Target ", InpHost, ":", IntegerToString(InpPort));

   // Pre-trade gate chart controls (P0.7) — Cairn Buy/Sell + readout label.
   CreateGateUi();

   // One-shot read-only historical backfill so pre-existing closed trades populate
   // Cairn (P0.3). Deduped server-side by external_ref, so re-attaching is safe.
   if(connected)
      BackfillHistory();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Shutdown                                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Disconnect();
   // Remove the pre-trade gate chart objects.
   ObjectDelete(0, GATE_OBJ_BUY);
   ObjectDelete(0, GATE_OBJ_SELL);
   ObjectDelete(0, GATE_OBJ_SL);
   ObjectDelete(0, GATE_OBJ_TP);
   ObjectDelete(0, GATE_OBJ_INFO);
   Print("CairnBridge: stopped.");
}

//+------------------------------------------------------------------+
//| (Re)connect the loopback socket                                  |
//+------------------------------------------------------------------+
bool Connect()
{
   if(g_socket != INVALID_HANDLE && SocketIsConnected(g_socket))
      return(true);

   Disconnect();
   g_socket = SocketCreate();
   if(g_socket == INVALID_HANDLE)
   {
      Print("CairnBridge: SocketCreate failed, error ", IntegerToString(GetLastError()));
      return(false);
   }
   if(!SocketConnect(g_socket, InpHost, InpPort, 1000))
   {
      Print("CairnBridge: SocketConnect to ", InpHost, ":", IntegerToString(InpPort),
            " failed, error ", IntegerToString(GetLastError()),
            " (allow 127.0.0.1 in Tools -> Options -> Expert Advisors).");
      Disconnect();
      return(false);
   }
   return(true);
}

//+------------------------------------------------------------------+
//| Close the socket                                                 |
//+------------------------------------------------------------------+
void Disconnect()
{
   if(g_socket != INVALID_HANDLE)
   {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
   }
}

//+------------------------------------------------------------------+
//| Heartbeat timer                                                  |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(!Connect())
      return;

   string evt = StringFormat(
      "{\"type\":\"heartbeat\",\"broker\":\"mt5\",\"brokerAccountId\":%s,\"eventTimeMs\":%s,\"raw\":null}",
      JsonString(AccountId()),
      NowMs());
   SendFrame(evt);

   // Drain any Cairn→EA gate commands (gate.drawLines / gate.show).
   ReadInbound();
}

//+------------------------------------------------------------------+
//| Trade transaction handler — the read path                        |
//|                                                                  |
//| We translate MT5 transactions into Cairn position-lifecycle      |
//| events. DEAL_ADD carries fills (open / partial / full close);    |
//| TRADE_TRANSACTION_POSITION carries SL/TP/volume changes.         |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      HandleDeal(trans.deal);
      return;
   }

   if(trans.type == TRADE_TRANSACTION_POSITION)
   {
      // An existing position's SL/TP/volume changed.
      HandlePositionModified((ulong)trans.position);
      return;
   }
}

//+------------------------------------------------------------------+
//| Emit an event for a newly added deal                             |
//+------------------------------------------------------------------+
void HandleDeal(const ulong dealTicket)
{
   if(!HistoryDealSelect(dealTicket))
      return;

   long   entry  = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   long   dtype  = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   ulong  posId  = (ulong)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   string sym    = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   double price  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double vol    = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   long   tmsc   = HistoryDealGetInteger(dealTicket, DEAL_TIME_MSC);

   // Balance / credit / correction deals carry no position — ignore.
   if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
      return;
   if(posId == 0)
      return;

   if(entry == DEAL_ENTRY_IN)
   {
      // Position opened. Direction follows the opening deal type.
      string dir = (dtype == DEAL_TYPE_BUY) ? "long" : "short";
      double sl  = 0.0;
      double tp  = 0.0;
      ReadPositionSlTp(posId, sl, tp);
      SendEvent("position_opened", posId, sym, dir, vol, price, sl, tp, tmsc, dealTicket, (int)entry);
      return;
   }

   if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT || entry == DEAL_ENTRY_OUT_BY)
   {
      // A closing deal closes the opposite side, so the position direction is
      // the inverse of this deal's type.
      string dir = (dtype == DEAL_TYPE_SELL) ? "long" : "short";
      double sl  = 0.0;
      double tp  = 0.0;
      bool   stillOpen = ReadPositionSlTp(posId, sl, tp);
      // If the position still exists after this deal, it was a partial close.
      string type = stillOpen ? "partial_close" : "position_closed";
      SendEvent(type, posId, sym, dir, vol, price, sl, tp, tmsc, dealTicket, (int)entry);
      return;
   }
}

//+------------------------------------------------------------------+
//| Read-only historical backfill (P0.3).                            |
//|                                                                  |
//| Replays closed positions from the last InpBackfillDays so a      |
//| freshly-attached EA populates pre-existing trades. HandleDeal    |
//| cannot be reused here: its partial-vs-final-close check reads the |
//| LIVE position, which no longer exists for a historical trade, so |
//| every close would mislabel as position_closed. Instead we group  |
//| by position and decide partial vs final from cumulative closed   |
//| volume (correct-by-construction). Still read-only — no order call.|
//+------------------------------------------------------------------+
void BackfillHistory()
{
   if(InpBackfillDays <= 0)
      return;
   datetime from = TimeCurrent() - (datetime)InpBackfillDays * 86400;
   if(!HistorySelect(from, TimeCurrent()))
      return;

   // Collect the unique position ids that traded in the window.
   ulong posIds[];
   int   count = 0;
   int   total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      long  dtype = HistoryDealGetInteger(ticket, DEAL_TYPE);
      ulong posId = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      if(posId == 0)
         continue;
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
         continue;
      bool seen = false;
      for(int j = 0; j < count; j++)
         if(posIds[j] == posId) { seen = true; break; }
      if(!seen)
      {
         ArrayResize(posIds, count + 1);
         posIds[count] = posId;
         count++;
      }
   }

   for(int k = 0; k < count; k++)
      BackfillPosition(posIds[k]);

   Print("CairnBridge: backfilled ", IntegerToString(count), " historical position(s).");
}

//+------------------------------------------------------------------+
//| Replay one position's deals as opened / partial_close / closed.  |
//+------------------------------------------------------------------+
void BackfillPosition(const ulong posId)
{
   if(!HistorySelectByPosition(posId))
      return;
   int n = HistoryDealsTotal();

   // Total opening volume — used to tell a partial close from the final close.
   double inVol = 0.0;
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_IN)
         inVol += HistoryDealGetDouble(t, DEAL_VOLUME);
   }

   double outVol = 0.0;
   for(int i = 0; i < n; i++)
   {
      ulong  t     = HistoryDealGetTicket(i);
      long   entry = HistoryDealGetInteger(t, DEAL_ENTRY);
      long   dtype = HistoryDealGetInteger(t, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
         continue;
      string sym   = HistoryDealGetString(t, DEAL_SYMBOL);
      double price = HistoryDealGetDouble(t, DEAL_PRICE);
      double vol   = HistoryDealGetDouble(t, DEAL_VOLUME);
      long   tmsc  = HistoryDealGetInteger(t, DEAL_TIME_MSC);

      if(entry == DEAL_ENTRY_IN)
      {
         string dir = (dtype == DEAL_TYPE_BUY) ? "long" : "short";
         SendEvent("position_opened", posId, sym, dir, vol, price, 0.0, 0.0, tmsc, t, (int)entry);
      }
      else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT || entry == DEAL_ENTRY_OUT_BY)
      {
         outVol += vol;
         string dir  = (dtype == DEAL_TYPE_SELL) ? "long" : "short";
         string type = (outVol >= inVol - 1e-8) ? "position_closed" : "partial_close";
         SendEvent(type, posId, sym, dir, vol, price, 0.0, 0.0, tmsc, t, (int)entry);
      }
   }
}

//+------------------------------------------------------------------+
//| Emit a position_modified event (SL/TP/volume change)             |
//+------------------------------------------------------------------+
void HandlePositionModified(const ulong posId)
{
   if(!PositionSelectByTicket(posId))
      return;

   string sym = PositionGetString(POSITION_SYMBOL);
   long   pt  = PositionGetInteger(POSITION_TYPE);
   string dir = (pt == POSITION_TYPE_BUY) ? "long" : "short";
   double vol = PositionGetDouble(POSITION_VOLUME);
   double px  = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl  = PositionGetDouble(POSITION_SL);
   double tp  = PositionGetDouble(POSITION_TP);
   long   tmsc = (long)TimeCurrent() * 1000;

   SendEvent("position_modified", posId, sym, dir, vol, px, sl, tp, tmsc, 0, -1);
}

//+------------------------------------------------------------------+
//| Read a position's SL/TP; returns true if the position exists     |
//+------------------------------------------------------------------+
bool ReadPositionSlTp(const ulong posId, double &sl, double &tp)
{
   if(!PositionSelectByTicket(posId))
   {
      sl = 0.0;
      tp = 0.0;
      return(false);
   }
   sl = PositionGetDouble(POSITION_SL);
   tp = PositionGetDouble(POSITION_TP);
   return(true);
}

//+------------------------------------------------------------------+
//| Build + send one BrokerEvent envelope                            |
//+------------------------------------------------------------------+
void SendEvent(const string type, const ulong posId, const string sym, const string dir,
               const double vol, const double price, const double sl, const double tp,
               const long tmsc, const ulong dealTicket, const int entry)
{
   int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   string raw = StringFormat("{\"deal\":%s,\"entry\":%d}",
                             IntegerToString((long)dealTicket), entry);

   string evt = StringFormat(
      "{\"type\":%s,\"broker\":\"mt5\",\"brokerAccountId\":%s,\"brokerTradeId\":%s,"
      "\"symbol\":%s,\"direction\":%s,\"volumeLots\":%s,\"price\":%s,"
      "\"stopLoss\":%s,\"takeProfit\":%s,\"eventTimeMs\":%s,\"raw\":%s}",
      JsonString(type),
      JsonString(AccountId()),
      JsonString(IntegerToString((long)posId)),
      JsonString(sym),
      JsonString(dir),
      JsonNum(vol, 2),
      JsonNum(price, digits),
      JsonNullableNum(sl, digits),
      JsonNullableNum(tp, digits),
      IntegerToString(tmsc),
      raw);

   SendFrame(evt);
}

//+------------------------------------------------------------------+
//| Wrap an event in the token envelope and write a framed message   |
//+------------------------------------------------------------------+
void SendFrame(const string eventJson)
{
   if(g_socket == INVALID_HANDLE || !SocketIsConnected(g_socket))
   {
      if(!Connect())
         return;
   }

   string envelope = StringFormat("{\"token\":%s,\"event\":%s}",
                                  JsonString(InpToken), eventJson);

   uchar body[];
   int n = StringToCharArray(envelope, body, 0, -1, CP_UTF8);
   // StringToCharArray appends a terminating null — exclude it from the length.
   int len = (n > 0) ? n - 1 : 0;
   if(len <= 0)
      return;

   uchar frame[];
   ArrayResize(frame, 4 + len);
   frame[0] = (uchar)((len >> 24) & 0xFF);
   frame[1] = (uchar)((len >> 16) & 0xFF);
   frame[2] = (uchar)((len >> 8) & 0xFF);
   frame[3] = (uchar)(len & 0xFF);
   ArrayCopy(frame, body, 4, 0, len);

   int sent = SocketSend(g_socket, frame, 4 + len);
   if(sent <= 0)
   {
      Print("CairnBridge: SocketSend failed, error ", IntegerToString(GetLastError()), "; reconnecting.");
      Disconnect();
   }
}

//+------------------------------------------------------------------+
//| Pre-trade gate (P0.7) — chart controls. READ-ONLY: draws objects, |
//| reports intent + dragged levels to Cairn, renders levels Cairn    |
//| sends back. No order-execution call exists anywhere below.        |
//+------------------------------------------------------------------+
void CreateGateUi()
{
   CreateGateButton(GATE_OBJ_BUY, "Cairn Buy", 10, 26, clrSeaGreen);
   CreateGateButton(GATE_OBJ_SELL, "Cairn Sell", 102, 26, clrFireBrick);
   CreateInfoLabel();
   ChartRedraw();
}

void CreateGateButton(const string name, const string text, const int x, const int y, const color bg)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, 86);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, 24);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
}

void CreateInfoLabel()
{
   if(ObjectFind(0, GATE_OBJ_INFO) < 0)
      ObjectCreate(0, GATE_OBJ_INFO, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, GATE_OBJ_INFO, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, GATE_OBJ_INFO, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, GATE_OBJ_INFO, OBJPROP_YDISTANCE, 56);
   ObjectSetInteger(0, GATE_OBJ_INFO, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, GATE_OBJ_INFO, OBJPROP_FONTSIZE, 9);
   ObjectSetString(0, GATE_OBJ_INFO, OBJPROP_TEXT, "Cairn gate ready");
}

//+------------------------------------------------------------------+
//| Chart interaction: button clicks + SL/TP line drags.             |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      if(sparam == GATE_OBJ_BUY)
      {
         StartGate("long");
         ObjectSetInteger(0, GATE_OBJ_BUY, OBJPROP_STATE, false);
      }
      else if(sparam == GATE_OBJ_SELL)
      {
         StartGate("short");
         ObjectSetInteger(0, GATE_OBJ_SELL, OBJPROP_STATE, false);
      }
   }
   else if(id == CHARTEVENT_OBJECT_DRAG)
   {
      if(sparam == GATE_OBJ_SL || sparam == GATE_OBJ_TP)
      {
         // Throttle drag streaming to ~10/s so the socket stays calm.
         uint now = GetTickCount();
         if(now - g_lastLevelsTick >= 100)
         {
            SendGateLevels();
            g_lastLevelsTick = now;
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Begin a compliant gate session: draw draggable SL/TP + report.   |
//+------------------------------------------------------------------+
void StartGate(const string dir)
{
   g_gateDir = dir;
   double price = (dir == "long") ? SymbolInfoDouble(_Symbol, SYMBOL_ASK)
                                  : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int    slPts = 200; // default; the trader drags the lines to adjust
   double sl = (dir == "long") ? price - slPts * point : price + slPts * point;
   double tp = (dir == "long") ? price + 2 * slPts * point : price - 2 * slPts * point;
   DrawLevelLine(GATE_OBJ_SL, sl, clrFireBrick);
   DrawLevelLine(GATE_OBJ_TP, tp, clrSeaGreen);
   SendGateIntent(dir, price);
   UpdateInfo(price, sl, tp);
   ChartRedraw();
}

void DrawLevelLine(const string name, const double price, const color c)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTED, false);
}

void UpdateInfo(const double price, const double sl, const double tp)
{
   double point  = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double slDist = MathAbs(price - sl);
   double slPips = (point > 0) ? slDist / point / 10.0 : 0.0;
   double rr     = (slDist > 0) ? MathAbs(tp - price) / slDist : 0.0;
   ObjectSetString(0, GATE_OBJ_INFO, OBJPROP_TEXT,
      StringFormat("Cairn: SL %.1f pips   R:R %.2f   (confirm in the Cairn window)", slPips, rr));
}

void UpdateInfoFromLines()
{
   if(g_gateDir == "")
      return;
   double sl = ObjectGetDouble(0, GATE_OBJ_SL, OBJPROP_PRICE);
   double tp = ObjectGetDouble(0, GATE_OBJ_TP, OBJPROP_PRICE);
   double price = (g_gateDir == "long") ? SymbolInfoDouble(_Symbol, SYMBOL_ASK)
                                        : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   UpdateInfo(price, sl, tp);
}

//+------------------------------------------------------------------+
//| Outbound gate frames (report only — never an order).             |
//+------------------------------------------------------------------+
void SendGateIntent(const string dir, const double price)
{
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   string evt = StringFormat(
      "{\"type\":\"gate.intent\",\"broker\":\"mt5\",\"brokerAccountId\":%s,\"symbol\":%s,"
      "\"direction\":%s,\"price\":%s,\"eventTimeMs\":%s}",
      JsonString(AccountId()), JsonString(_Symbol), JsonString(dir),
      JsonNum(price, digits), NowMs());
   SendFrame(evt);
}

void SendGateLevels()
{
   if(g_gateDir == "")
      return;
   double sl = ObjectGetDouble(0, GATE_OBJ_SL, OBJPROP_PRICE);
   double tp = ObjectGetDouble(0, GATE_OBJ_TP, OBJPROP_PRICE);
   double price = (g_gateDir == "long") ? SymbolInfoDouble(_Symbol, SYMBOL_ASK)
                                        : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   string evt = StringFormat(
      "{\"type\":\"gate.levels\",\"broker\":\"mt5\",\"brokerAccountId\":%s,\"symbol\":%s,"
      "\"price\":%s,\"stopLoss\":%s,\"takeProfit\":%s,\"eventTimeMs\":%s}",
      JsonString(AccountId()), JsonString(_Symbol), JsonNum(price, digits),
      JsonNullableNum(sl, digits), JsonNullableNum(tp, digits), NowMs());
   SendFrame(evt);
   UpdateInfo(price, sl, tp);
}

//+------------------------------------------------------------------+
//| Inbound (Cairn→EA) command read: gate.drawLines renders the      |
//| levels Cairn computed so the chart + overlay stay in agreement.  |
//+------------------------------------------------------------------+
void ReadInbound()
{
   if(g_socket == INVALID_HANDLE || !SocketIsConnected(g_socket))
      return;
   uint avail = SocketIsReadable(g_socket);
   while(avail > 0)
   {
      uchar chunk[];
      int got = SocketRead(g_socket, chunk, (int)avail, 50);
      if(got <= 0)
         break;
      int oldSize = ArraySize(g_readBuf);
      ArrayResize(g_readBuf, oldSize + got);
      ArrayCopy(g_readBuf, chunk, oldSize, 0, got);
      ProcessInboundFrames();
      avail = SocketIsReadable(g_socket);
   }
}

void ProcessInboundFrames()
{
   while(ArraySize(g_readBuf) >= 4)
   {
      int len = ((int)g_readBuf[0] << 24) | ((int)g_readBuf[1] << 16)
              | ((int)g_readBuf[2] << 8) | (int)g_readBuf[3];
      if(len <= 0 || len > 65536)
      {
         ArrayResize(g_readBuf, 0); // unrecoverable framing — resync
         return;
      }
      if(ArraySize(g_readBuf) < 4 + len)
         return; // wait for the rest of the frame
      uchar payload[];
      ArrayResize(payload, len);
      ArrayCopy(payload, g_readBuf, 0, 4, len);
      string json = CharArrayToString(payload, 0, len, CP_UTF8);
      HandleInbound(json);
      int rest = ArraySize(g_readBuf) - (4 + len);
      uchar tmp[];
      if(rest > 0)
      {
         ArrayResize(tmp, rest);
         ArrayCopy(tmp, g_readBuf, 0, 4 + len, rest);
      }
      ArrayResize(g_readBuf, rest);
      if(rest > 0)
         ArrayCopy(g_readBuf, tmp, 0, 0, rest);
   }
}

void HandleInbound(const string json)
{
   // Light auth: only act on frames carrying our pairing token (loopback anyway).
   if(StringFind(json, InpToken) < 0)
      return;
   if(StringFind(json, "gate.drawLines") >= 0)
   {
      double sl = ExtractNum(json, "stopLoss");
      double tp = ExtractNum(json, "takeProfit");
      if(sl > 0)
         DrawLevelLine(GATE_OBJ_SL, sl, clrFireBrick);
      if(tp > 0)
         DrawLevelLine(GATE_OBJ_TP, tp, clrSeaGreen);
      UpdateInfoFromLines();
      ChartRedraw();
   }
}

//--- Extract a numeric JSON value by key (returns 0 for absent/null).
double ExtractNum(const string json, const string key)
{
   string needle = "\"" + key + "\":";
   int p = StringFind(json, needle);
   if(p < 0)
      return 0.0;
   p += StringLen(needle);
   int n = StringLen(json);
   while(p < n && StringGetCharacter(json, p) == ' ')
      p++;
   int start = p;
   while(p < n)
   {
      ushort ch = StringGetCharacter(json, p);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == '+')
         p++;
      else
         break;
   }
   if(p == start)
      return 0.0; // e.g. null
   return StringToDouble(StringSubstr(json, start, p - start));
}

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
string AccountId()
{
   return IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
}

string NowMs()
{
   return IntegerToString((long)TimeCurrent() * 1000);
}

//--- JSON string with minimal escaping (quotes + backslashes)
string JsonString(const string s)
{
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   return "\"" + out + "\"";
}

//--- JSON number (fixed decimals, no scientific notation)
string JsonNum(const double v, const int digits)
{
   return DoubleToString(v, digits);
}

//--- JSON number or null when unset (<= 0, as MT5 reports for "no SL/TP")
string JsonNullableNum(const double v, const int digits)
{
   if(v <= 0.0)
      return "null";
   return DoubleToString(v, digits);
}
//+------------------------------------------------------------------+
