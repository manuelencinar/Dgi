// Estimaciones de analistas (ingresos + BPA) en vivo desde el módulo earningsTrend
// de Yahoo. Cubre MUCHAS empresas fuera de EE. UU. (donde FMP free no llega). Devuelve
// la MISMA forma que normalizeFmp → [{year, revenue, eps, analysts}], para que
// buildEstimateSeries las combine igual con el histórico real.
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

const yearOf = ed => {
  const s = typeof ed === 'string' ? ed : ed?.fmt
  const y = s ? parseInt(String(s).slice(0, 4)) : null
  return (y && y > 1990 && y < 2100) ? y : null
}

export async function fetchYahooEstimates(ticker) {
  let cr, cookie
  try { ({ cr, cookie } = await crumb()) } catch { return null }
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=earningsTrend&crumb=${encodeURIComponent(cr)}`
  let trend
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
    if (!res.ok) return null
    trend = (await res.json())?.quoteSummary?.result?.[0]?.earningsTrend?.trend
  } catch { return null }
  if (!Array.isArray(trend)) return null

  const out = []
  for (const t of trend) {
    if (t.period !== '0y' && t.period !== '+1y') continue   // estimaciones ANUALES (año en curso + siguiente)
    const year = yearOf(t.endDate)
    if (!year) continue
    const revenue = raw(t.revenueEstimate?.avg)
    const eps = raw(t.earningsEstimate?.avg)
    const analysts = raw(t.earningsEstimate?.numberOfAnalysts)
    if (revenue == null && eps == null) continue
    out.push({ year, revenue, eps, analysts })
  }
  return out.length ? out : null
}
