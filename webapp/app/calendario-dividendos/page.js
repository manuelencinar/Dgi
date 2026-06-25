import PublicNav from '@/components/PublicNav'
import CalendarDividendosClient from '@/components/CalendarDividendosClient'
import { getEffectiveDict } from '@/lib/dict'
import { createClient } from '@supabase/supabase-js'
import { isSecondary } from '@/lib/listings'
import { getCountry, getContinent } from '@/lib/helpers'
import { payMonthsFromEvents } from '@/lib/dividend-calendar'

export const revalidate = 3600   // cálculo pesado (eventos de dividendo) → cacheado 1h
export const metadata = {
  title: 'Calendario de dividendos | Mi Índice DGI',
  description: 'En qué meses paga dividendo cada empresa del universo DGI. Planifica tus ingresos a lo largo del año.',
}

async function buildCalendar() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const fund = {}
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('company_fundamentals')
        .select('ticker, dividend_events, dps, current_price, pays_dividend').range(from, from + 999)
      if (error || !data?.length) break
      for (const f of data) fund[f.ticker] = f
      if (data.length < 1000) break
    }
  } catch {}

  const dict = await getEffectiveDict()
  const byMonth = Array.from({ length: 12 }, () => [])
  const seen = new Set()
  for (const row of dict) {
    const [name, ticker, country, currency, sector] = row
    if (!ticker || seen.has(ticker) || isSecondary(ticker)) continue
    seen.add(ticker)
    const f = fund[ticker]
    if (!f || f.pays_dividend === false) continue
    const months = payMonthsFromEvents(f.dividend_events)
    if (!months.length) continue
    const price = Number(f.current_price), dps = Number(f.dps)
    if (!(price > 0) || !(dps > 0)) continue
    const y = dps / price * 100
    if (y <= 0 || y > 20) continue   // saneo (penny / artefacto)
    const ct = getCountry(country)
    const entry = { t: ticker, n: name, flag: ct.flag, cont: getContinent(country), cur: currency, s: sector || '—', y: Math.round(y * 10) / 10, freq: months.length }
    for (const m of months) byMonth[m - 1].push(entry)
  }
  byMonth.forEach(arr => arr.sort((a, b) => b.y - a.y))
  return byMonth
}

export default async function CalendarioDividendosPage() {
  const byMonth = await buildCalendar()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/aristocratas" />
      <CalendarDividendosClient byMonth={byMonth} />
    </div>
  )
}
