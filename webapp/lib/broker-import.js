// Importación de movimientos de bróker (ING de momento). Lógica pura: recibe la
// hoja ya parseada (array de arrays, p. ej. de SheetJS) + el DICT, y devuelve los
// movimientos normalizados, emparejados con un ticker y con la comisión derivada.
// El parseo del fichero .xls (SheetJS) vive en el componente cliente.
import { DICT } from '@/data/dict'

// ── Mercado ING → sufijo de ticker + divisa ────────────────────────────────
const MARKET_MAP = {
  'NYSE': { suffix: '', currency: 'USD' },
  'NASDAQ': { suffix: '', currency: 'USD' },
  'NYSE ARCA': { suffix: '', currency: 'USD' },
  'AMEX': { suffix: '', currency: 'USD' },
  'XETRA': { suffix: '.DE', currency: 'EUR' },
  'BOLSA FRANCFORT': { suffix: '.DE', currency: 'EUR' },
  'BOLSA PARIS': { suffix: '.PA', currency: 'EUR' },
  'EURONEXT PARIS': { suffix: '.PA', currency: 'EUR' },
  'M.CONTINUO': { suffix: '.MC', currency: 'EUR' },
  'MERCADO CONTINUO': { suffix: '.MC', currency: 'EUR' },
  'BOLSA MADRID': { suffix: '.MC', currency: 'EUR' },
  'BOLSA AMSTERDAM': { suffix: '.AS', currency: 'EUR' },
  'EURONEXT AMSTERDAM': { suffix: '.AS', currency: 'EUR' },
  'BOLSA BRUSELAS': { suffix: '.BR', currency: 'EUR' },
  'EURONEXT BRUSELAS': { suffix: '.BR', currency: 'EUR' },
  'BOLSA LISBOA': { suffix: '.LS', currency: 'EUR' },
  'EURONEXT LISBOA': { suffix: '.LS', currency: 'EUR' },
  'BOLSA MILANO': { suffix: '.MI', currency: 'EUR' },
  'BORSA ITALIANA': { suffix: '.MI', currency: 'EUR' },
  'BOLSA ITALIA': { suffix: '.MI', currency: 'EUR' },
  'LONDRES': { suffix: '.L', currency: 'GBP' },
  'BOLSA LONDRES': { suffix: '.L', currency: 'GBP' },
  'LSE': { suffix: '.L', currency: 'GBP' },
  'SUIZA': { suffix: '.SW', currency: 'CHF' },
  'BOLSA SUIZA': { suffix: '.SW', currency: 'CHF' },
  'SIX': { suffix: '.SW', currency: 'CHF' },
}

export function marketInfo(market) {
  return MARKET_MAP[String(market || '').trim().toUpperCase()] || null
}

// Alias curados ING (nombre normalizado → ticker) para nombres que el emparejador
// difuso no acierta (umlauts ae/oe/ue, nombres comerciales, etc.).
const ALIASES = {
  'MUENCHENER RUECKVERSICHERUNG': 'MUV2.DE',
  'MUENCHENER RUECK': 'MUV2.DE',
  'LOUIS VUITTON MOET HENNESSY': 'MC.PA',
  'LVMH MOET HENNESSY LOUIS VUITTON': 'MC.PA',
  'REDEIA': 'RED.MC',
  'RED ELECTRICA': 'RED.MC',
  'AENA': 'AENA.MC',
  'INDITEX': 'ITX.MC',
  'INDUSTRIA DE DISENO TEXTIL': 'ITX.MC',
  'AIRBUS': 'AIR.PA',
  'VINCI': 'DG.PA',
  'SANOFI': 'SAN.PA',
  'LOWES COMPANIES': 'LOW',
  'MCDONALDS': 'MCD',
  'MAIN STREET CAPITAL': 'MAIN',
  'MICROSOFT': 'MSFT',
  'ADOBE': 'ADBE',
}

// Palabras corporativas a eliminar al normalizar nombres de empresa.
const STOP = new Set(['SA','INC','CORP','CORPORATION','PLC','NV','SE','AG','LTD','LIMITED',
  'CO','COMPANY','GROUP','GROUPE','HOLDING','HOLDINGS','THE','SPA','OYJ','ASA','AB','KGAA',
  'CLASE','CLASS','REIT','TRUST'])

export function normName(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita acentos/umlauts
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/).filter(w => w && !STOP.has(w)).join(' ')
    .trim()
}

// Variante que reduce dígrafos alemanes (ue→u, oe→o, ae→a, ss→s) para casar
// "MUENCHENER" (ING) con "MUNCHEN" (Yahoo) sin alias.
function normGerman(s) {
  return normName(s).replace(/UE/g, 'U').replace(/OE/g, 'O').replace(/AE/g, 'A').replace(/SS/g, 'S')
}

// Índice del DICT por país (sufijo) → [{ ticker, name, currency, words, wordsDe }].
let _index = null
function dictIndex() {
  if (_index) return _index
  _index = DICT.map(([name, ticker, country, currency]) => ({
    name, ticker, country, currency,
    n: normName(name), de: normGerman(name),
  }))
  return _index
}

// Sufijo del ticker (lo que va tras el punto), '' para tickers de EE. UU.
function tickerSuffix(ticker) {
  const i = ticker.indexOf('.')
  return i === -1 ? '' : ticker.slice(i)
}

function jaccard(aWords, bWords) {
  if (!aWords.length || !bWords.length) return 0
  const A = new Set(aWords), B = new Set(bWords)
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

// Empareja (nombre ING, mercado) con un ticker del DICT. Devuelve
// { ticker, name, currency, confidence } o null si no hay match razonable.
export function matchSecurity(ingName, market) {
  const idx = dictIndex()
  const mi = marketInfo(market)
  const suffix = mi ? mi.suffix : null
  const target = normName(ingName)
  const targetDe = normGerman(ingName)

  // 1. Alias curado (validado contra el DICT).
  const aliasTk = ALIASES[target] || ALIASES[targetDe]
  if (aliasTk) {
    const hit = idx.find(d => d.ticker === aliasTk)
    if (hit) return { ticker: hit.ticker, name: hit.name, currency: hit.currency, confidence: 'alta' }
  }

  // Candidatos del mismo mercado (mismo sufijo); si el mercado no se reconoce, todo el DICT.
  const pool = suffix != null ? idx.filter(d => tickerSuffix(d.ticker) === suffix) : idx
  const cands = pool.length ? pool : idx

  // 2. Coincidencia exacta del nombre normalizado (directa o variante alemana).
  let exact = cands.find(d => d.n === target || d.de === targetDe)
  if (exact) return { ticker: exact.ticker, name: exact.name, currency: exact.currency, confidence: 'alta' }

  // 3. Difuso: solapamiento de palabras (Jaccard) + bonus por prefijo.
  const tWords = target.split(' ').filter(Boolean)
  const tDeWords = targetDe.split(' ').filter(Boolean)
  let best = null, bestScore = 0
  for (const d of cands) {
    let score = Math.max(jaccard(tWords, d.n.split(' ')), jaccard(tDeWords, d.de.split(' ')))
    // bonus si una empieza por la otra (p. ej. "SANOFI" vs "SANOFI AVENTIS")
    if (d.n.startsWith(target) || target.startsWith(d.n) || d.de.startsWith(targetDe) || targetDe.startsWith(d.de)) score += 0.25
    if (score > bestScore) { bestScore = score; best = d }
  }
  if (best && bestScore >= 0.5) {
    return { ticker: best.ticker, name: best.name, currency: best.currency, confidence: bestScore >= 0.8 ? 'alta' : 'media' }
  }
  return null
}

// ── Parseo de la hoja ING (array de arrays) ─────────────────────────────────
const OP_MAP = { 'COMPRA': 'buy', 'VENTA': 'sell', 'DIVIDENDO': 'dividend' }

function parseDate(v) {
  // ING: 'DD/MM/YYYY'. SheetJS con raw puede dar también un Date.
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

const num = v => { const n = Number(String(v).replace(',', '.')); return isNaN(n) ? null : n }

// Localiza, en la fila de cabecera, el índice de cada columna por su texto.
function locateColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = [...(rows[r] || [])].map(c => normName(c))
    const find = (...keys) => cells.findIndex(c => keys.some(k => c.includes(k)))
    const idxDate = find('FECHA')
    const idxOp = find('OPERACION')
    if (idxDate !== -1 && idxOp !== -1) {
      return {
        headerRow: r,
        date: idxDate, op: idxOp,
        valor: find('VALOR'), mercado: find('MERCADO'),
        titulos: find('TITULOS'), precio: find('PRECIO'),
        importe: find('IMPORTE'),
      }
    }
  }
  return null
}

// Devuelve los movimientos crudos (sin emparejar todavía) desde el array de arrays.
export function parseIngRows(rows) {
  const col = locateColumns(rows)
  if (!col) return { error: 'No se reconoce el formato de ING (no se encuentra la cabecera FECHA/OPERACIÓN).', movements: [] }
  const movements = []
  for (let r = col.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const op = OP_MAP[normName(row[col.op])]
    if (!op) continue
    const date = parseDate(row[col.date])
    const ingName = String(row[col.valor] || '').trim()
    if (!date || !ingName) continue
    movements.push({
      date, type: op,
      ingName, market: String(row[col.mercado] || '').trim(),
      shares: num(row[col.titulos]),
      priceOrig: num(row[col.precio]),
      totalEur: num(row[col.importe]),
    })
  }
  return { movements }
}

// ── Emparejado + comisiones + dedup ─────────────────────────────────────────
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100
const r4 = n => Math.round((n + Number.EPSILON) * 10000) / 10000

// Calcula precio para la app, comisión, importe original y tipo de cambio según
// la divisa. Reutilizable cuando el usuario corrige el ticker en la previsualización.
export function computeFinancials(m, currency) {
  const shares = m.shares || 0
  let price = m.priceOrig, commission = null
  let amountOriginal = shares && m.priceOrig != null ? r2(shares * m.priceOrig) : m.totalEur
  let exchangeRate = 1

  if (m.type !== 'dividend' && shares > 0 && m.priceOrig != null && m.totalEur != null) {
    if (currency === 'EUR') {
      // Comisión derivable: |títulos×precio − importe total|. La incluimos en el
      // precio efectivo (compra: sumada; venta: descontada) → coste medio real.
      const gross = shares * m.priceOrig
      commission = r2(Math.abs(m.totalEur - gross))
      price = r4(m.totalEur / shares)   // precio efectivo (comisión incluida)
      amountOriginal = r2(m.totalEur)
      exchangeRate = 1
    } else {
      // Divisa extranjera: el precio está en divisa origen y el total en €.
      // No se puede separar comisión del cambio → tipo de cambio efectivo.
      price = r4(m.priceOrig)
      amountOriginal = r2(shares * m.priceOrig)
      exchangeRate = amountOriginal > 0 ? r4(m.totalEur / amountOriginal) : 1
      commission = null
    }
  }
  return { price, commission, commissionCur: currency, amountOriginal, exchangeRate }
}

// Enriquece cada movimiento con ticker, divisa, precio para la app y comisión.
export function buildImportRows(movements) {
  return movements.map((m, i) => {
    const match = matchSecurity(m.ingName, m.market)
    const mi = marketInfo(m.market)
    const currency = match?.currency || mi?.currency || 'EUR'
    const fin = computeFinancials(m, currency)
    return {
      id: i,
      date: m.date, type: m.type,
      ingName: m.ingName, market: m.market,
      ticker: match?.ticker || null,
      matchedName: match?.name || null,
      confidence: match?.confidence || 'sin',
      currency, shares: m.shares || 0,
      priceOrig: m.priceOrig, totalEur: m.totalEur,
      ...fin,
      include: true,   // el usuario puede desmarcar en la previsualización
    }
  })
}

// Firma para deduplicar contra lo ya importado.
export function rowSignature(type, ticker, date, shares, amountEur) {
  const t = type === 'dividend' ? 'div' : type
  return `${date}|${t}|${ticker}|${r2(shares || 0)}|${r2(amountEur || 0)}`
}

// Firmas de las transacciones y dividendos ya existentes en la BD del usuario.
export function existingSignatures(transactions = [], dividends = []) {
  const sigs = new Set()
  for (const tx of transactions) {
    const eur = tx.total_cost_base_currency ?? tx.total_cost ?? (tx.amount_original ?? 0)
    sigs.add(rowSignature(tx.type, tx.ticker, tx.date, tx.shares, eur))
  }
  for (const d of dividends) {
    sigs.add(rowSignature('dividend', d.ticker, d.date, d.shares_received ?? 0, d.amount))
  }
  return sigs
}
