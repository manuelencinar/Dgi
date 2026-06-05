import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ALLOWED_PREFS = new Set(['base_currency', 'country_residence', 'experience_level'])

function admin() {
  return serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body = {}
  try { body = await request.json() } catch {}
  const { action, prefs, step, firstCompany } = body || {}

  const sb = admin()

  // Construir el update con solo campos permitidos
  const update = { user_id: user.id }
  if (prefs && typeof prefs === 'object') {
    for (const k of Object.keys(prefs)) if (ALLOWED_PREFS.has(k) && prefs[k] != null) update[k] = prefs[k]
  }
  if (typeof step === 'number') update.onboarding_step = step
  if (action === 'complete' || action === 'skip') update.onboarding_completed = true

  // Guardar (best-effort: si falla no bloquea el onboarding)
  try {
    await sb.from('user_settings').upsert(update, { onConflict: 'user_id' })
  } catch {}

  // Analytics (best-effort)
  if (action === 'complete' || action === 'skip') {
    try {
      await sb.from('admin_logs').insert({
        event_type: action === 'complete' ? 'onboarding_completed' : 'onboarding_skipped',
        description: action === 'complete'
          ? `Onboarding completado por ${user.email}`
          : `Onboarding saltado por ${user.email} en el paso ${step ?? '?'}`,
        details: JSON.stringify({
          step: step ?? null,
          base_currency: prefs?.base_currency ?? null,
          experience_level: prefs?.experience_level ?? null,
          first_company: firstCompany ?? null,
        }),
        status: 'ok',
      })
    } catch {}
  }

  return NextResponse.json({ ok: true })
}
