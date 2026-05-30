import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

async function upsertSubscription(supabaseUserId, { plan, premiumUntil, customerId, subscriptionId }) {
  const sb = serviceClient()
  const { error } = await sb
    .from('user_settings')
    .upsert({
      user_id:                supabaseUserId,
      plan,
      premium_until:          premiumUntil,
      stripe_customer_id:     customerId,
      stripe_subscription_id: subscriptionId,
    }, { onConflict: 'user_id' })
  if (error) console.error('upsert error:', error)
}

function periodEnd(sub) {
  return sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null
}

export async function POST(request) {
  const body      = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return NextResponse.json({ error: `Webhook inválido: ${err.message}` }, { status: 400 })
  }

  const obj = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription') break
      const userId = obj.metadata?.supabase_user_id
      if (!userId) break
      const sub = await stripe.subscriptions.retrieve(obj.subscription)
      await upsertSubscription(userId, {
        plan:           'premium',
        premiumUntil:   periodEnd(sub),
        customerId:     obj.customer,
        subscriptionId: obj.subscription,
      })
      break
    }

    case 'customer.subscription.updated': {
      const userId = obj.metadata?.supabase_user_id
      if (!userId) break
      const active = ['active', 'trialing'].includes(obj.status)
      await upsertSubscription(userId, {
        plan:           active ? 'premium' : 'free',
        premiumUntil:   active ? periodEnd(obj) : null,
        customerId:     obj.customer,
        subscriptionId: obj.id,
      })
      break
    }

    case 'customer.subscription.deleted': {
      const userId = obj.metadata?.supabase_user_id
      if (!userId) break
      await upsertSubscription(userId, {
        plan:           'free',
        premiumUntil:   null,
        customerId:     obj.customer,
        subscriptionId: null,
      })
      break
    }

    case 'invoice.payment_failed': {
      const subId = obj.subscription
      if (!subId) break
      const sub    = await stripe.subscriptions.retrieve(subId)
      const userId = sub.metadata?.supabase_user_id
      if (!userId) break
      // Mantener premium hasta fin de periodo actual
      await upsertSubscription(userId, {
        plan:           'premium',
        premiumUntil:   periodEnd(sub),
        customerId:     obj.customer,
        subscriptionId: subId,
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
