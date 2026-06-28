import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import OnboardingClient from '@/components/OnboardingClient'

export const metadata = { title: 'Bienvenido — EverDiv' }
export const dynamic  = 'force-dynamic'

export default async function OnboardingPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Si ya lo completó, fuera
  let settings = null
  try {
    const { data } = await sb.from('user_settings')
      .select('onboarding_completed, base_currency, country_residence, experience_level')
      .eq('user_id', user.id).maybeSingle()
    settings = data
  } catch {}
  if (settings?.onboarding_completed === true) redirect('/app')

  // Si ya tiene posiciones (p.ej. importó datos) → se salta el paso 3
  let hasPositions = false
  try {
    const { count } = await sb.from('positions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    hasPositions = (count || 0) > 0
  } catch {}

  return (
    <OnboardingClient
      initial={{
        base_currency:    settings?.base_currency || 'EUR',
        country_residence: settings?.country_residence || 'ES',
        experience_level: settings?.experience_level || 'intermediate',
      }}
      hasPositions={hasPositions}
    />
  )
}
