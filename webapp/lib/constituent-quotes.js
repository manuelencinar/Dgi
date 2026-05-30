import { createClient } from '@supabase/supabase-js'

const TTL        = 24 * 3600 * 1000   // 24 h
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const FIELDS     = 'regularMarketPrice,regularMarketChangePercent,currency'
const BATCH_SIZE = 100
const RANGE_KEY  = 'constituents'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

async function getYahooCreds() {
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA }, cache: 'no-store',
  })
  const setCookie = cookieRes.headers.get('set-cookie') || ''
  const a3Match   = setCookie.match(/A3=([^;]+)/)
  const cookie    = a3Match ? `A3=${a3Match[1]}` : ''

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store',
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('crumb inválido')
  return { cookie, crumb }
}

async function fetchBatch(tickers, cookie, crumb) {
  const symbols = tickers.join(',')
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${FIELDS}&crumb=${encodeURIComponent(crumb)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Yahoo v7: ${res.status}`)
  const data    = await res.json()
  const results = data?.quoteResponse?.result || []
  const out     = {}
  for (const r of results) {
    out[r.symbol] = {
      price: r.regularMarketPrice          ?? null,
      pct:   r.regularMarketChangePercent  ?? null,
      cur:   r.currency                    ?? '',
    }
  }
  return out
}

// Returns { [ticker]: { price, pct, cur } } – cached 24h in market_charts table
export async function getConstituentQuotes(indexSymbol, tickers) {
  if (!tickers.length) return {}
  const sb = serviceClient()

  const { data: cached } = await sb
    .from('market_charts')
    .select('data, fetched_at')
    .eq('symbol', indexSymbol)
    .eq('range', RANGE_KEY)
    .single()

  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity
  if (age < TTL && cached?.data) return cached.data

  try {
    const { cookie, crumb } = await getYahooCreds()
    const quotes = {}
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE)
      Object.assign(quotes, await fetchBatch(batch, cookie, crumb))
    }
    await sb.from('market_charts').upsert({
      symbol: indexSymbol, range: RANGE_KEY,
      data: quotes, fetched_at: new Date().toISOString(),
    })
    return quotes
  } catch {
    return cached?.data ?? {}
  }
}
