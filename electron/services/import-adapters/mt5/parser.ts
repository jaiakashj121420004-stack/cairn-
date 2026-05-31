/**
 * MT5 HTML/CSV statement parser.
 *
 * Parses the broker's "Account History" HTML export (File → Save As from the
 * MT5 terminal). Returns raw deals + orders for the reconciler to group into
 * Cairn trade candidates.
 *
 * Design rules (per spec):
 *   - Never silently drop a row. Anything that can't be parsed goes into
 *     `errors` and is returned to the caller for display.
 *   - No `try { ... } catch { return null }` swallowing data.
 *   - All section-label matching is case-insensitive; a few translations are
 *     supported for English, Spanish, and German terminals.
 */

import type { Mt5ParseError } from '../../../../shared/types/index'

// ─── Section label sets ───────────────────────────────────────────────────────

const DEALS_LABELS = new Set([
  'deals',           // EN
  'transacciones',   // ES
  'abschlüsse',      // DE
  'abschlusse',      // DE (no umlaut rendering)
  'deals (orders)',  // some MT5 versions append context
  'сделки',          // RU
  'transactions',    // FR / generic
  'operações',       // PT
  'operacoes',       // PT (no diacritic)
  'negócios',        // PT-BR
  'negocios',        // PT-BR (no diacritic)
])

const ORDERS_LABELS = new Set([
  'orders',          // EN
  'órdenes',         // ES
  'ordenes',         // ES (no accent)
  'aufträge',        // DE
  'auftrage',        // DE (no umlaut)
  'ordens',          // PT
  'ордера',          // RU
  'ordres',          // FR
])

// ─── Raw row types (pre-reconciliation) ──────────────────────────────────────

export interface RawDeal {
  readonly dealId: string
  readonly orderId: string
  readonly symbol: string
  readonly timeMs: number          // UTC ms parsed from MT5 date
  readonly dealType: string        // "buy" | "sell" | "balance" etc. (raw, lowercased)
  readonly dealDirection: string   // "in" | "out" | "in/out" etc. (raw, lowercased)
  readonly volumeLots: string      // raw e.g. "0.10"
  readonly price: string           // raw e.g. "1.08523"
  readonly commission: string      // raw e.g. "-0.80"
  readonly swap: string            // raw e.g. "0.00"
  readonly profit: string          // raw e.g. "17.00"
  readonly balance: string
  readonly comment: string
}

export interface RawOrder {
  readonly orderId: string
  readonly symbol: string
  readonly openTimeMs: number
  readonly orderType: string       // raw e.g. "buy", "sell", "buy limit"
  readonly volumeLots: string
  readonly openPrice: string
  readonly stopLoss: string        // "0.00000" if not set
  readonly takeProfit: string      // "0.00000" if not set
  readonly closeTimeMs: number | null
  readonly closePrice: string | null
  readonly profit: string
  readonly comment: string
}

export interface ParseResult {
  readonly deals: RawDeal[]
  readonly orders: RawOrder[]
  readonly errors: Mt5ParseError[]
}

// ─── Public entry point ───────────────────────────────────────────────────────

/** Parse an MT5 HTML statement string into raw deals and orders. */
export function parseMt5Html(html: string): ParseResult {
  const errors: Mt5ParseError[] = []
  const tables = extractTables(html)

  let dealsTable: string | null = null
  let ordersTable: string | null = null

  for (const table of tables) {
    const title = extractTitleText(table)
    const lower = title.toLowerCase().trim()
    if (!dealsTable && DEALS_LABELS.has(lower)) {
      dealsTable = table
    } else if (!ordersTable && ORDERS_LABELS.has(lower)) {
      ordersTable = table
    }
  }

  const deals = dealsTable ? parseDealsTable(dealsTable, errors) : []
  const orders = ordersTable ? parseOrdersTable(ordersTable, errors) : []
  return { deals, orders, errors }
}

// ─── Table extraction ─────────────────────────────────────────────────────────

/**
 * Split the HTML into top-level <table>...</table> blocks, handling nesting.
 * Returns one string per outermost table found.
 */
function extractTables(html: string): string[] {
  const results: string[] = []
  const lower = html.toLowerCase()
  let pos = 0

  while (pos < lower.length) {
    const start = lower.indexOf('<table', pos)
    if (start === -1) break

    let depth = 1
    let scan = start + 6  // past '<table'
    let end = -1

    while (scan < lower.length && depth > 0) {
      const nextOpen = lower.indexOf('<table', scan)
      const nextClose = lower.indexOf('</table', scan)

      if (nextClose === -1) {
        // No closing tag — malformed; skip past this table start
        scan = lower.length
        break
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++
        scan = nextOpen + 6
      } else {
        depth--
        if (depth === 0) {
          end = nextClose + 8  // 8 = length of '</table>'
        } else {
          scan = nextClose + 8
        }
      }
    }

    if (end !== -1) {
      results.push(html.slice(start, end))
      pos = end
    } else {
      break
    }
  }

  return results
}

/** Extract the plain-text content of the first header row (the section title). */
function extractTitleText(table: string): string {
  // The first <tr> is the section title row (e.g. <td colspan=13><b>Deals</b></td>)
  const rowMatch = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)
  if (!rowMatch) return ''
  return cellText(rowMatch[1])
}

// ─── Row / cell parsing ───────────────────────────────────────────────────────

/** Extract all <tr>...</tr> blocks from a table string. */
function extractRows(table: string): string[] {
  const rows: string[] = []
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(table)) !== null) {
    rows.push(m[0])
  }
  return rows
}

/** Extract all <td>...</td> cell text values from a row string. */
function extractCells(row: string): string[] {
  const cells: string[] = []
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(row)) !== null) {
    cells.push(cellText(m[1]))
  }
  return cells
}

/** Strip all HTML tags and decode common entities. */
function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r?\n/g, ' ')
    .trim()
}

// ─── Column-index detection ───────────────────────────────────────────────────

type ColMap = Map<string, number>

/**
 * Build a map of normalized column header text → column index.
 * Normalization: lower-case, collapse whitespace, strip punctuation variants.
 */
function buildColMap(headerRow: string): ColMap {
  const map: ColMap = new Map()
  extractCells(headerRow).forEach((cell, i) => {
    const key = cell.toLowerCase().replace(/\s+/g, ' ').trim()
    if (key) map.set(key, i)
  })
  return map
}

/** Resolve a column index by trying multiple name variants. Returns -1 if not found. */
function colIdx(map: ColMap, ...names: string[]): number {
  for (const name of names) {
    const idx = map.get(name)
    if (idx !== undefined) return idx
  }
  return -1
}

/** Get a cell value by column index; returns '' if out of bounds. */
function cell(cells: string[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return ''
  return cells[idx] ?? ''
}

// ─── MT5 date parsing ─────────────────────────────────────────────────────────

/**
 * Parse an MT5 date string (YYYY.MM.DD HH:MM:SS) to UTC milliseconds.
 * Returns null if the string doesn't match the expected format.
 */
function parseMt5Date(s: string): number | null {
  const m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  return Number.isFinite(ms) ? ms : null
}

// ─── Deals table parser ───────────────────────────────────────────────────────

// Known column header variants for the Deals table.
const DEAL_COL = {
  time:        ['time', 'zeit', 'tiempo', 'время'],
  deal:        ['deal', 'abschluss', 'transacción', 'transacao', 'сделка'],
  symbol:      ['symbol'],
  type:        ['type', 'typ', 'tipo', 'тип'],
  direction:   ['direction', 'richtung', 'dirección', 'direccion', 'направление'],
  volume:      ['volume', 'volumen', 'объем'],
  price:       ['price', 'preis', 'precio', 'цена'],
  order:       ['order', 'auftrag', 'orden', 'ордер'],
  commission:  ['commission', 'kommission', 'comisión', 'comision', 'комиссия'],
  swap:        ['swap', 'своп'],
  profit:      ['profit', 'gewinn', 'beneficio', 'прибыль'],
  balance:     ['balance', 'saldo', 'баланс'],
  comment:     ['comment', 'kommentar', 'comentario', 'комментарий'],
} as const

function parseDealsTable(table: string, errors: Mt5ParseError[]): RawDeal[] {
  const rows = extractRows(table)
  if (rows.length < 2) return []  // need at least title row + header row

  // rows[0] = section title, rows[1] = column headers
  const colMap = buildColMap(rows[1] ?? '')

  const iTime   = colIdx(colMap, ...DEAL_COL.time)
  const iDeal   = colIdx(colMap, ...DEAL_COL.deal)
  const iSym    = colIdx(colMap, ...DEAL_COL.symbol)
  const iType   = colIdx(colMap, ...DEAL_COL.type)
  const iDir    = colIdx(colMap, ...DEAL_COL.direction)
  const iVol    = colIdx(colMap, ...DEAL_COL.volume)
  const iPrice  = colIdx(colMap, ...DEAL_COL.price)
  const iOrder  = colIdx(colMap, ...DEAL_COL.order)
  const iComm   = colIdx(colMap, ...DEAL_COL.commission)
  const iSwap   = colIdx(colMap, ...DEAL_COL.swap)
  const iProfit = colIdx(colMap, ...DEAL_COL.profit)
  const iBalanc = colIdx(colMap, ...DEAL_COL.balance)
  const iComm2  = colIdx(colMap, ...DEAL_COL.comment)

  const deals: RawDeal[] = []

  for (let rowIdx = 2; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    if (!row) continue
    const cells = extractCells(row)
    if (cells.length === 0) continue

    const rawTimeStr = cell(cells, iTime)
    const dealId     = cell(cells, iDeal)
    const symbol     = cell(cells, iSym)
    const dealType   = cell(cells, iType).toLowerCase()
    const dealDir    = cell(cells, iDir).toLowerCase()
    const volume     = cell(cells, iVol)
    const price      = cell(cells, iPrice)
    const orderId    = cell(cells, iOrder)
    const commission = cell(cells, iComm)
    const swap       = cell(cells, iSwap)
    const profit     = cell(cells, iProfit)
    const balance    = cell(cells, iBalanc)
    const comment    = cell(cells, iComm2)

    // Skip balance / deposit / withdrawal / credit rows — these have no symbol
    // or a non-trade type. They must not produce an error (they're expected).
    if (!symbol || dealType === 'balance' || dealType === 'credit'
        || dealType === 'deposit' || dealType === 'withdrawal'
        || dealType === 'correction') {
      continue
    }

    // Check required fields
    const timeMs = parseMt5Date(rawTimeStr)
    const parseIssues: string[] = []
    if (!timeMs) parseIssues.push(`unparseable time "${rawTimeStr}"`)
    if (!dealId) parseIssues.push('missing deal ID')
    if (!orderId) parseIssues.push('missing order ID')
    if (!dealType) parseIssues.push('missing type')

    if (parseIssues.length > 0) {
      errors.push({
        section: 'deals',
        rowIndex: rowIdx,
        rawContent: cells.join(' | '),
        reason: parseIssues.join('; '),
      })
      continue
    }

    deals.push({
      dealId,
      orderId,
      symbol,
      timeMs: timeMs as number,
      dealType,
      dealDirection: dealDir,
      volumeLots: volume,
      price,
      commission,
      swap,
      profit,
      balance,
      comment,
    })
  }

  return deals
}

// ─── Orders table parser ──────────────────────────────────────────────────────

const ORDER_COL = {
  openTime:   ['open time', 'öffnungszeit', 'hora de apertura', 'hora abertura', 'время открытия'],
  order:      ['order', 'auftrag', 'orden', 'ордер'],
  symbol:     ['symbol'],
  type:       ['type', 'typ', 'tipo', 'тип'],
  volume:     ['volume', 'volumen', 'объем'],
  openPrice:  ['open price', 'eröffnungspreis', 'precio de apertura', 'цена открытия'],
  sl:         ['s / l', 's/l', 'stop loss', 'стоп'],
  tp:         ['t / p', 't/p', 'take profit', 'тейк'],
  closeTime:  ['close time', 'schließzeit', 'hora de cierre', 'время закрытия'],
  closePrice: ['close price', 'schlusskurs', 'precio de cierre', 'цена закрытия'],
  profit:     ['profit', 'gewinn', 'beneficio', 'прибыль'],
  comment:    ['comment', 'kommentar', 'comentario', 'комментарий'],
} as const

function parseOrdersTable(table: string, errors: Mt5ParseError[]): RawOrder[] {
  const rows = extractRows(table)
  if (rows.length < 2) return []

  const colMap = buildColMap(rows[1] ?? '')

  const iOpenTime   = colIdx(colMap, ...ORDER_COL.openTime)
  const iOrder      = colIdx(colMap, ...ORDER_COL.order)
  const iSym        = colIdx(colMap, ...ORDER_COL.symbol)
  const iType       = colIdx(colMap, ...ORDER_COL.type)
  const iVol        = colIdx(colMap, ...ORDER_COL.volume)
  const iOpenPrice  = colIdx(colMap, ...ORDER_COL.openPrice)
  const iSl         = colIdx(colMap, ...ORDER_COL.sl)
  const iTp         = colIdx(colMap, ...ORDER_COL.tp)
  const iCloseTime  = colIdx(colMap, ...ORDER_COL.closeTime)
  const iClosePrice = colIdx(colMap, ...ORDER_COL.closePrice)
  const iProfit     = colIdx(colMap, ...ORDER_COL.profit)
  const iComment    = colIdx(colMap, ...ORDER_COL.comment)

  const orders: RawOrder[] = []

  for (let rowIdx = 2; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]
    if (!row) continue
    const cells = extractCells(row)
    if (cells.length === 0) continue

    const rawOpenTime  = cell(cells, iOpenTime)
    const orderId      = cell(cells, iOrder)
    const symbol       = cell(cells, iSym)
    const orderType    = cell(cells, iType).toLowerCase()
    const volume       = cell(cells, iVol)
    const openPrice    = cell(cells, iOpenPrice)
    const stopLoss     = cell(cells, iSl)
    const takeProfit   = cell(cells, iTp)
    const rawCloseTime = cell(cells, iCloseTime)
    const closePrice   = cell(cells, iClosePrice) || null
    const profit       = cell(cells, iProfit)
    const comment      = cell(cells, iComment)

    // Skip rows that look like balance/summary entries
    if (!symbol || !orderId) continue

    const openTimeMs = parseMt5Date(rawOpenTime)
    const parseIssues: string[] = []
    if (!openTimeMs) parseIssues.push(`unparseable open time "${rawOpenTime}"`)

    if (parseIssues.length > 0) {
      errors.push({
        section: 'orders',
        rowIndex: rowIdx,
        rawContent: cells.join(' | '),
        reason: parseIssues.join('; '),
      })
      continue
    }

    const closeTimeMs = rawCloseTime ? parseMt5Date(rawCloseTime) : null

    orders.push({
      orderId,
      symbol,
      openTimeMs: openTimeMs as number,
      orderType,
      volumeLots: volume,
      openPrice,
      stopLoss: stopLoss || '0',
      takeProfit: takeProfit || '0',
      closeTimeMs: closeTimeMs ?? null,
      closePrice,
      profit,
      comment,
    })
  }

  return orders
}
