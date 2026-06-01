import { createClient } from '@supabase/supabase-js'
import { createClient as authClient } from '@/lib/supabase/server'
import PublicNav from '@/components/PublicNav'
import ScreenerClient from '@/components/ScreenerClient'
import { DICT } from '@/data/dict'
import { scoreCompany } from '@/lib/dgi-metrics'
import { getContinent } from '@/lib/helpers'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Screener DGI avanzado | Mi Índice DGI',
  description: 'Filtra empresas de los 43 mercados globales por yield, sector, Score DGI y más criterios de inversión en dividendos crecientes.',
}

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserPlan() {
  try {
    const supabase = await authClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'free'
    if (user.email === ADMIN_EMAIL) return 'premium'
    const { data } = await supabase
      .from('user_settings')
      .select('plan, premium_until')
      .eq('user_id', user.id)
      .single()
    if (!data) return 'free'
    if (data.plan === 'premium' && data.premium_until) {
      return new Date(data.premium_until) >= new Date() ? 'premium' : 'free'
    }
    return data.plan || 'free'
  } catch { return 'free' }
}

async function buildCompanies() {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
    async function fetchAllRoic() {
      const all = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from('company_fundamentals')
          .select('ticker, roic_reported, roic_tangible')
          .range(from, from + 999)
        if (error || !data?.length) break
        all.push(...data)
        if (data.length < 1000) break
      }
      return all
    }

    const [{ data: rows }, roicAll] = await Promise.all([
      sb.from('market_charts').select('data').eq('range', 'fundamentals'),
      fetchAllRoic(),
    ])
    const roicRows = roicAll

    // Flatten all markets' fundamentals into one ticker map (first-seen wins)
    const fundMap = {}
    for (const row of rows || []) {
      for (const [ticker, f] of Object.entries(row.data || {})) {
        if (!fundMap[ticker]) fundMap[ticker] = f
      }
    }
    const roicMap = Object.fromEntries((roicRows || []).map(r => [r.ticker, r]))

    return DICT.map(([name, ticker, country, , sector, , type]) => {
      const f = fundMap[ticker] ?? null
      const rc = roicMap[ticker] ?? null
      return {
        n:  name,
        t:  ticker,
        c:  country,
        r:  getContinent(country),
        s:  sector,
        tp: type,
        y:  f?.yield  ?? null,
        pe: f?.pe     ?? null,
        pt: f?.payout ?? null,
        ep: f?.eps    ?? null,
        sc: f ? scoreCompany(f) : null,
        rr: rc?.roic_reported ?? null,
        rt: rc?.roic_tangible ?? null,
      }
    })
  } catch {
    // If Supabase fails, return DICT with no fundamentals
    return DICT.map(([name, ticker, country, , sector, , type]) => ({
      n: name, t: ticker, c: country,
      r: getContinent(country), s: sector, tp: type,
      y: null, pe: null, pt: null, ep: null, sc: null,
    }))
  }
}

export default async function ScreenerPage() {
  const [plan, companies] = await Promise.all([getUserPlan(), buildCompanies()])

  const sectors = [...new Set(DICT.map(d => d[4]))].sort()

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav active="/screener" />
      <ScreenerClient
        companies={companies}
        isPremium={plan === 'premium'}
        sectors={sectors}
      />
    </div>
  )
}
