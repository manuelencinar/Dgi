import { createClient } from '@supabase/supabase-js'

const TTL = 2 * 3600 * 1000
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export async function getCompanyQuote(ticker) {
  const client = sb()

  const { data: cached } = await client
    .from('market_charts')
    .select('data, fetched_at')
    .eq('symbol', ticker)
    .eq('range', 'quote')
    .single()

  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity
  if (age < TTL && cached?.data) return cached.data

  try {
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, cache: 'no-store' })
    const setCookie = cookieRes.headers.get('set-cookie') || ''
    const a3Match   = setCookie.match(/A3=([^;]+)/)
    const cookie    = a3Match ? `A3=${a3Match[1]}` : ''

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store',
    })
    const crumb = (await crumbRes.text()).trim()
    if (!crumb || crumb.includes('<')) throw new Error('crumb inválido')

    const fields = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,currency'
    const url    = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=${fields}&crumb=${encodeURIComponent(crumb)}`
    const res    = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Yahoo ${res.status}`)

    const json = await res.json()
    const r    = json?.quoteResponse?.result?.[0]
    if (!r) return cached?.data ?? null

    const quote = {
      price:  r.regularMarketPrice          ?? null,
      change: r.regularMarketChange         ?? null,
      pct:    r.regularMarketChangePercent  ?? null,
      cur:    r.currency                    ?? '',
    }

    await client.from('market_charts').upsert({
      symbol: ticker, range: 'quote',
      data: quote, fetched_at: new Date().toISOString(),
    })
    return quote
  } catch {
    return cached?.data ?? null
  }
}
