import PublicNav from '@/components/PublicNav'
import MarketsClient from '@/components/MarketsClient'
import { getMarketQuotes } from '@/lib/market-quotes'
import { getAndComputeAllScores } from '@/lib/market-scores'
import { getEffectiveMarkets } from '@/lib/markets-overrides'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Mercados globales — Mi Índice DGI',
  description: '43 mercados globales analizados con metodología DGI. Score de calidad, yield real y radar de oportunidades.',
}

export default async function MercadosPage() {
  const [quotesData, dgiScores] = await Promise.allSettled([
    getMarketQuotes(),
    getAndComputeAllScores(),
  ])

  const quotes  = quotesData.status === 'fulfilled' ? quotesData.value.quotes : {}
  const ts      = quotesData.status === 'fulfilled' ? quotesData.value.ts     : 0
  const dgiData = dgiScores.status  === 'fulfilled' ? dgiScores.value         : {}

  let markets
  try { markets = await getEffectiveMarkets() } catch { markets = undefined }

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/mercados" />
      <MarketsClient initialQuotes={quotes} initialTs={ts} dgiScores={dgiData} markets={markets} />
    </div>
  )
}
