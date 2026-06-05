import { serviceClient } from '@/lib/admin'
import { getFundamentalsLite, getMissingCompanies, getIncompleteCompanies, getOutdatedCompanies } from '@/lib/admin-stats'
import DatosClient from '@/components/dashboard/DatosClient'
import EtfsAdminClient from '@/components/dashboard/EtfsAdminClient'

export const dynamic = 'force-dynamic'

export default async function DatosPage() {
  const sc = serviceClient()
  const fundamentals = await getFundamentalsLite(sc)

  let funds = []
  try {
    const { data } = await sc.from('funds').select('*').order('asset_type').order('ticker')
    funds = data || []
  } catch {}

  return (
    <>
      <DatosClient
        missing={getMissingCompanies(fundamentals)}
        incomplete={getIncompleteCompanies(fundamentals)}
        outdated={getOutdatedCompanies(fundamentals)}
      />
      <div style={{ maxWidth: 1100 }}>
        <EtfsAdminClient funds={funds} />
      </div>
    </>
  )
}
