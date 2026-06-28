import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import AjustesGlobalPage from '@/components/AjustesGlobalPage'

export const metadata = { title: 'Ajustes — EverDiv' }
export const dynamic  = 'force-dynamic'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/ajustes" />
      <AjustesGlobalPage />
    </div>
  )
}
