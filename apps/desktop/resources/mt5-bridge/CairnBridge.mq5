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

//--- state ----------------------------------------------------------
int g_socket = INVALID_HANDLE;

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

   if(!Connect())
      Print("CairnBridge: initial connect failed; will retry on the heartbeat timer.");

   EventSetTimer(InpHeartbeatSec > 0 ? InpHeartbeatSec : 5);
   Print("CairnBridge: started (read-only). Target ", InpHost, ":", IntegerToString(InpPort));
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Shutdown                                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Disconnect();
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
