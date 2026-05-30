import { createClient } from '@supabase/supabase-js'
import { MARKETS } from '@/lib/markets'
import { getIndexConstituents } from '@/lib/index-constituents'
import { computeDGIMetrics } from '@/lib/dgi-metrics'

const RANGE_KEY  = 'dgi_score'
const FUND_KEY   = 'fundamentals'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export async function saveMarketScore(symbol, score, avgYield, bondRate, opportunityCount = 0) {
  try {
    const sb = serviceClient()
    await sb.from('market_charts').upsert({
      symbol, range: RANGE_KEY,
      data: { score, avgYield, bondRate, opportunityCount },
      fetched_at: new Date().toISOString(),
    })
  } catch {}
}

// Returns { [symbol]: { score, avgYield, bondRate, opportunityCount } }
export async function getAllMarketScores() {
  try {
    const sb = serviceClient()
    const { data } = await sb
      .from('market_charts')
      .select('symbol, data')
      .eq('range', RANGE_KEY)
    const out = {}
    for (const row of data || []) out[row.symbol] = row.data
    return out
  } catch {
    return {}
  }
}

// Reads cached scores + cached fundamentals; computes & persists missing scores.
// Returns { [symbol]: { score, avgYield, bondRate, opportunityCount } }
export async function getAndComputeAllScores() {
  try {
    const sb = serviceClient()

    // One round-trip: read both scores and fundamentals (oldest first so latest overwrites)
    const { data: rows } = await sb
      .from('market_charts')
      .select('symbol, range, data')
      .in('range', [RANGE_KEY, FUND_KEY])
      .order('fetched_at', { ascending: true })

    const scores = {}
    const fundsBySymbol = {}
    for (const row of rows || []) {
      if (row.range === RANGE_KEY)  scores[row.symbol]      = row.data
      if (row.range === FUND_KEY)   fundsBySymbol[row.symbol] = row.data
    }

    // Compute scores for markets that have fundamentals cached but no score
    const toCompute = MARKETS.filter(m => fundsBySymbol[m.symbol] && !scores[m.symbol])

    if (toCompute.length > 0) {
      const upserts = []
      for (const market of toCompute) {
        const constituents = getIndexConstituents(market.symbol)
        if (constituents.length === 0) continue
        const dgi = computeDGIMetrics(market.symbol, constituents, fundsBySymbol[market.symbol])
        if (!dgi) continue
        const row = {
          symbol: market.symbol,
          range:  RANGE_KEY,
          data:   { score: dgi.dgiScore, avgYield: dgi.avgYield, bondRate: dgi.bondRate, opportunityCount: dgi.opportunities?.length ?? 0 },
          fetched_at: new Date().toISOString(),
        }
        scores[market.symbol] = row.data
        upserts.push(row)
      }
      if (upserts.length > 0) {
        // Fire-and-forget is fine here: the computed scores are already in `scores`
        sb.from('market_charts')
          .upsert(upserts)
          .then(() => {})
          .catch(() => {})
      }
    }

    return scores
  } catch {
    return {}
  }
}
