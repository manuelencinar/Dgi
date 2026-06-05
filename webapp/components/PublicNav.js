import { createClient } from '@/lib/supabase/server'
import NavMenu from '@/components/NavMenu'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getSessionUser() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    let isPremium = user.email === ADMIN_EMAIL
    if (!isPremium) {
      const { data } = await supabase
        .from('user_settings')
        .select('plan, premium_until')
        .eq('user_id', user.id)
        .single()
      if (data?.plan === 'premium') {
        isPremium = !data.premium_until || new Date(data.premium_until) >= new Date()
      }
    }

    return { email: user.email, isPremium }
  } catch {
    return null
  }
}

export default async function PublicNav({ active }) {
  const sessionUser = await getSessionUser()
  return <NavMenu active={active} sessionUser={sessionUser} />
}
