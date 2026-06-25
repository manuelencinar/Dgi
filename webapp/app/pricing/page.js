import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import PublicNav from '@/components/PublicNav'
import PricingClient from '@/components/PricingClient'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getPlanStatus() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, isPremium: false, customerId: null }

    if (user.email === ADMIN_EMAIL) return { user, isPremium: true, customerId: null }

    const sb = serviceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
    const { data } = await sb
      .from('user_settings')
      .select('plan, premium_until, stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    const isPremium = data?.plan === 'premium' &&
      (!data.premium_until || new Date(data.premium_until) >= new Date())

    return { user, isPremium, customerId: data?.stripe_customer_id ?? null }
  } catch {
    return { user: null, isPremium: false, customerId: null }
  }
}

export default async function PricingPage({ searchParams }) {
  const { user, isPremium, customerId } = await getPlanStatus()
  const params = await searchParams
  const success = params?.success === '1'
  const cancel  = params?.cancel  === '1'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <PricingClient
        isLoggedIn={!!user}
        isPremium={isPremium}
        hasCustomerId={!!customerId}
        monthlyPriceId={process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID}
        annualPriceId={process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID}
        success={success}
        cancel={cancel}
      />
    </div>
  )
}
