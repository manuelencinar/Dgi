import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { sendEmail, emailShell, emailButton, APP_URL } from '@/lib/email'

export const dynamic = 'force-dynamic'

function sb() {
  return serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function POST() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = sb()
  const { data: settings } = await admin
    .from('user_settings')
    .select('stripe_subscription_id, retention_discount_used')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!settings?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 })
  }
  // La oferta de descuento solo se puede usar una vez por usuario
  if (settings.retention_discount_used) {
    return NextResponse.json({ error: 'Ya has usado esta oferta anteriormente' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    // Cupón 50% durante 3 meses
    const coupon = await stripe.coupons.create({
      percent_off: 50,
      duration: 'repeating',
      duration_in_months: 3,
      name: 'Retención 50% 3 meses',
    })
    await stripe.subscriptions.update(settings.stripe_subscription_id, { coupon: coupon.id })
  } catch (e) {
    return NextResponse.json({ error: `Stripe: ${e.message}` }, { status: 502 })
  }

  await admin.from('user_settings').update({
    retention_discount_used: true,
    retention_discount_date: new Date().toISOString().slice(0, 10),
  }).eq('user_id', user.id)

  await sendEmail(user.email, 'Descuento aplicado — EverDiv', emailShell(
    'Tu descuento está activo',
    `<p style="color:#e0e8f0;font-size:16px;margin:0 0 16px">¡Gracias por seguir con nosotros!</p>
     <p style="color:#c8d0e0;font-size:14px;margin:0 0 8px">Hemos aplicado un <strong style="color:#34d399">50% de descuento durante los próximos 3 meses</strong> a tu suscripción Premium. El descuento aparecerá automáticamente en tus próximas facturas.</p>
     ${emailButton(`${APP_URL}/cartera`, 'Ir a mi cartera')}`
  ))

  return NextResponse.json({ ok: true })
}
