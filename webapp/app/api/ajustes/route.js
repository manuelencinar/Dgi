import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Solo estos campos (preferencias no sensibles) pueden actualizarse desde el cliente.
// Nunca plan, premium_until, role, stripe_*, retention_*, etc.
const ALLOWED = new Set([
  'base_currency', 'country_residence', 'broker_name',
  'fx_commission_pct', 'fx_alert_threshold',
  'benchmark_index', 'show_returns_original',
  'monthly_summary_active', 'alerts_email_active', 'recurring_email_active',
  // compatibilidad con la página de ajustes de cartera
  'monthly_summary', 'alert_config', 'alert_dismissed',
])

function sb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return { missingKey: true }
  return { client: serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key) }
}

// Lectura de preferencias del propio usuario vía service_role (user_settings no
// es legible desde el navegador por RLS). Solo devuelve la fila del usuario autenticado.
const READABLE = 'base_currency, country_residence, broker_name, fx_commission_pct, fx_alert_threshold, benchmark_index, show_returns_original, monthly_summary_active, alerts_email_active, recurring_email_active, plan, premium_until, subscription_paused, pause_end_date, retention_discount_used'

export async function GET() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const svc = sb()
  if (svc.missingKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no está configurada' }, { status: 500 })

  const { data, error } = await svc.client
    .from('user_settings')
    .select(READABLE)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data || null })
}

export async function POST(request) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const updates = {}
  for (const k of Object.keys(body || {})) {
    if (ALLOWED.has(k)) updates[k] = body[k]
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No hay cambios válidos para guardar' }, { status: 400 })
  }

  const svc = sb()
  if (svc.missingKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor' }, { status: 500 })
  }
  const admin = svc.client

  // UPDATE explícito: .select() devuelve las filas afectadas para confirmar la escritura
  const { data: updated, error: upErr } = await admin
    .from('user_settings')
    .update(updates)
    .eq('user_id', user.id)
    .select('user_id')

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  if (updated && updated.length) return NextResponse.json({ ok: true, saved: Object.keys(updates) })

  // No existía fila para el usuario → INSERT
  const { data: inserted, error: insErr } = await admin
    .from('user_settings')
    .insert({ user_id: user.id, ...updates })
    .select('user_id')

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  if (!inserted || !inserted.length) {
    return NextResponse.json({ error: 'No se escribió ninguna fila (revisa permisos/constraint de user_settings)' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, saved: Object.keys(updates) })
}
