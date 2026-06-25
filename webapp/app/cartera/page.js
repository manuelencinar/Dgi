import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CarteraNav from '@/components/cartera/CarteraNav'
import PortfolioPage from '@/components/cartera/PortfolioPage'
import LoggedOutPreview from '@/components/LoggedOutPreview'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserPlan() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    if (user.email === ADMIN_EMAIL) return 'premium'
    const { data } = await supabase.from('user_settings').select('plan, premium_until').eq('user_id', user.id).single()
    if (data?.plan === 'premium' && data.premium_until) {
      return new Date(data.premium_until) >= new Date() ? 'premium' : 'free'
    }
    return data?.plan || 'free'
  } catch { return null }
}

export const metadata = {
  title: 'Mi cartera — Mi Índice DGI',
  description: 'Seguimiento de tu cartera DGI: posiciones, rentabilidad, dividendos y análisis de concentración.',
}

export const dynamic = 'force-dynamic'

export default async function CarteraPage() {
  const plan = await getUserPlan()
  if (!plan) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <PublicNav active="/cartera" />
        <LoggedOutPreview variant="cartera" />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/cartera" />
      <CarteraNav />
      <PortfolioPage isPremium={plan === 'premium'} />
    </div>
  )
}
