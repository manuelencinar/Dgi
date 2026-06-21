// Operaciones de directivos (insiders) en vivo desde Yahoo Finance. Módulos:
//   netSharePurchaseActivity → resumen 6 meses (compras vs ventas de insiders)
//   insiderTransactions      → lista de operaciones individuales
// Cobertura real solo para EE. UU. (Europa devuelve resumen vacío sin transacciones).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const raw = v => (v && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null)

async function crumb() {
  const c = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, cache: 'no-store' })
  const a3 = (c.headers.get('set-cookie') || '').match(/A3=([^;]+)/)
  const cookie = a3 ? `A3=${a3[1]}` : ''
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  const cr = (await r.text()).trim()
  if (!cr || cr.includes('<')) throw new Error('crumb inválido')
  return { cr, cookie }
}

// Clasifica una transacción por su texto. Las compras/ventas en mercado abierto son
// la señal; ejercicios de opciones, grants y donaciones no cuentan como convicción.
function classify(text = '') {
  const t = text.toLowerCase()
  if (t.includes('purchase')) return 'buy'
  if (t.includes('sale')) return 'sell'
  return 'other'   // conversion, exercise, grant, award, gift, disposition (no mercado)
}
// Extrae el precio del texto "... at price 83.41 per share" (o un rango → media).
function priceFrom(text = '') {
  const nums = (text.match(/(\d+[.,]?\d*)/g) || []).map(s => Number(s.replace(',', '.'))).filter(n => n > 0)
  if (!nums.length) return null
  return nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0]
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

export async function getInsiders(ticker) {
  let cr, cookie
  try { ({ cr, cookie } = await crumb()) } catch { return null }
  const mods = 'netSharePurchaseActivity,insiderTransactions'
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${mods}&crumb=${encodeURIComponent(cr)}`
  let r
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
    if (!res.ok) return null
    r = (await res.json())?.quoteSummary?.result?.[0]
  } catch { return null }
  if (!r) return null

  // Lista de transacciones normalizada y ordenada por fecha desc.
  const tx = (r.insiderTransactions?.transactions || []).map(t => {
    const kind = classify(t.transactionText)
    const ms = raw(t.startDate) != null ? raw(t.startDate) * 1000 : (t.startDate?.fmt ? Date.parse(t.startDate.fmt) : null)
    return {
      name: t.filerName || '—',
      relation: t.filerRelation || '',
      kind, shares: raw(t.shares), value: raw(t.value),
      price: priceFrom(t.transactionText),
      date: t.startDate?.fmt || (ms ? new Date(ms).toISOString().slice(0, 10) : null),
      ms,
    }
  }).filter(t => t.date)

  if (!tx.length && !r.netSharePurchaseActivity) return null

  // Net 12 meses, solo operaciones de mercado (buy/sell), por convicción real.
  const now = Date.now()
  const last12 = tx.filter(t => t.ms != null && now - t.ms <= YEAR_MS && (t.kind === 'buy' || t.kind === 'sell'))
  const buys = last12.filter(t => t.kind === 'buy'), sells = last12.filter(t => t.kind === 'sell')
  const sumV = arr => arr.reduce((s, t) => s + (t.value || 0), 0)
  const buyValue = sumV(buys), sellValue = sumV(sells)
  const buyers = new Set(buys.map(t => t.name)).size
  const sellers = new Set(sells.map(t => t.name)).size
  let verdict = 'neutral'
  if (buys.length && buyValue >= sellValue * 1.2) verdict = 'compradores'
  else if (sells.length && sellValue >= buyValue * 1.2) verdict = 'vendedores'
  else if (buys.length || sells.length) verdict = 'mixto'

  const a = r.netSharePurchaseActivity
  const summary6m = a ? {
    period: a.period || '6m',
    buyCount: raw(a.buyInfoCount), buyShares: raw(a.buyInfoShares),
    sellCount: raw(a.sellInfoCount), sellShares: raw(a.sellInfoShares),
    netCount: raw(a.netInfoCount), netShares: raw(a.netInfoShares),
    netPct: raw(a.netPercentInsiderShares),
  } : null

  return {
    summary6m,
    net12m: { buyers, sellers, buyValue, sellValue, netValue: buyValue - sellValue, buyCount: buys.length, sellCount: sells.length, verdict },
    transactions: tx.slice(0, 12),
    hasData: tx.length > 0 || (summary6m && (summary6m.buyCount || summary6m.sellCount)),
  }
}
