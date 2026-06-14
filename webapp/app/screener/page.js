import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ScreenerClient from '@/components/ScreenerClient'
import { getEffectiveDict } from '@/lib/dict'
import { buildScreenerCompanies } from '@/lib/screener-companies'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Screener DGI avanzado | Mi Índice DGI',
  description: 'Filtra casi 2000 empresas de 43 mercados por yield, Score DGI, ROIC, foso, valoración y proyección de renta a 10 años.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserContext() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { plan: 'free', destWHT: 19, followed: [], isAuthed: false }
    const [{ data }, { data: wl }] = await Promise.all([
      supabase.from('user_settings').select('plan, premium_until, dest_wht').eq('user_id', user.id).maybeSingle(),
      supabase.from('watchlist').select('ticker').eq('user_id', user.id),
    ])
    const followed = (wl || []).map(w => w.ticker)
    const destWHT = data?.dest_wht != null ? Number(data.dest_wht) : 19
    if (user.email === ADMIN_EMAIL) return { plan: 'premium', destWHT, followed, isAuthed: true }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { plan, destWHT, followed, isAuthed: true }
  } catch { return { plan: 'free', destWHT: 19, followed: [], isAuthed: false } }
}

// Filtros iniciales desde la URL — usado por el detector de huecos de la cartera
// (CompanyDetector → /screener?sector=…&zona=…&yield=…&from=cartera&hueco=…).
function parseInitialFilters(sp) {
  const f = {}
  if (sp.sector) f.sector = String(sp.sector)
  if (sp.zona)   f.zona   = String(sp.zona)
  if (sp.score)  { const v = Number(sp.score); if (v > 0) f.score = v }
  if (sp.yield)  { let v = Number(sp.yield); if (v > 0 && v <= 1) v *= 100; if (v > 0) f.yield = v }  // acepta 0.035 o 3.5
  if (sp.cagr)   { const v = Number(sp.cagr);   if (v > 0) f.cagr = v }
  if (sp.streak) { const v = Number(sp.streak); if (v > 0) f.streak = v }
  if (sp.roic)   { const v = Number(sp.roic);   if (v > 0) f.roic = v }
  return f
}

export default async function ScreenerPage({ searchParams }) {
  const sp = (await searchParams) || {}
  const { plan, destWHT, followed, isAuthed } = await getUserContext()
  const dict = await getEffectiveDict()
  const companies = await buildScreenerCompanies(destWHT, dict)
  const sectors = [...new Set(dict.map(d => d[4]))].filter(Boolean).sort()

  const initial = parseInitialFilters(sp)
  const hueco = sp.from === 'cartera' && sp.hueco ? String(sp.hueco) : null

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/screener" />
      <ScreenerClient
        companies={companies}
        isPremium={plan === 'premium'}
        sectors={sectors}
        destWHT={destWHT}
        followed={followed}
        isAuthed={isAuthed}
        initial={Object.keys(initial).length ? initial : null}
        hueco={hueco}
      />
    </div>
  )
}
