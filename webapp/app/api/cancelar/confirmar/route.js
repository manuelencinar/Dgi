import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { sendEmail, emailShell, emailButton, APP_URL } from '@/lib/email'

export const dynamic = 'force-dynamic'

function sb() {
  return serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST(request) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let reason = '', feedback = '', monthsAsPremium = null, offerShown = null, offerAccepted = false
  try {
    ({ reason, feedback, monthsAsPremium, offerShown, offerAccepted } = await request.json())
  } catch {}

  const admin = sb()
  const { data: settings } = await admin
    .from('user_settings')
    .select('stripe_subscription_id, plan')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!settings?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 })
  }

  // Cancelar al final del período pagado — el usuario no pierde acceso hasta entonces
  let accessUntil = null
  try {
    const sub = await getStripe().subscriptions.update(settings.stripe_subscription_id, {
      cancel_at_period_end: true,
    })
    accessUntil = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10)
      : null
  } catch (e) {
    return NextResponse.json({ error: `Stripe: ${e.message}` }, { status: 502 })
  }

  // Registrar la cancelación
  await admin.from('cancellations').insert({
    user_id: user.id,
    reason: reason || 'no_especificado',
    feedback: feedback || null,
    plan_type: settings.plan || 'premium',
    months_as_premium: monthsAsPremium ?? null,
    retention_offer_shown: offerShown || null,
    retention_offer_accepted: !!offerAccepted,
  })

  // Marcar en user_settings — el plan pasa a free cuando expire (lo hace el webhook)
  await admin.from('user_settings').update({
    cancelled_at: new Date().toISOString(),
    access_until: accessUntil,
  }).eq('user_id', user.id)

  // Email de confirmación
  const fechaBonita = accessUntil
    ? new Date(accessUntil + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'el final de tu período actual'
  await sendEmail(user.email, `Cancelación confirmada — sigues con acceso hasta ${fechaBonita}`, emailShell(
    'Cancelación confirmada',
    `<p style="color:#e0e8f0;font-size:16px;margin:0 0 16px">Hemos procesado tu cancelación.</p>
     <p style="color:#c8d0e0;font-size:14px;margin:0 0 8px">Sigues teniendo acceso Premium completo hasta el <strong style="color:#34d399">${fechaBonita}</strong>. No se realizarán más cobros.</p>
     <p style="color:#8090a8;font-size:13px;margin:0 0 8px">Tus datos se conservan durante 12 meses, así que si vuelves los tendrás todos intactos.</p>
     ${emailButton(`${APP_URL}/pricing`, 'Volver a Premium')}`
  ))

  return NextResponse.json({ ok: true, accessUntil })
}
