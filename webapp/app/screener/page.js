import { createClient } from '@supabase/supabase-js'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ScreenerClient from '@/components/ScreenerClient'
import { DICT } from '@/data/dict'
import { getContinent } from '@/lib/helpers'
import { computeScore, resolveRoic, marginSafety, yieldPct, deriveMoat, moatErosion, calcDivQuality, rule1010 } from '@/lib/screener'

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
    if (!user) return { plan: 'free', destWHT: 19 }
    const { data } = await supabase
      .from('user_settings')
      .select('plan, premium_until, dest_wht')
      .eq('user_id', user.id)
      .maybeSingle()
    const destWHT = data?.dest_wht != null ? Number(data.dest_wht) : 19
    if (user.email === ADMIN_EMAIL) return { plan: 'premium', destWHT }
    let plan = data?.plan || 'free'
    if (plan === 'premium' && data?.premium_until && new Date(data.premium_until) < new Date()) plan = 'free'
    return { plan, destWHT }
  } catch { return { plan: 'free', destWHT: 19 } }
}

// Lee company_fundamentals (campos escalares) paginado — PostgREST limita a 1000 filas.
async function fetchFundamentals() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const FIELDS = 'ticker, current_price, dps, div_streak, div_cagr5, payout_fcf, payout_eps, fcf_cagr5, debt_ebitda, net_debt_ebitda, interest_coverage, roic, roic_reported, roic_tangible, roe, operating_margin, gross_margin, revenue_cagr5, pe_trailing, ev_ebitda, market_cap_m, intrinsic_value, sector, industry, country'
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

async function buildCompanies(destWHT) {
  const fundMap = await fetchFundamentals()

  return DICT.map(([name, ticker, country, currency, sector, , type]) => {
    const f = fundMap[ticker] || null
    if (!f) {
      return { n: name, t: ticker, c: country, cont: getContinent(country), s: sector, cur: currency, tp: type || 'general',
        px: null, y: null, sc: null, mos: null, roic: null, streak: null, cagr: null, payout: null,
        debt: null, icov: null, opm: null, rev: null, pe: null, ev: null, mcap: null,
        moat: 'none', ero: false, dq: null, r1010: false }
    }
    const t = type || 'general'
    return {
      n: name, t: ticker, c: country, cont: getContinent(country), s: sector, cur: currency, tp: t,
      px:   f.current_price != null ? Number(f.current_price) : null,
      y:    yieldPct(f),
      sc:   computeScore(f, t),
      mos:  marginSafety(f),
      roic: resolveRoic(f),
      streak: f.div_streak != null ? Number(f.div_streak) : null,
      cagr:   f.div_cagr5 != null ? Number(f.div_cagr5) : null,
      payout: f.payout_fcf != null ? Number(f.payout_fcf) : (f.payout_eps != null ? Number(f.payout_eps) : null),
      debt:   f.net_debt_ebitda != null ? Number(f.net_debt_ebitda) : (f.debt_ebitda != null ? Number(f.debt_ebitda) : null),
      icov:   f.interest_coverage != null ? Number(f.interest_coverage) : null,
      opm:    f.operating_margin != null ? Number(f.operating_margin) : null,
      rev:    f.revenue_cagr5 != null ? Number(f.revenue_cagr5) : null,
      pe:     f.pe_trailing != null ? Number(f.pe_trailing) : null,
      ev:     f.ev_ebitda != null ? Number(f.ev_ebitda) : null,
      mcap:   f.market_cap_m != null ? Number(f.market_cap_m) : null,
      moat:   deriveMoat(f),
      ero:    moatErosion(f),
      dq:     calcDivQuality(f, t, country, destWHT),
      r1010:  rule1010(f),
    }
  })
}

export default async function ScreenerPage() {
  const { plan, destWHT } = await getUserContext()
  const companies = await buildCompanies(destWHT)
  const sectors = [...new Set(DICT.map(d => d[4]))].filter(Boolean).sort()

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/screener" />
      <ScreenerClient
        companies={companies}
        isPremium={plan === 'premium'}
        sectors={sectors}
        destWHT={destWHT}
      />
    </div>
  )
}
