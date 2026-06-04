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

  let months = 1
  try { ({ months } = await request.json()) } catch {}
  months = months === 2 ? 2 : 1

  const admin = sb()
  const { data: settings } = await admin
    .from('user_settings')
    .select('stripe_subscription_id, pause_end_date, subscription_paused')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!settings?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 })
  }

  // La pausa solo se puede hacer una vez cada 12 meses
  if (settings.pause_end_date) {
    const lastPause = new Date(settings.pause_end_date)
    const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    if (lastPause > twelveMonthsAgo) {
      return NextResponse.json({ error: 'Ya has usado una pausa en los últimos 12 meses' }, { status: 400 })
    }
  }

  const resumeDate = new Date()
  resumeDate.setMonth(resumeDate.getMonth() + months)
  const resumesAt  = Math.floor(resumeDate.getTime() / 1000)
  const endDateStr = resumeDate.toISOString().slice(0, 10)

  try {
    await getStripe().subscriptions.update(settings.stripe_subscription_id, {
      pause_collection: { behavior: 'void', resumes_at: resumesAt },
    })
  } catch (e) {
    return NextResponse.json({ error: `Stripe: ${e.message}` }, { status: 502 })
  }

  await admin.from('user_settings').update({
    subscription_paused: true,
    pause_end_date:      endDateStr,
  }).eq('user_id', user.id)

  // Email de confirmación (best-effort)
  const fechaBonita = resumeDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  await sendEmail(user.email, 'Suscripción pausada — Mi Índice DGI', emailShell(
    'Tu suscripción está en pausa',
    `<p style="color:#e0e8f0;font-size:16px;margin:0 0 16px">Hemos pausado tu suscripción.</p>
     <p style="color:#c8d0e0;font-size:14px;margin:0 0 8px">No se realizará ningún cobro hasta el <strong style="color:#34d399">${fechaBonita}</strong>. Mantienes acceso Premium completo durante la pausa.</p>
     <p style="color:#8090a8;font-size:13px;margin:0 0 8px">Puedes reactivarla antes cuando quieras desde Ajustes.</p>
     ${emailButton(`${APP_URL}/cartera`, 'Ir a mi cartera')}`
  ))

  return NextResponse.json({ ok: true, pauseEndDate: endDateStr })
}
