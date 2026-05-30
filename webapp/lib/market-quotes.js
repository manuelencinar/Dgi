import { createClient } from '@supabase/supabase-js'
import { MARKETS } from '@/lib/markets'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 horas

const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const FIELDS = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,marketState,currency'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function fetchFromYahoo() {
  // 1. Cookie de sesión
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    cache: 'no-store',
  })
  const setCookie = cookieRes.headers.get('set-cookie') || ''
  const a3Match   = setCookie.match(/A3=([^;]+)/)
  const cookie    = a3Match ? `A3=${a3Match[1]}` : ''

  // 2. Crumb
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
    cache: 'no-store',
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('crumb inválido')

  // 3. Batch quote
  const symbols = MARKETS.map(m => m.symbol).join(',')
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${FIELDS}&crumb=${encodeURIComponent(crumb)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Yahoo v7: ${res.status}`)

  const data    = await res.json()
  const results = data?.quoteResponse?.result
  if (!Array.isArray(results)) throw new Error(JSON.stringify(data?.quoteResponse?.error || 'sin resultado'))

  const quotes = {}
  for (const r of results) {
    quotes[r.symbol] = {
      price:  r.regularMarketPrice           ?? null,
      change: r.regularMarketChange          ?? null,
      pct:    r.regularMarketChangePercent   ?? null,
      prev:   r.regularMarketPreviousClose   ?? null,
      state:  r.marketState                  ?? 'CLOSED',
      cur:    r.currency                     ?? '',
    }
  }
  return quotes
}

// Lee de Supabase; si los datos son más viejos que 24h, refresca desde Yahoo.
export async function getMarketQuotes() {
  const sb = serviceClient()

  // Leer caché
  const { data: cached } = await sb
    .from('market_cache')
    .select('quotes, fetched_at')
    .eq('id', 1)
    .single()

  const cacheAge = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity

  if (cacheAge < CACHE_TTL_MS) {
    return {
      quotes:    cached.quotes,
      ts:        new Date(cached.fetched_at).getTime(),
      fromCache: true,
    }
  }

  // Caché expirada o vacía → pedir a Yahoo
  try {
    const quotes = await fetchFromYahoo()
    const now    = new Date().toISOString()

    await sb.from('market_cache').upsert({ id: 1, quotes, fetched_at: now })

    return { quotes, ts: Date.now(), fromCache: false }
  } catch (e) {
    // Si Yahoo falla pero tenemos datos viejos, los devolvemos
    if (cached?.quotes) {
      return {
        quotes:    cached.quotes,
        ts:        new Date(cached.fetched_at).getTime(),
        fromCache: true,
        stale:     true,
      }
    }
    throw e
  }
}
