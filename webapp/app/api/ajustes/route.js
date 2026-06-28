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
  'investor_profile',
  // Meta de renta pasiva anual (estrella polar de la cartera)
  'income_goal',
  // Gastos mensuales del usuario (contador de libertad financiera de la home)
  'monthly_expenses',
  // Fondo de oportunidad (liquidez): TAE del banco + si los dividendos entran al fondo
  'cash_interest_rate', 'dividends_to_cash',
  // Fiscalidad: retención de destino (España) y overrides de retención en origen por país
  'dest_wht', 'wht_overrides',
  // Fiscalidad personalizada por ingresos (IRPF español)
  'tax_mode', 'annual_income', 'children', 'children_under3',
  // compatibilidad con la página de ajustes de cartera
  'monthly_summary', 'alert_config', 'alert_dismissed',
])

// Sanea el mapa de overrides de retención: { 'US': 15, 'CH': 15, ... } con % en [0,60].
function sanitizeWhtOverrides(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return {}
  const out = {}
  for (const [k, val] of Object.entries(v)) {
    const code = String(k).toUpperCase().slice(0, 4)
    const n = Number(val)
    if (/^[A-Z]{2,4}$/.test(code) && !isNaN(n) && n >= 0 && n <= 60) out[code] = Math.round(n * 1000) / 1000
  }
  return out
}

function sb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return { missingKey: true }
  return { client: serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key) }
}

// Lectura de preferencias del propio usuario vía service_role (user_settings no
// es legible desde el navegador por RLS). Solo devuelve la fila del usuario autenticado.
// Campos que el cliente necesita. Se leen con select('*') y se filtran aquí,
// de modo que si alguna columna aún no existe en la BD no rompe la lectura.
const READABLE = [
  'base_currency', 'country_residence', 'broker_name',
  'fx_commission_pct', 'fx_alert_threshold',
  'benchmark_index', 'show_returns_original',
  'monthly_summary_active', 'alerts_email_active', 'recurring_email_active',
  'investor_profile', 'income_goal', 'monthly_expenses', 'dest_wht', 'wht_overrides',
  'cash_interest_rate', 'dividends_to_cash',
  'tax_mode', 'annual_income', 'children', 'children_under3',
  'plan', 'premium_until', 'subscription_paused', 'pause_end_date', 'retention_discount_used',
]

export async function GET() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const svc = sb()
  if (svc.missingKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no está configurada' }, { status: 500 })

  const { data, error } = await svc.client
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let settings = null
  if (data) {
    settings = {}
    for (const f of READABLE) if (f in data) settings[f] = data[f]
  }
  return NextResponse.json({ settings })
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
  if ('wht_overrides' in updates) updates.wht_overrides = sanitizeWhtOverrides(updates.wht_overrides)
  if ('dest_wht' in updates) { const n = Number(updates.dest_wht); updates.dest_wht = (!isNaN(n) && n >= 0 && n <= 60) ? n : 19 }
  if ('tax_mode' in updates) updates.tax_mode = updates.tax_mode === 'income' ? 'income' : 'fixed'
  if ('annual_income' in updates) { const n = Number(updates.annual_income); updates.annual_income = (!isNaN(n) && n >= 0 && n <= 100_000_000) ? n : null }
  if ('income_goal' in updates) { const n = Number(updates.income_goal); updates.income_goal = (!isNaN(n) && n > 0 && n <= 100_000_000) ? n : null }
  if ('monthly_expenses' in updates) { const n = Number(updates.monthly_expenses); updates.monthly_expenses = (!isNaN(n) && n > 0 && n <= 10_000_000) ? n : null }
  if ('cash_interest_rate' in updates) { const n = Number(updates.cash_interest_rate); updates.cash_interest_rate = (!isNaN(n) && n >= 0 && n <= 20) ? Math.round(n * 1000) / 1000 : 0 }
  if ('dividends_to_cash' in updates) updates.dividends_to_cash = !!updates.dividends_to_cash
  if ('children' in updates) { const n = Math.round(Number(updates.children)); updates.children = (!isNaN(n) && n >= 0 && n <= 20) ? n : 0 }
  if ('children_under3' in updates) { const n = Math.round(Number(updates.children_under3)); updates.children_under3 = (!isNaN(n) && n >= 0 && n <= 20) ? n : 0 }
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
