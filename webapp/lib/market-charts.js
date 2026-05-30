import { createClient } from '@supabase/supabase-js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const CACHE_TTL = {
  '1d':  2  * 3600 * 1000,
  '5d':  6  * 3600 * 1000,
  '1mo': 24 * 3600 * 1000,
  '3mo': 24 * 3600 * 1000,
  '1y':  24 * 3600 * 1000,
  '5y':  7  * 24 * 3600 * 1000,
}

const INTERVALS = {
  '1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '1y': '1d', '5y': '1wk',
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function fetchYahooChart(symbol, range) {
  const interval = INTERVALS[range] || '1d'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`)

  const json   = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(JSON.stringify(json?.chart?.error || 'sin datos'))

  const rawTs    = result.timestamp || []
  const rawClose = result.indicators?.quote?.[0]?.close || []
  const pts      = rawTs.map((ts, i) => ({ ts, c: rawClose[i] })).filter(p => p.c != null)

  return { timestamps: pts.map(p => p.ts), closes: pts.map(p => p.c) }
}

export async function getChartData(symbol, range = '1y') {
  const sb  = serviceClient()
  const ttl = CACHE_TTL[range] ?? CACHE_TTL['1y']

  const { data: cached } = await sb
    .from('market_charts')
    .select('data, fetched_at')
    .eq('symbol', symbol)
    .eq('range', range)
    .single()

  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity

  if (age < ttl && cached?.data) return cached.data

  const data = await fetchYahooChart(symbol, range)
  await sb.from('market_charts').upsert({ symbol, range, data, fetched_at: new Date().toISOString() })
  return data
}

// ── Estadísticas del índice (PER, yield, 52s min/max) ─────────────────────

async function fetchYahooStats(symbol) {
  const modules = 'summaryDetail,defaultKeyStatistics'
  const url = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) return null

  const json = await res.json()
  const result = json?.quoteSummary?.result?.[0]
  if (!result) return null

  const sd = result.summaryDetail        || {}
  const ks = result.defaultKeyStatistics || {}

  return {
    pe:             sd.trailingPE?.raw              ?? null,
    forwardPe:      sd.forwardPE?.raw               ?? null,
    dividendYield:  sd.dividendYield?.raw != null
                      ? parseFloat((sd.dividendYield.raw * 100).toFixed(2))
                      : null,
    week52Low:      sd.fiftyTwoWeekLow?.raw          ?? null,
    week52High:     sd.fiftyTwoWeekHigh?.raw         ?? null,
    beta:           ks.beta?.raw                     ?? null,
  }
}

export async function getIndexStats(symbol) {
  const sb = serviceClient()
  const TTL = 24 * 3600 * 1000

  const { data: cached } = await sb
    .from('market_stats')
    .select('data, fetched_at')
    .eq('symbol', symbol)
    .single()

  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity
  if (age < TTL && cached?.data) return cached.data

  const stats = await fetchYahooStats(symbol)
  if (!stats) return cached?.data ?? null

  await sb.from('market_stats').upsert({ symbol, data: stats, fetched_at: new Date().toISOString() })
  return stats
}

// ── Rentabilidades calculadas del histórico 5A ────────────────────────────

export function computeReturns(timestamps, closes) {
  if (!timestamps?.length || !closes?.length) return {}

  const nowSec  = Date.now() / 1000
  const current = closes[closes.length - 1]

  function closest(targetSec) {
    let idx = 0, best = Infinity
    for (let i = 0; i < timestamps.length; i++) {
      const d = Math.abs(timestamps[i] - targetSec)
      if (d < best) { best = d; idx = i }
    }
    return closes[idx]
  }

  function pct(from) {
    if (from == null || current == null || from === 0) return null
    return parseFloat(((current / from - 1) * 100).toFixed(2))
  }

  const jan1Sec = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000

  return {
    ytd: pct(closest(jan1Sec)),
    y1:  pct(closest(nowSec - 1   * 365.25 * 86400)),
    y3:  pct(closest(nowSec - 3   * 365.25 * 86400)),
    y5:  pct(closest(nowSec - 5   * 365.25 * 86400)),
  }
}
