import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FREE_WATCHLIST_LIMIT } from '@/lib/watchlist'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, isPremium: false }
  let isPremium = user.email === ADMIN_EMAIL
  if (!isPremium) {
    const { data } = await supabase.from('user_settings').select('plan, premium_until').eq('user_id', user.id).maybeSingle()
    if (data?.plan === 'premium') {
      isPremium = !data.premium_until || new Date(data.premium_until) >= new Date()
    }
  }
  return { supabase, user, isPremium }
}

// Campos que el cliente puede escribir.
function pickFields(body) {
  const out = {}
  if (body.target_price !== undefined) out.target_price = body.target_price === '' || body.target_price == null ? null : Number(body.target_price)
  if (body.target_yield !== undefined) out.target_yield = body.target_yield === '' || body.target_yield == null ? null : Number(body.target_yield)
  if (body.notes !== undefined) out.notes = body.notes ? String(body.notes).slice(0, 500) : null
  if (body.alert_price_active !== undefined) out.alert_price_active = !!body.alert_price_active
  if (body.alert_yield_active !== undefined) out.alert_yield_active = !!body.alert_yield_active
  if (body.alert_buyzone_active !== undefined) out.alert_buyzone_active = !!body.alert_buyzone_active
  return out
}

// GET — lista la watchlist del usuario.
export async function GET() {
  const { supabase, user } = await getCtx()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data, error } = await supabase.from('watchlist').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

// POST — añade una empresa a la watchlist.
export async function POST(request) {
  const { supabase, user, isPremium } = await getCtx()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const ticker = body.ticker ? String(body.ticker).trim() : null
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })

  // ¿Ya está? — devolvemos la fila existente sin error.
  const { data: existing } = await supabase.from('watchlist').select('*').eq('user_id', user.id).eq('ticker', ticker).maybeSingle()
  if (existing) return NextResponse.json({ item: existing, already: true })

  // Límite freemium.
  if (!isPremium) {
    const { count } = await supabase.from('watchlist').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    if ((count || 0) >= FREE_WATCHLIST_LIMIT) {
      return NextResponse.json({ error: 'limit', limit: FREE_WATCHLIST_LIMIT }, { status: 403 })
    }
  }

  const fields = pickFields(body)
  // Free: nunca activamos alertas (sin alertas por email — usamos premium para diferenciar).
  const row = { user_id: user.id, ticker, ...fields }
  const { data, error } = await supabase.from('watchlist').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// PUT — edita una entrada existente.
export async function PUT(request) {
  const { supabase, user } = await getCtx()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const ticker = body.ticker ? String(body.ticker).trim() : null
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })

  const fields = pickFields(body)
  // Si cambian objetivos o se desactiva una alerta, reseteamos el estado anti-spam.
  if (fields.target_price !== undefined || fields.alert_price_active === false) fields.alert_price_triggered = false
  if (fields.target_yield !== undefined || fields.alert_yield_active === false) fields.alert_yield_triggered = false
  if (fields.alert_buyzone_active === false) fields.alert_buyzone_triggered = false

  const { data, error } = await supabase.from('watchlist').update(fields).eq('user_id', user.id).eq('ticker', ticker).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE — elimina una entrada (?ticker=XXX).
export async function DELETE(request) {
  const { supabase, user } = await getCtx()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const ticker = new URL(request.url).searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'Falta el ticker' }, { status: 400 })
  const { error } = await supabase.from('watchlist').delete().eq('user_id', user.id).eq('ticker', ticker)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
