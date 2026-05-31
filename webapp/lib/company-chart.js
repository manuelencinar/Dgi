import { createClient } from '@supabase/supabase-js'

const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const CACHE_TTL = { '1mo': 24*3600*1000, '3mo': 24*3600*1000, '1y': 24*3600*1000, '5y': 7*24*3600*1000 }
const INTERVALS = { '1mo': '1d', '3mo': '1d', '1y': '1d', '5y': '1wk' }

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

async function fetchYahoo(ticker, range) {
  const interval = INTERVALS[range] || '1d'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=${range}&interval=${interval}&includeAdjustedClose=true&includePrePost=false`

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
export async function getCompanyChartData(ticker, range = '1y') {
  const client   = sb()
  const rangeKey = `chart-${range}`
  const ttl      = CACHE_TTL[range] ?? CACHE_TTL['1y']

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
