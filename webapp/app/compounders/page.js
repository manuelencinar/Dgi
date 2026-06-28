import { createClient } from '@supabase/supabase-js'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CompoundersClient from '@/components/CompoundersClient'
import { getEffectiveDict } from '@/lib/dict'
import { getContinent } from '@/lib/helpers'
import { computeScore, yieldPct, resolveRoic } from '@/lib/screener'
import { isSecondary } from '@/lib/listings'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Máquinas de Compounding | EverDiv',
  description: 'Ranking de empresas capital-light de máxima calidad: ROIC alto y sostenido, poca necesidad de CapEx y crecimiento estable. El santo grial del compounding.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'
const EXCLUDED = new Set(['^VIX', '^VVIX'])
const ROIC_NA_TYPES = new Set(['banco', 'aseguradora', 'reit', 'bdc'])

async function getUserContext() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { plan: 'free', isAuthed: false }
    const { data } = await supabase.from('user_settings').select('plan, premium_until').eq('user_id', user.id).maybeSingle()
    if (user.email === ADMIN_EMAIL) return { plan: 'premium', isAuthed: true }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { plan, isAuthed: true }
  } catch { return { plan: 'free', isAuthed: false } }
}

async function fetchFundamentals() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const FIELDS = 'ticker, current_price, capex_cfo_pct, dps, div_streak, div_cagr5, payout_fcf, payout_eps, fcf_cagr5, debt_ebitda, net_debt_ebitda, interest_coverage, roic, roic_reported, roic_tangible, roic_display, roe, operating_margin, gross_margin, revenue_cagr5, pe_trailing, ev_ebitda, market_cap_m, intrinsic_value, sector, industry, country'
  const all = []
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('company_fundamentals').select(FIELDS).range(from, from + 999)
      if (error || !data?.length) break
      all.push(...data)
      if (data.length < 1000) break
    }
  } catch {}
  return Object.fromEntries(all.map(f => [f.ticker, f]))
}

async function buildCompounders() {
  const [dict, fundMap] = await Promise.all([getEffectiveDict(), fetchFundamentals()])
  const seen = new Set()
  const rows = []
  for (const [name, ticker, country, currency, sector, , type] of dict) {
    if (EXCLUDED.has(ticker) || seen.has(ticker) || isSecondary(ticker)) continue
    seen.add(ticker)
    const f = fundMap[ticker]
    if (!f || f.current_price == null || Number(f.current_price) < 0.01) continue   // sin precio o penny (<0,01) → ocultar
    const t = type || 'general'
    if (ROIC_NA_TYPES.has(t)) continue                         // banca/seguros/REIT: ROIC no comparable
    const capex = f.capex_cfo_pct != null ? Number(f.capex_cfo_pct) : null
    const roic  = resolveRoic(f)
    const rev   = f.revenue_cagr5 != null ? Number(f.revenue_cagr5) : null
    // Gates del compounding (con topes que descartan artefactos de bajo capital).
    if (capex == null || capex > 20) continue
    if (roic == null || roic < 18 || roic > 100) continue
    if (rev == null || rev < 4 || rev > 60) continue
    rows.push({
      n: name, t: ticker, c: country, cont: getContinent(country), s: sector, cur: currency,
      roic, capex, rev, sc: computeScore(f, t), y: yieldPct(f),
      px: f.current_price != null ? Number(f.current_price) : null,
    })
  }
  // Orden: mayor ROIC primero; desempate por menor intensidad de capital.
  rows.sort((a, b) => (b.roic - a.roic) || (a.capex - b.capex))
  return rows
}

export default async function CompoundersPage() {
  const { plan, isAuthed } = await getUserContext()
  const companies = await buildCompounders()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PublicNav active="/aristocratas" />
      <CompoundersClient companies={companies} isPremium={plan === 'premium'} isAuthed={isAuthed} />
    </div>
  )
}
