import { createClient } from '@supabase/supabase-js'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import AristocratasClient from '@/components/AristocratasClient'
import { getEffectiveDict } from '@/lib/dict'
import { getContinent, dividendTier } from '@/lib/helpers'
import { computeScore, yieldPct, marginSafety, mosUnreliable } from '@/lib/screener'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Reyes, Aristócratas y Aspirantes del dividendo | Mi Índice DGI',
  description: 'Empresas clasificadas por su racha de años consecutivos subiendo el dividendo: Reyes (50+ años), Aristócratas (25+) y Aspirantes (10–24) de 43 mercados globales.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'
const EXCLUDED = new Set(['^VIX', '^VVIX'])

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

// Mismos campos escalares que el screener para que computeScore coincida.
async function fetchFundamentals() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const FIELDS = 'ticker, current_price, dps, pays_dividend, div_streak, div_cagr5, payout_fcf, payout_eps, fcf_cagr5, debt_ebitda, net_debt_ebitda, interest_coverage, roic, roic_reported, roic_tangible, roic_display, roe, operating_margin, gross_margin, revenue_cagr5, pe_trailing, ev_ebitda, market_cap_m, intrinsic_value, sector, industry, country'
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

async function buildTierCompanies() {
  const [dict, fundMap] = await Promise.all([getEffectiveDict(), fetchFundamentals()])
  const seen = new Set()
  const rows = []
  for (const [name, ticker, country, currency, sector, , type] of dict) {
    if (EXCLUDED.has(ticker) || seen.has(ticker)) continue
    seen.add(ticker)
    const f = fundMap[ticker]
    if (!f) continue
    if (f.current_price == null || Number(f.current_price) <= 0) continue   // sin precio válido → ocultar
    const tier = dividendTier(f.div_streak)
    if (!tier) continue
    const t = type || 'general'
    const mos = marginSafety(f)
    const unreliable = mosUnreliable(f)
    rows.push({
      n: name, t: ticker, c: country, cont: getContinent(country), s: sector, cur: currency,
      streak: Number(f.div_streak), tier,
      y:   yieldPct(f),
      sc:  computeScore(f, t),
      cagr: f.div_cagr5 != null ? Math.min(Number(f.div_cagr5), 50) : null,
      px:  f.current_price != null ? Number(f.current_price) : null,
      mos: unreliable ? null : mos,
      buyZone: !unreliable && mos != null && mos >= 0,
    })
  }
  // Orden dentro de cada nivel: más racha primero, desempate por Score.
  rows.sort((a, b) => (b.streak - a.streak) || ((b.sc ?? -1) - (a.sc ?? -1)))
  return rows
}

export default async function AristocratasPage() {
  const { plan, destWHT, isAuthed } = await getUserContext()
  const companies = await buildTierCompanies()

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/aristocratas" />
      <AristocratasClient companies={companies} isPremium={plan === 'premium'} destWHT={destWHT} isAuthed={isAuthed} />
    </div>
  )
}
