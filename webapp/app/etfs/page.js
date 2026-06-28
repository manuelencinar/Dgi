import { createClient } from '@supabase/supabase-js'
import PublicNav from '@/components/PublicNav'
import EtfsClient from '@/components/EtfsClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'ETFs DGI | EverDiv',
  description: 'ETFs de dividendos de referencia: SCHD, VIG, VHYL y más. TER, yield y distribuciones.',
}

export default async function EtfsPage() {
  let funds = []
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    // select('*') es tolerante a columnas que aún no existan (return_*, benchmark_*)
    const { data } = await sb.from('funds').select('*').order('asset_type').order('ticker')
    funds = data || []
  } catch {}

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/etfs" />
      <EtfsClient initialFunds={funds} />
    </div>
  )
}
