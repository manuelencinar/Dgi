import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ScreenerClient from '@/components/ScreenerClient'
import { getEffectiveDict } from '@/lib/dict'
import { buildScreenerCompanies, selectFreeSample } from '@/lib/screener-companies'
import { resolveDestWHT } from '@/lib/fiscal-es'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Screener DGI avanzado | EverDiv',
  description: 'Filtra casi 2000 empresas de 43 mercados por yield, Score DGI, ROIC, foso, valoración y proyección de renta a 10 años.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserContext() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { plan: 'free', destWHT: 19, whtOverrides: null, followed: [], isAuthed: false }
    const [{ data }, { data: wl }] = await Promise.all([
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('watchlist').select('ticker').eq('user_id', user.id),
    ])
    const followed = (wl || []).map(w => w.ticker)
    const destWHT = resolveDestWHT(data)
    const whtOverrides = data?.wht_overrides && typeof data.wht_overrides === 'object' ? data.wht_overrides : null
    if (user.email === ADMIN_EMAIL) return { plan: 'premium', destWHT, whtOverrides, followed, isAuthed: true }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { plan, destWHT, whtOverrides, followed, isAuthed: true }
  } catch { return { plan: 'free', destWHT: 19, whtOverrides: null, followed: [], isAuthed: false } }
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
  const { plan, destWHT, whtOverrides, followed, isAuthed } = await getUserContext()
  const isPremium = plan === 'premium'
  const dict = await getEffectiveDict()
  const allCompanies = await buildScreenerCompanies(destWHT, dict)
  const totalCompanies = allCompanies.length
  // Free: solo se ENVÍAN al cliente 50 empresas (las mismas siempre); el resto
  // requiere suscripción y ni siquiera se carga.
  const companies = isPremium ? allCompanies : selectFreeSample(allCompanies)
  const sectors = [...new Set(dict.map(d => d[4]))].filter(Boolean).sort()

  const initial = parseInitialFilters(sp)
  const hueco = sp.from === 'cartera' && sp.hueco ? String(sp.hueco) : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/screener" />
      <ScreenerClient
        companies={companies}
        isPremium={isPremium}
        sectors={sectors}
        destWHT={destWHT}
        whtOverrides={whtOverrides}
        followed={followed}
        isAuthed={isAuthed}
        initial={Object.keys(initial).length ? initial : null}
        hueco={hueco}
        totalCompanies={totalCompanies}
      />
    </div>
  )
}
