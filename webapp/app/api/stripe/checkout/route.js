import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

const VALID_PRICES = new Set([
  process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
  process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID,
])

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { priceId } = await request.json()
  if (!priceId || !VALID_PRICES.has(priceId)) {
    return NextResponse.json({ error: 'priceId inválido' }, { status: 400 })
  }

  const origin = request.headers.get('origin') || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    metadata: { supabase_user_id: user.id },
    subscription_data: { metadata: { supabase_user_id: user.id } },
    success_url: `${origin}/pricing?success=1`,
    cancel_url:  `${origin}/pricing?cancel=1`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
