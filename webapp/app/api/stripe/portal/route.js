import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const sb = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  const { data: settings } = await sb
    .from('user_settings')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  const customerId = settings?.stripe_customer_id
  if (!customerId) return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 })

  const origin = request.headers.get('origin') || 'http://localhost:3000'
  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: `${origin}/pricing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
