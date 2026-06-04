import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

// Devuelve precios frescos para una lista de tickers. Sirve desde daily_prices;
// los tickers desactualizados se refrescan de Yahoo (una sola llamada bulk) y
// se archivan en daily_prices. Pensado para la cartera, que necesita el precio
// actual de sus posiciones sin tener que visitar cada ficha.

const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const FRESH_DAYS = 2

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function yahooCreds() {
  const c  = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, cache: 'no-store' })
  const sc = c.headers.get('set-cookie') || ''
  const a3 = sc.match(/A3=([^;]+)/)
  const cookie = a3 ? `A3=${a3[1]}` : ''
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  const crumb = (await r.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('crumb inválido')
  return { cookie, crumb }
}

async function quoteBatch(tickers, cookie, crumb) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers.join(','))}` +
    `&fields=regularMarketPrice,regularMarketTime,currency&crumb=${encodeURIComponent(crumb)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie }, cache: 'no-store' })
  if (!res.ok) return {}
  const j = await res.json()
  const out = {}
  for (const r of (j?.quoteResponse?.result || [])) {
    if (r.regularMarketPrice != null) out[r.symbol] = { price: r.regularMarketPrice, time: r.regularMarketTime }
  }
  return out
}

export async function POST(request) {
  let tickers = []
  try { ({ tickers } = await request.json()) } catch {}
  tickers = [...new Set((tickers || []).filter(Boolean))]
  if (!tickers.length) return NextResponse.json({ prices: {} })

  const admin    = sb()
  const today    = new Date().toISOString().slice(0, 10)
  const since    = new Date(); since.setDate(since.getDate() - 7)

  // Último precio por ticker desde daily_prices
  const { data: rows } = await admin
    .from('daily_prices')
    .select('ticker, close_price, date')
    .in('ticker', tickers)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: false })

  const latest = {}
  for (const r of (rows || [])) {
    if (!latest[r.ticker]) latest[r.ticker] = { price: Number(r.close_price), date: r.date }
  }

  // Tickers sin precio o con precio de hace más de FRESH_DAYS
  const stale = tickers.filter(t => {
    const l = latest[t]
    if (!l) return true
    const age = Math.round((new Date(today) - new Date(l.date)) / 86400000)
    return age > FRESH_DAYS
  })

  if (stale.length) {
    try {
      const { cookie, crumb } = await yahooCreds()
      const quotes = {}
      for (let i = 0; i < stale.length; i += 100) {
        Object.assign(quotes, await quoteBatch(stale.slice(i, i + 100), cookie, crumb))
      }
      const now = new Date().toISOString()
      const upserts = []
      for (const [t, q] of Object.entries(quotes)) {
        const date  = q.time ? new Date(q.time * 1000).toISOString().slice(0, 10) : today
        const price = Math.round(q.price * 10000) / 10000
        latest[t] = { price, date }
        upserts.push({ ticker: t, date, close_price: price, updated_at: now })
      }
      if (upserts.length) await admin.from('daily_prices').upsert(upserts, { onConflict: 'ticker,date' })
    } catch { /* si Yahoo falla, devolvemos lo que haya en daily_prices */ }
  }

  return NextResponse.json({ prices: latest })
}
