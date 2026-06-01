import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchAndStoreFund } from '@/lib/fund-fetch'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  let ticker, assetType
  try { ({ ticker, assetType } = await request.json()) } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })
  ticker = ticker.trim().toUpperCase()

  // Cache: si ya existe y es reciente, devolver directamente
  try {
    const { data: existing } = await sb().from('funds').select('*').eq('ticker', ticker).maybeSingle()
    if (existing && existing.current_price != null && existing.updated_at &&
        (Date.now() - new Date(existing.updated_at).getTime()) < 7 * 24 * 3600 * 1000) {
      return NextResponse.json({ fund: existing, source: 'cache' })
    }
  } catch {}

  const res = await fetchAndStoreFund(ticker, assetType)
  if (res.error) return NextResponse.json({ error: res.error.includes('No encontrado') ? 'No encontrado en Yahoo Finance — puedes introducir los datos manualmente' : res.error }, { status: res.error.includes('No encontrado') ? 404 : 500 })
  return NextResponse.json({ fund: res.fund, source: 'yahoo' })
}

// Guardar fondo manual
export async function PUT(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const { ticker, name, currency, current_price, annual_distribution, isin } = body
  if (!ticker || !name) return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })

  const record = {
    ticker: ticker.trim().toUpperCase(), name, asset_type: 'fund',
    currency: currency || 'EUR', current_price: current_price != null ? parseFloat(current_price) : null,
    yield_ttm: (annual_distribution && current_price) ? Math.round(parseFloat(annual_distribution) / parseFloat(current_price) * 1000) / 10 : null,
    distribution_history: annual_distribution ? [{ date: new Date().toISOString().slice(0, 10), amount: parseFloat(annual_distribution) }] : [],
    isin: isin || null,
    extra_data: { manual: true, annual_distribution: annual_distribution ? parseFloat(annual_distribution) : null },
    updated_at: new Date().toISOString(),
  }
  try {
    const { error } = await sb().from('funds').upsert(record, { onConflict: 'ticker' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ fund: record, source: 'manual' })
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 })
  }
}
