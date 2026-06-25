import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ImportPage from '@/components/cartera/ImportPage'

export const metadata = { title: 'Importar movimientos — Mi Índice DGI' }
export const dynamic  = 'force-dynamic'

export default async function ImportarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/cartera" />
      <ImportPage />
    </div>
  )
}
