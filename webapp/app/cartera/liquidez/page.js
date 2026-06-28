import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CarteraNav from '@/components/cartera/CarteraNav'
import LiquidezPage from '@/components/cartera/LiquidezPage'

export const metadata = { title: 'Fondo de oportunidad — EverDiv' }
export const dynamic  = 'force-dynamic'

export default async function Page() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/cartera" />
      <CarteraNav />
      <LiquidezPage />
    </div>
  )
}
