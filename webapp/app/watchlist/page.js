import { createClient as authClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import PublicNav from '@/components/PublicNav'
import WatchlistClient from '@/components/WatchlistClient'
import LoggedOutPreview from '@/components/LoggedOutPreview'
import { buildWatchlistRows, sortByProximity } from '@/lib/watchlist-enrich'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tu Watchlist — Mi Índice DGI',
  description: 'Empresas que sigues — te avisamos cuando llegan a tu precio objetivo.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

export default async function WatchlistPage() {
  const supabase = await authClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#080b14' }}>
        <PublicNav active="/watchlist" />
        <LoggedOutPreview variant="watchlist" />
      </div>
    )
  }

  // Plan del usuario
  let isPremium = user.email === ADMIN_EMAIL
  if (!isPremium) {
    const { data } = await supabase.from('user_settings').select('plan, premium_until').eq('user_id', user.id).maybeSingle()
    if (data?.plan === 'premium') isPremium = !data.premium_until || new Date(data.premium_until) >= new Date()
  }

  const { data: rows } = await supabase.from('watchlist').select('*').eq('user_id', user.id)

  let items = []
  if (rows?.length) {
    const sb = serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    items = sortByProximity(await buildWatchlistRows(sb, rows))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/watchlist" />
      <WatchlistClient initialItems={items} isPremium={isPremium} />
    </div>
  )
}
