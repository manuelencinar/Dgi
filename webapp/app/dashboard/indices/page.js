import { serviceClient } from '@/lib/admin'
import { getFundamentalsLite, getIndexCoverage } from '@/lib/admin-stats'
import IndicesClient from '@/components/dashboard/IndicesClient'

export const dynamic = 'force-dynamic'

export default async function IndicesPage() {
  const sc = serviceClient()
  const fundamentals = await getFundamentalsLite(sc)
  const coverage = getIndexCoverage(fundamentals)
  return <IndicesClient coverage={coverage} />
}
