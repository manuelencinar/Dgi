import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import NewPositionPage from '@/components/cartera/NewPositionPage'

export const metadata = { title: 'Añadir posición — Mi Índice DGI' }
export const dynamic  = 'force-dynamic'

export default async function NuevaPosicionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/cartera" />
      <NewPositionPage />
    </div>
  )
}
