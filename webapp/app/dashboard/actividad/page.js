import { serviceClient } from '@/lib/admin'
import { getSectionUsage, getDailyActiveUsers, getActiveAccounts } from '@/lib/activity-stats'
import ActividadClient from '@/components/dashboard/ActividadClient'

export const dynamic = 'force-dynamic'

export default async function ActividadPage() {
  const sc = serviceClient()
  const DAYS = 30
  const [sectionUsage, dau, accounts] = await Promise.all([
    getSectionUsage(sc, DAYS),
    getDailyActiveUsers(sc, DAYS),
    getActiveAccounts(sc, DAYS, 200),
  ])
  return <ActividadClient sectionUsage={sectionUsage} dau={dau} accounts={accounts} days={DAYS} />
}
