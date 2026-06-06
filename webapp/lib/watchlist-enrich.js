// Enriquecimiento server-side de la watchlist: combina las filas de la tabla
// `watchlist` con metadatos (DICT), fundamentales (Score DGI, dps) y el último
// precio de daily_prices. Reutilizado por la página /watchlist y por la mini
// watchlist de la cartera.

import { DICT } from '@/data/dict'
import { computeScore } from '@/lib/screener'
import { getContinent } from '@/lib/helpers'
import { priceProximity, priceForYield } from '@/lib/watchlist'

const META = Object.fromEntries(DICT.map(d => [d[1], d]))
const FIELDS = 'ticker, current_price, dps, div_streak, div_cagr5, payout_fcf, payout_eps, fcf_cagr5, debt_ebitda, net_debt_ebitda, interest_coverage, roic, roic_reported, roic_tangible, roe, eps_cagr5, intrinsic_value, sector, country'

// rows: filas de la tabla watchlist (ya filtradas por usuario).
// sb: cliente Supabase con permisos para leer company_fundamentals/daily_prices.
export async function buildWatchlistRows(sb, rows) {
  if (!rows?.length) return []
  const tickers = [...new Set(rows.map(r => r.ticker))]

  const cutoff = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10)
  const [{ data: funds }, { data: prices }] = await Promise.all([
    sb.from('company_fundamentals').select(FIELDS).in('ticker', tickers),
    sb.from('daily_prices').select('ticker, close_price, date').in('ticker', tickers).gte('date', cutoff).order('date', { ascending: false }),
  ])

  const fundMap = Object.fromEntries((funds || []).map(f => [f.ticker, f]))
  // Últimos dos cierres por ticker → precio actual + variación diaria.
  const closes = {}
  for (const p of prices || []) {
    if (!closes[p.ticker]) closes[p.ticker] = []
    if (closes[p.ticker].length < 2) closes[p.ticker].push(Number(p.close_price))
  }

  return rows.map(r => {
    const meta = META[r.ticker] || []
    const [name, , country, currency, sector, , type] = meta
    const f = fundMap[r.ticker] || null
    const cl = closes[r.ticker] || []

    const currentPrice = cl[0] ?? (f?.current_price != null ? Number(f.current_price) : null)
    const prevClose = cl[1] ?? null
    const changePct = currentPrice != null && prevClose != null && prevClose > 0 ? (currentPrice - prevClose) / prevClose * 100 : null

    const dps = f?.dps != null ? Number(f.dps) : null
    const yld = dps != null && currentPrice != null && currentPrice > 0 ? dps / currentPrice * 100 : null
    const score = f ? computeScore(f, type || 'general') : null

    const targetPrice = r.target_price != null ? Number(r.target_price) : null
    const targetYield = r.target_yield != null ? Number(r.target_yield) : null

    return {
      id: r.id,
      ticker: r.ticker,
      name: name || r.ticker,
      country: country || null,
      continent: country ? getContinent(country) : null,
      sector: sector || null,
      currency: currency || 'EUR',
      notes: r.notes || null,
      createdAt: r.created_at,
      alertPrice: !!r.alert_price_active,
      alertYield: !!r.alert_yield_active,
      currentPrice,
      changePct,
      score,
      yld,
      dps,
      targetPrice,
      targetYield,
      proximity: priceProximity(currentPrice, targetPrice),
      priceForTargetYield: priceForYield(dps, targetYield),
    }
  })
}

// Ordena por proximidad al objetivo de precio (en zona primero, luego más cerca).
export function sortByProximity(items) {
  return [...items].sort((a, b) => {
    const pa = a.proximity, pb = b.proximity
    const va = pa ? (pa.inZone ? -1000 + pa.pct : pa.pct) : Infinity
    const vb = pb ? (pb.inZone ? -1000 + pb.pct : pb.pct) : Infinity
    return va - vb
  })
}
