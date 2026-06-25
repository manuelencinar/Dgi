import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CarteraNav from '@/components/cartera/CarteraNav'
import FiscalidadPage from '@/components/cartera/FiscalidadPage'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getContext() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null
    const { data } = await sb.from('user_settings').select('plan, premium_until, country_residence').eq('user_id', user.id).maybeSingle()
    let isPremium = user.email === ADMIN_EMAIL
    if (!isPremium && data?.plan === 'premium') {
      isPremium = !data.premium_until || new Date(data.premium_until) >= new Date()
    }
    return { isPremium, countryResidence: data?.country_residence || 'ES' }
  } catch { return null }
}

export const metadata = { title: 'Fiscalidad — Mi Índice DGI' }
export const dynamic  = 'force-dynamic'

export default async function Page() {
  const ctx = await getContext()
  if (!ctx) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/cartera" />
      <CarteraNav />
      <FiscalidadPage isPremium={ctx.isPremium} countryResidence={ctx.countryResidence} />
    </div>
  )
}
