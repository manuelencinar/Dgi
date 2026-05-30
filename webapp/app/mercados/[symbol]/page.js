import { notFound } from 'next/navigation'
import PublicNav from '@/components/PublicNav'
import MarketDetail from '@/components/MarketDetail'
import { MARKETS } from '@/lib/markets'
import { getMarketQuotes } from '@/lib/market-quotes'
import { getChartData, getIndexStats, computeReturns } from '@/lib/market-charts'
import { getIndexConstituents } from '@/lib/index-constituents'
import { getConstituentQuotes } from '@/lib/constituent-quotes'
import { getCompanyFundamentals } from '@/lib/company-fundamentals'
import { computeDGIMetrics } from '@/lib/dgi-metrics'
import { saveMarketScore, getAllMarketScores } from '@/lib/market-scores'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'

async function getUserPlan() {
  try {
    const supabase = await createClient()
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
  } catch {
    return 'free'
  }
}

export default async function MarketPage({ params }) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeURIComponent(rawSymbol)

  const market = MARKETS.find(m => m.symbol === symbol)
  if (!market) notFound()

  const constituents = getIndexConstituents(symbol)
  const tickers      = constituents.map(c => c.ticker)

  const [
    quotesResult, chartResult, chart5yResult, statsResult,
    cqResult, fundResult, scoresResult, plan,
  ] = await Promise.all([
    getMarketQuotes(),
    getChartData(symbol, '1y'),
    getChartData(symbol, '5y'),
    getIndexStats(symbol),
    getConstituentQuotes(symbol, tickers),
    getCompanyFundamentals(symbol, tickers),
    getAllMarketScores(),
    getUserPlan(),
  ])

  const quote             = quotesResult?.quotes?.[symbol] ?? null
  const initialChart      = chartResult  ?? null
  const chart5y           = chart5yResult ?? null
  const stats             = statsResult  ?? null
  const constituentQuotes = cqResult     ?? {}
  const fundamentals      = fundResult   ?? {}
  const allScores         = scoresResult ?? {}
  const returns           = chart5y ? computeReturns(chart5y.timestamps, chart5y.closes) : {}

  const dgiMetrics = computeDGIMetrics(symbol, constituents, fundamentals)

  // Persist this market's score for the global ranking
  if (dgiMetrics) {
    await saveMarketScore(symbol, dgiMetrics.dgiScore, dgiMetrics.avgYield, dgiMetrics.bondRate, dgiMetrics.opportunities?.length ?? 0)
  }

  // Pre-build ranking: markets with a cached score, sorted descending
  const ranking = MARKETS
    .filter(m => allScores[m.symbol] != null)
    .map(m => ({
      symbol:  m.symbol,
      name:    m.name,
      flag:    m.flag,
      country: m.country,
      score:   allScores[m.symbol].score,
    }))
    .sort((a, b) => b.score - a.score)

  // Include current market even if just computed (may not be persisted yet)
  if (dgiMetrics && !ranking.find(r => r.symbol === symbol)) {
    ranking.push({ symbol, name: market.name, flag: market.flag, country: market.country, score: dgiMetrics.dgiScore })
    ranking.sort((a, b) => b.score - a.score)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080b14' }}>
      <PublicNav />
      <MarketDetail
        market={market}
        quote={quote}
        initialChartData={initialChart}
        stats={stats}
        returns={returns}
        constituents={constituents}
        constituentQuotes={constituentQuotes}
        dgiMetrics={dgiMetrics}
        ranking={ranking}
        isPremium={plan === 'premium'}
      />
    </div>
  )
}
