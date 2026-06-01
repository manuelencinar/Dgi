import { createClient } from '@supabase/supabase-js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const raw = v => (v && typeof v === 'object' && 'raw' in v) ? v.raw : (typeof v === 'number' ? v : null)
export const isISIN = s => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)

async function crumb() {
  const c = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, cache: 'no-store' })
  const a3 = (c.headers.get('set-cookie') || '').match(/A3=([^;]+)/)
  const cookie = a3 ? `A3=${a3[1]}` : ''
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  const cr = (await r.text()).trim()
  if (!cr || cr.includes('<')) throw new Error('crumb inválido')
  return { cr, cookie }
}

async function searchSymbol(query, cookie, preferType) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
    if (!res.ok) return null
    const j = await res.json()
    const quotes = (j?.quotes || []).filter(q => q.symbol)
    if (!quotes.length) return null
    const want = preferType === 'fund' ? 'MUTUALFUND' : preferType === 'etf' ? 'ETF' : null
    const match = (want && quotes.find(q => q.quoteType === want)) || quotes[0]
    return match?.symbol || null
  } catch { return null }
}

async function fetchQuoteSummary(symbol, cr, cookie) {
  const modules = 'price,summaryDetail,fundProfile,defaultKeyStatistics'
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(cr)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  if (!res.ok) return null
  const j = await res.json()
  return j?.quoteSummary?.result?.[0] || null
}

// Descarga un ETF/fondo de Yahoo (resolviendo ISIN si hace falta) y lo guarda en funds.
// Devuelve { fund } o { error }.
export async function fetchAndStoreFund(inputTicker, assetType = 'etf') {
  const ticker = (inputTicker || '').trim().toUpperCase()
  if (!ticker) return { error: 'Falta el ticker' }
  const type = assetType === 'fund' ? 'fund' : 'etf'

  try {
    const { cr, cookie } = await crumb()

    const inputIsIsin = isISIN(ticker)
    let symbol = ticker
    const isin = inputIsIsin ? ticker : null
    if (inputIsIsin) {
      const resolved = await searchSymbol(ticker, cookie, type)
      if (resolved) symbol = resolved
    }

    let r = await fetchQuoteSummary(symbol, cr, cookie)
    if (!r) {
      const resolved = await searchSymbol(ticker, cookie, type)
      if (resolved && resolved !== symbol) { symbol = resolved; r = await fetchQuoteSummary(symbol, cr, cookie) }
    }
    if (!r) return { error: 'No encontrado en Yahoo Finance' }

    const price = r.price || {}, sd = r.summaryDetail || {}, fp = r.fundProfile || {}, ks = r.defaultKeyStatistics || {}
    const detectedType = price.quoteType === 'MUTUALFUND' ? 'fund' : price.quoteType === 'ETF' ? 'etf' : type
    const currentPrice = raw(price.regularMarketPrice)
    const currency = price.currency || sd.currency || 'USD'
    const name = price.longName || price.shortName || symbol
    const ter = raw(fp.feesExpensesInvestment?.annualReportExpenseRatio) != null
      ? raw(fp.feesExpensesInvestment.annualReportExpenseRatio) * 100
      : (raw(ks.annualReportExpenseRatio) != null ? raw(ks.annualReportExpenseRatio) * 100 : null)

    let distHistory = []
    try {
      const chUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=div`
      const ch = await (await fetch(chUrl, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })).json()
      const divs = ch?.chart?.result?.[0]?.events?.dividends || {}
      distHistory = Object.values(divs).map(d => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount })).sort((a, b) => a.date.localeCompare(b.date))
    } catch {}

    let yieldTtm = null
    if (currentPrice && distHistory.length) {
      const cutoff = Date.now() - 365 * 24 * 3600 * 1000
      const ttm = distHistory.filter(d => new Date(d.date).getTime() >= cutoff).reduce((s, d) => s + d.amount, 0)
      if (ttm > 0) yieldTtm = Math.round(ttm / currentPrice * 1000) / 10
    }
    if (yieldTtm == null && raw(sd.yield) != null) yieldTtm = Math.round(raw(sd.yield) * 1000) / 10

    const record = {
      ticker: symbol, name, asset_type: detectedType, currency, country: null,
      current_price: currentPrice,
      ter: ter != null ? Math.round(ter * 1000) / 1000 : null,
      yield_ttm: yieldTtm, distribution_history: distHistory,
      benchmark: null, category: fp.categoryName || null, manager: fp.family || null, isin,
      updated_at: new Date().toISOString(),
    }

    const { error } = await sb().from('funds').upsert(record, { onConflict: 'ticker' })
    if (error) return { error: `No se pudo guardar el fondo: ${error.message}` }
    return { fund: record }
  } catch (e) {
    return { error: String(e.message || e) }
  }
}
