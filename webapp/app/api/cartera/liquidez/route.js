// Fondo de oportunidad (liquidez). Movimientos del usuario + devengo automático
// de intereses (mismo patrón que el prefill de dividendos): al leer, se generan los
// apuntes de interés de los meses ya cerrados que falten.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pendingInterest, balanceOf, signOf, CASH_TYPES } from '@/lib/cash-fund'

export const dynamic = 'force-dynamic'

async function loadMovements(sb, userId) {
  const { data, error } = await sb.from('cash_movements').select('*').eq('user_id', userId).order('date', { ascending: true })
  if (error) return { error }
  return { data: data || [] }
}

export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no auth' }, { status: 401 })

  // TAE + toggle (RLS de user_settings permite SELECT del propio usuario). Tolerante
  // a que las columnas aún no existan: select('*') y se leen aquí.
  let rate = 0, dividendsToCash = false
  try {
    const { data: s } = await sb.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
    if (s) { rate = Number(s.cash_interest_rate) || 0; dividendsToCash = !!s.dividends_to_cash }
  } catch {}

  let mv = await loadMovements(sb, user.id)
  if (mv.error) {
    // La tabla aún no existe → devuelve vacío sin romper la página.
    return NextResponse.json({ movements: [], balance: 0, rate, dividendsToCash, ready: false })
  }

  // Devengo de intereses de meses cerrados que falten.
  const pend = pendingInterest(mv.data, rate)
  if (pend.length) {
    await sb.from('cash_movements').insert(pend.map(p => ({ user_id: user.id, ...p })))
    mv = await loadMovements(sb, user.id)
  }

  return NextResponse.json({ movements: mv.data, balance: balanceOf(mv.data), rate, dividendsToCash, ready: true })
}

export async function POST(request) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no auth' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }

  const type = String(body?.type || '')
  if (!CASH_TYPES[type]) return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  const magnitude = Math.abs(Number(body?.amount))
  if (!magnitude || isNaN(magnitude)) return NextResponse.json({ error: 'importe inválido' }, { status: 400 })
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body?.date || '') ? body.date : new Date().toISOString().slice(0, 10)
  const amount = Math.round(magnitude * signOf(type) * 100) / 100
  const note = body?.note ? String(body.note).slice(0, 200) : null

  const { error } = await sb.from('cash_movements').insert({ user_id: user.id, type, amount, date, note })
  if (error) return NextResponse.json({ error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no auth' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'falta id' }, { status: 400 })
  const { error } = await sb.from('cash_movements').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}
