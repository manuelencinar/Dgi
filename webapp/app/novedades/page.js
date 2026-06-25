import { createClient as svcClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import NovedadesClient from '@/components/NovedadesClient'
import { DICT } from '@/data/dict'
import { parseQuarterlyNews, daysSince, splitFeatured, effectiveReportDate } from '@/lib/novedades'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Novedades — Mi Índice DGI',
  description: 'Resultados recientes de las empresas, cambios destacados y eventos de tu cartera.',
}

const REPORT_WINDOW_DAYS = 35  // ventana de "resultados recientes" sobre la fecha de publicación
function svc() { return svcClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) }
const slim = arr => arr.map(r => ({ t: r.t, name: r.name, cc: r.cc, sector: r.sector, revYoY: r.revYoY, incYoY: r.incYoY, revSeries: r.revSeries, latestDate: r.latestDate, age: r.age }))

export default async function NovedadesPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()

  // País del usuario (ISO-2) para el reparto del bloque destacado. Default ES.
  let userCC = 'ES'
  if (user) {
    const { data } = await auth.from('user_settings').select('country_residence').eq('user_id', user.id).maybeSingle()
    const c = (data?.country_residence || '').toUpperCase()
    if (/^[A-Z]{2}$/.test(c)) userCC = c
  }

  const sb = svc()

  // 1. Ranking por capitalización (escalares, ligero).
  const caps = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('company_fundamentals').select('ticker, market_cap_m').range(from, from + 999)
    if (error || !data?.length) break
    caps.push(...data)
    if (data.length < 1000) break
  }
  const dictMap = Object.fromEntries(DICT.map(d => [d[1], { name: d[0], cc: d[2], sector: d[5] }]))
  const ranked = caps
    .filter(r => r.market_cap_m != null && dictMap[r.ticker])
    .map(r => ({ t: r.ticker, mcap: Number(r.market_cap_m), ...dictMap[r.ticker] }))
    .sort((a, b) => b.mcap - a.mcap)

  // 2. Candidatos: top global por capitalización + top del país del usuario.
  const candMap = {}
  ranked.slice(0, 300).forEach(r => { candMap[r.t] = r })
  if (userCC !== 'US') ranked.filter(r => r.cc === userCC).slice(0, 60).forEach(r => { candMap[r.t] = r })
  const candidates = Object.values(candMap)

  // 3. Estados trimestrales solo de los candidatos (jsonb, en lotes).
  const qMap = {}
  const ctk = candidates.map(c => c.t)
  for (let i = 0; i < ctk.length; i += 150) {
    const { data } = await sb.from('company_fundamentals')
      .select('ticker, income_statement_quarterly, last_report_date').in('ticker', ctk.slice(i, i + 150))
    ;(data || []).forEach(r => { qMap[r.ticker] = r })
  }

  // 4. Reporteros recientes: por FECHA DE PUBLICACIÓN (last_report_date real del
  //    script, o estimación cierre+35d como respaldo) dentro de la ventana.
  const reporters = []
  for (const c of candidates) {
    const row = qMap[c.t]
    const parsed = parseQuarterlyNews(row?.income_statement_quarterly)
    if (!parsed) continue
    const reportDate = effectiveReportDate(row?.last_report_date, parsed.latestDate)
    const age = daysSince(reportDate)
    if (age == null || age > REPORT_WINDOW_DAYS) continue
    reporters.push({ ...c, ...parsed, age, reportDate })
  }
  reporters.sort((a, b) => b.mcap - a.mcap)   // por capitalización (para el reparto)

  const featured = splitFeatured(reporters, userCC, 6)
  const featuredSet = new Set(featured.map(f => f.t))
  const rest = reporters.filter(r => !featuredSet.has(r.t))
    .sort((a, b) => (a.age - b.age) || (b.mcap - a.mcap)).slice(0, 30)

  // 5. Eventos personales (notificaciones recientes).
  let events = []
  if (user) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data } = await auth.from('notifications')
      .select('type, ticker, message, created_at, read').eq('user_id', user.id)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(12)
    events = data || []
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/novedades" />
      <NovedadesClient featured={slim(featured)} rest={slim(rest)} events={events} userCC={userCC} hasUser={!!user} />
    </div>
  )
}
