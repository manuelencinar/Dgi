import { serviceClient } from '@/lib/admin'
import { getUserMetrics, getRetentionMetrics, getOnboardingStats } from '@/lib/admin-stats'
import UsuariosClient from '@/components/dashboard/UsuariosClient'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const sc = serviceClient()
  const [metrics, retention, onboarding] = await Promise.all([getUserMetrics(sc), getRetentionMetrics(sc), getOnboardingStats(sc)])

  let planByUser = {}
  try {
    const { data } = await sc.from('user_settings').select('user_id, plan, premium_until')
    planByUser = Object.fromEntries((data || []).map(s => [s.user_id, s]))
  } catch {}

  const users = metrics.users.map(u => {
    const s = planByUser[u.id]
    const isPremium = s?.plan === 'premium' && (!s.premium_until || new Date(s.premium_until) >= new Date())
    return {
      id: u.id, email: u.email,
      created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
      plan: isPremium ? 'premium' : 'free',
      premium_until: s?.premium_until || null,
      confirmed: !!u.email_confirmed_at,
    }
  })

  return (
    <UsuariosClient
      metrics={{ total: metrics.total, new7d: metrics.new7d, new30d: metrics.new30d, premiumTotal: metrics.premiumTotal, conversion: metrics.conversion, mrr: metrics.mrr, weekly: metrics.weekly }}
      retention={retention}
      onboarding={onboarding}
      users={users}
    />
  )
}
