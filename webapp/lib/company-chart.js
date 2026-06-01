import { createClient } from '@supabase/supabase-js'

const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
// Rango nativo de Yahoo cuando existe (más fiable). 3A no tiene equivalente nativo.
const RANGE_NATIVE   = { '1M': '1mo', '3M': '3mo', '6M': '6mo', '1A': '1y', '5A': '5y' }
const RANGE_DAYS     = { '1M': 35, '3M': 95, '6M': 190, '1A': 370, '3A': 1100, '5A': 1830 }
const RANGE_INTERVAL = { '1M': '1d', '3M': '1d', '6M': '1d', '1A': '1d', '3A': '1wk', '5A': '1wk' }
const CACHE_TTL      = { '1M': 24*3600*1000, '3M': 24*3600*1000, '6M': 24*3600*1000, '1A': 24*3600*1000, '3A': 7*24*3600*1000, '5A': 7*24*3600*1000 }

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

async function fetchYahoo(ticker, range) {
  const interval = RANGE_INTERVAL[range] || '1d'
  const native   = RANGE_NATIVE[range]

  // Rango nativo (1mo/3mo/6mo/1y/5y) cuando existe; period1/period2 solo para 3A
  let query
  if (native) {
    query = `range=${native}&interval=${interval}`
  } else {
    const days    = RANGE_DAYS[range] || 1100
    const period2 = Math.floor(Date.now() / 1000)
    const period1 = period2 - days * 86400
    query = `period1=${period1}&period2=${period2}&interval=${interval}`
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?${query}&includeAdjustedClose=true&includePrePost=false`

  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`)

  const json   = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(JSON.stringify(json?.chart?.error || 'sin datos'))

  const rawTs    = result.timestamp || []
  const rawClose = result.indicators?.quote?.[0]?.close || []
  const rawAdj   = result.indicators?.adjclose?.[0]?.adjclose || []

  const pts = rawTs
    .map((ts, i) => ({ ts, c: rawClose[i] ?? null, adj: rawAdj[i] ?? null }))
    .filter(p => p.c != null)

  return {
    timestamps: pts.map(p => p.ts),
    closes:     pts.map(p => p.c),
    adjCloses:  pts.map(p => p.adj ?? p.c),
  }
}

// Clave separada (chart-1y, chart-5y...) para no colisionar con market_charts de índices
export async function getCompanyChartData(ticker, range = '1A') {
  const client   = sb()
  const rangeKey = `chart-${range}`
  const ttl      = CACHE_TTL[range] ?? CACHE_TTL['1A']

  const { data: cached } = await client
    .from('market_charts')
    .select('data, fetched_at')
    .eq('symbol', ticker)
    .eq('range', rangeKey)
    .single()

  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity
  if (age < ttl && cached?.data) return cached.data

  const data = await fetchYahoo(ticker, range)
  await client.from('market_charts').upsert({
    symbol: ticker, range: rangeKey,
    data, fetched_at: new Date().toISOString(),
  })
  return data
}
