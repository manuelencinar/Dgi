import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CarteraNav from '@/components/cartera/CarteraNav'
import DividendosPage from '@/components/cartera/DividendosPage'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'
async function getPlan() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null
    if (user.email === ADMIN_EMAIL) return 'premium'
    const { data } = await sb.from('user_settings').select('plan,premium_until').eq('user_id', user.id).single()
    if (data?.plan === 'premium' && data.premium_until) return new Date(data.premium_until) >= new Date() ? 'premium' : 'free'
    return data?.plan || 'free'
  } catch { return null }
}

export const metadata = { title: 'Dividendos — Mi Índice DGI' }
export const dynamic  = 'force-dynamic'

export default async function Page() {
  const plan = await getPlan()
  if (!plan) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/cartera" />
      <CarteraNav />
      <DividendosPage isPremium={plan === 'premium'} />
    </div>
  )
}
