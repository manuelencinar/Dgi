import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ConstruirCarteraClient from '@/components/ConstruirCarteraClient'
import { getEffectiveDict } from '@/lib/dict'
import { buildScreenerCompanies } from '@/lib/screener-companies'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Construir cartera desde cero | Mi Índice DGI',
  description: 'Responde 4 preguntas y obtén un plan de 10-15 empresas DGI ordenadas por prioridad de entrada, con asignación mensual sugerida.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserContext() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { plan: 'free', destWHT: 19, isAuthed: false }
    const { data } = await supabase.from('user_settings').select('plan, premium_until, dest_wht').eq('user_id', user.id).maybeSingle()
    const destWHT = data?.dest_wht != null ? Number(data.dest_wht) : 19
    if (user.email === ADMIN_EMAIL) return { plan: 'premium', destWHT, isAuthed: true }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { plan, destWHT, isAuthed: true }
  } catch { return { plan: 'free', destWHT: 19, isAuthed: false } }
}

// Solo los campos que necesitan buildPortfolioPlan + buyZoneReason + la UI.
// Adelgaza el payload al cliente (no mandamos el `co` completo del screener).
function slim(co) {
  return {
    t: co.t, n: co.n, c: co.c, s: co.s, cur: co.cur, px: co.px,
    sc: co.sc, y: co.y, cagr: co.cagr, pays: co.pays, ero: co.ero,
    mos: co.mos, mosUnreliable: co.mosUnreliable, lo52: co.lo52,
    peFwd: co.peFwd, pe: co.pe, r1010: co.r1010,
    yieldAvg: co.yieldAvg, yieldAvgYears: co.yieldAvgYears, ma200: co.ma200,
  }
}

export default async function ConstruirCarteraPage() {
  const { plan, destWHT, isAuthed } = await getUserContext()
  const dict = await getEffectiveDict()
  const companies = (await buildScreenerCompanies(destWHT, dict)).map(slim)
  const sectors = [...new Set(companies.map(c => c.s))].filter(Boolean).sort()

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/construir-cartera" />
      <ConstruirCarteraClient
        companies={companies}
        sectors={sectors}
        destWHT={destWHT}
        isPremium={plan === 'premium'}
        isAuthed={isAuthed}
      />
    </div>
  )
}
