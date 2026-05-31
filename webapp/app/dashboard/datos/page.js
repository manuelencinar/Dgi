import { serviceClient } from '@/lib/admin'
import { getFundamentalsLite, getMissingCompanies, getIncompleteCompanies, getOutdatedCompanies } from '@/lib/admin-stats'
import DatosClient from '@/components/dashboard/DatosClient'

export const dynamic = 'force-dynamic'

export default async function DatosPage() {
  const sc = serviceClient()
  const fundamentals = await getFundamentalsLite(sc)

  return (
    <DatosClient
      missing={getMissingCompanies(fundamentals)}
      incomplete={getIncompleteCompanies(fundamentals)}
      outdated={getOutdatedCompanies(fundamentals)}
    />
  )
}
