import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CarteraNav from '@/components/cartera/CarteraNav'
import AjustesPage from '@/components/cartera/AjustesPage'

export const metadata = { title: 'Ajustes — Mi Índice DGI' }
export const dynamic  = 'force-dynamic'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/cartera" />
      <CarteraNav />
      <AjustesPage />
    </div>
  )
}
