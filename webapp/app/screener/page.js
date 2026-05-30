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
    const { data: rows } = await sb
      .from('market_charts')
      .select('data')
      .eq('range', 'fundamentals')

    // Flatten all markets' fundamentals into one ticker map (first-seen wins)
    const fundMap = {}
    for (const row of rows || []) {
      for (const [ticker, f] of Object.entries(row.data || {})) {
        if (!fundMap[ticker]) fundMap[ticker] = f
      }
    }

    return DICT.map(([name, ticker, country, , sector, , type]) => {
      const f = fundMap[ticker] ?? null
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
