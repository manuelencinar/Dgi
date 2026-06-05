import { createClient } from '@supabase/supabase-js'
import PublicNav from '@/components/PublicNav'
import EtfsClient from '@/components/EtfsClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'ETFs DGI | Mi Índice DGI',
  description: 'ETFs de dividendos de referencia: SCHD, VIG, VHYL y más. TER, yield y distribuciones.',
}

export default async function EtfsPage() {
  let funds = []
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data } = await sb.from('funds').select('ticker, name, currency, current_price, ter, yield_ttm, category, asset_type, extra_data').order('asset_type').order('ticker')
    funds = data || []
  } catch {}

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/etfs" />
      <EtfsClient initialFunds={funds} />
    </div>
  )
}
