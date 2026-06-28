import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import NotificationsClient from '@/components/NotificationsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Notificaciones — EverDiv',
}

export default async function NotificacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/notificaciones')

  const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav />
      <NotificationsClient initialItems={data || []} />
    </div>
  )
}
