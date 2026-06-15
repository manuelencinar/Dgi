import { createClient } from '@supabase/supabase-js'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import CanibalesClient from '@/components/CanibalesClient'
import { getEffectiveDict } from '@/lib/dict'
import { getContinent } from '@/lib/helpers'
import { computeScore, yieldPct } from '@/lib/screener'
import { isSecondary } from '@/lib/listings'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Caníbales de acciones | Mi Índice DGI',
  description: 'Ranking de empresas que más han reducido sus acciones en circulación desde 2022 — recompra neta real medida en número de acciones.',
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

async function fetchFundamentals() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const FIELDS = 'ticker, current_price, shares_reduced_pct, shares_base_year, dps, div_streak, div_cagr5, payout_fcf, payout_eps, fcf_cagr5, debt_ebitda, net_debt_ebitda, interest_coverage, roic, roic_reported, roic_tangible, roic_display, roe, operating_margin, gross_margin, revenue_cagr5, pe_trailing, ev_ebitda, market_cap_m, intrinsic_value, sector, industry, country'
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

async function buildCannibals() {
  const [dict, fundMap] = await Promise.all([getEffectiveDict(), fetchFundamentals()])
  const seen = new Set()
  const rows = []
  for (const [name, ticker, country, currency, sector, , type] of dict) {
    if (EXCLUDED.has(ticker) || seen.has(ticker) || isSecondary(ticker)) continue
    seen.add(ticker)
    const f = fundMap[ticker]
    if (!f || f.current_price == null || Number(f.current_price) < 0.01) continue   // sin precio o penny (<0,01) → ocultar
    const reduced = f.shares_reduced_pct != null ? Number(f.shares_reduced_pct) : null
    if (reduced == null || reduced <= 0) continue   // solo las que han reducido acciones
    const t = type || 'general'
    rows.push({
      n: name, t: ticker, c: country, cont: getContinent(country), s: sector, cur: currency,
      reduced, baseYear: f.shares_base_year != null ? Number(f.shares_base_year) : null,
      sc: computeScore(f, t),
      y: yieldPct(f),
      px: f.current_price != null ? Number(f.current_price) : null,
    })
  }
  rows.sort((a, b) => b.reduced - a.reduced)
  return rows
}

export default async function CanibalesPage() {
  const { plan, isAuthed } = await getUserContext()
  const companies = await buildCannibals()

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/aristocratas" />
      <CanibalesClient companies={companies} isPremium={plan === 'premium'} isAuthed={isAuthed} />
    </div>
  )
}
