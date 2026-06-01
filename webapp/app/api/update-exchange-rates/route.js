import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const PAIRS = [
  'USD','GBP','JPY','CHF','CAD','AUD',
  'SEK','DKK','NOK','HKD','CNY','SGD',
  'NZD','MXN','BRL','KRW','TWD','INR',
  'ZAR','SAR','AED','PLN','CZK','HUF',
]

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function fetchRates(currency) {
  const ticker = encodeURIComponent(`${currency}EUR=X`)
  const url    = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=7d&interval=1d`
  try {
    const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!res.ok) return []
    const json   = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return []
    const timestamps = result.timestamp || []
    const closes     = result.indicators?.quote?.[0]?.close || []
    return timestamps
      .map((ts, i) => ({
        base_currency:  currency,
        quote_currency: 'EUR',
        rate:           closes[i] != null ? Math.round(closes[i] * 1000000) / 1000000 : null,
        date:           new Date(ts * 1000).toISOString().slice(0, 10),
      }))
      .filter(r => r.rate != null && r.rate > 0)
  } catch { return [] }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = sb()
  let   total    = 0
  const errors   = []

  for (const currency of PAIRS) {
    const rows = await fetchRates(currency)
    if (!rows.length) { errors.push(currency); continue }
    const { error } = await supabase
      .from('exchange_rates')
      .upsert(rows, { onConflict: 'base_currency,quote_currency,date' })
    if (error) { errors.push(currency); continue }
    total += rows.length
  }

  return NextResponse.json({
    ok:     true,
    pairs:  PAIRS.length - errors.length,
    rows:   total,
    errors: errors.length ? errors : undefined,
  })
}
