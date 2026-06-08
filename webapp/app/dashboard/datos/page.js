import { serviceClient } from '@/lib/admin'
import { getFundamentalsLite, getMissingCompanies, getIncompleteCompanies, getOutdatedCompanies, dividendStatus } from '@/lib/admin-stats'
import { getEffectiveDict } from '@/lib/dict'
import { getAllMarkets } from '@/lib/markets-overrides'
import DatosTabs from '@/components/dashboard/DatosTabs'

export const dynamic = 'force-dynamic'

export default async function DatosPage() {
  const sc = serviceClient()
  const fundamentals = await getFundamentalsLite(sc)

  const missing    = new Set(getMissingCompanies(fundamentals).map(c => c.ticker))
  const incomplete = new Set(getIncompleteCompanies(fundamentals).map(c => c.ticker))
  const outdated   = new Set(getOutdatedCompanies(fundamentals).map(c => c.ticker))
  const fundByTicker = Object.fromEntries(fundamentals.map(f => [f.ticker, f]))

  const eff = await getEffectiveDict()
  const companies = eff.map(([name, ticker, country, currency, sector, subsector, type]) => ({
    ticker, name, country, currency, sector, subsector, type,
    status: missing.has(ticker) ? 'sin' : incomplete.has(ticker) ? 'incompletos' : outdated.has(ticker) ? 'desactualizados' : 'ok',
    divStatus: dividendStatus(fundByTicker[ticker]),   // falta_dps | no_reparte | por_verificar | ok | null
  }))
  const sectors   = [...new Set(eff.map(d => d[4]).filter(Boolean))].sort()
  const countries = [...new Set(eff.map(d => d[2]).filter(Boolean))].sort()

  let funds = []
  try { funds = (await sc.from('funds').select('*').order('asset_type').order('ticker')).data || [] } catch {}

  const markets = await getAllMarkets()

  let logs = []
  try { logs = (await sc.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(60)).data || [] } catch {}

  return <DatosTabs companies={companies} sectors={sectors} countries={countries} funds={funds} markets={markets} logs={logs} />
}
