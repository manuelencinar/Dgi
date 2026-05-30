import { NextResponse } from 'next/server'
import { MARKETS } from '@/lib/markets'
import { getIndexConstituents } from '@/lib/index-constituents'
import { getCompanyFundamentals } from '@/lib/company-fundamentals'
import { computeDGIMetrics } from '@/lib/dgi-metrics'
import { saveMarketScore } from '@/lib/market-scores'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'vayaebookk@gmail.com'
const DELAY_MS    = 600

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Auth error' }, { status: 401 })
  }

  const results = []

  for (const market of MARKETS) {
    const constituents = getIndexConstituents(market.symbol)
    if (constituents.length === 0) {
      results.push({ symbol: market.symbol, skipped: true, reason: 'no constituents' })
      continue
    }

    try {
      const tickers      = constituents.map(c => c.ticker)
      const fundamentals = await getCompanyFundamentals(market.symbol, tickers)
      const dgiMetrics   = computeDGIMetrics(market.symbol, constituents, fundamentals)

      if (dgiMetrics) {
        await saveMarketScore(
          market.symbol,
          dgiMetrics.dgiScore,
          dgiMetrics.avgYield,
          dgiMetrics.bondRate,
          dgiMetrics.opportunities?.length ?? 0,
        )
        results.push({
          symbol: market.symbol,
          score:  dgiMetrics.dgiScore,
          yield:  +(dgiMetrics.avgYield * 100).toFixed(2),
          opps:   dgiMetrics.opportunities?.length ?? 0,
        })
      } else {
        results.push({ symbol: market.symbol, skipped: true, reason: 'no metrics' })
      }
    } catch (err) {
      results.push({ symbol: market.symbol, error: String(err.message) })
    }

    await sleep(DELAY_MS)
  }

  const computed = results.filter(r => r.score != null).length
  return NextResponse.json({ ok: true, computed, total: MARKETS.length, results })
}
