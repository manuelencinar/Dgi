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
  return serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
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

  const { error } = await sb()
    .from('user_settings')
    .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
