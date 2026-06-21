import { createClient } from '@supabase/supabase-js'
import { DICT } from '@/data/dict'
import { getContinent, debtEbitdaIsArtifact } from '@/lib/helpers'
import {
  resolveRoic, yieldPct, marginSafety, computeScore, calcDivQuality,
  rule1010, scoreRadar, RADAR_METRICS, netYield, getWHT, cleanGrossMargin,
  mosUnreliable,
} from '@/lib/screener'

function num(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }
function avg(arr) { const v = arr.filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null }

// Sub-scores por categoría a partir de los scores 0-10 del radar + extras.
function subScores(f, radar, mos) {
  const s = id => radar[id]
  // Valoración: margen de seguridad (con el precio fresco) + PER
  const mosScore = mos == null ? null : mos > 40 ? 10 : mos > 30 ? 9 : mos > 20 ? 8 : mos > 10 ? 7 : mos > 0 ? 6 : mos > -10 ? 5 : mos > -20 ? 4 : mos > -30 ? 3 : mos > -50 ? 2 : 1
  const pe = num(f.pe_trailing)
  const peScore = pe == null || pe <= 0 ? null : pe < 10 ? 10 : pe < 15 ? 8 : pe < 20 ? 7 : pe < 25 ? 6 : pe < 30 ? 5 : pe < 40 ? 3 : 1
  return {
    dividendo: avg([s('yield'), s('streak'), s('cagr'), s('payout')]),
    calidad:   avg([s('roic'), s('gmargin'), s('omargin')]),
    solidez:   avg([s('debt'), s('icov')]),
    valoracion: avg([mosScore, peScore]),
  }
}

// Insights automáticos básicos (3 mejores señales) para las tarjetas.
function buildInsights(f) {
  const out = []
  const roic = resolveRoic(f), streak = num(f.div_streak), cagr = num(f.div_cagr5)
  const gm = num(f.gross_margin), debt = num(f.net_debt_ebitda) ?? num(f.debt_ebitda)
  const mos = marginSafety(f), rev = num(f.revenue_cagr5)
  if (roic != null && roic > 15) out.push({ v: `ROIC elevado (${roic.toFixed(1)}%)`, pos: true })
  if (streak != null && streak >= 50) out.push({ v: `Rey del dividendo: ${streak} años subiendo dividendo`, pos: true })
  else if (streak != null && streak >= 25) out.push({ v: `Aristócrata: ${streak} años subiendo dividendo`, pos: true })
  else if (streak != null && streak >= 10) out.push({ v: `Aspirante: ${streak} años consecutivos de subidas`, pos: true })
  if (cagr != null && cagr > 8) out.push({ v: `Dividendo crece al ${cagr.toFixed(1)}%/año`, pos: true })
  if (gm != null && gm > 45) out.push({ v: `Márgenes brutos sólidos (${gm.toFixed(0)}%)`, pos: true })
  if (mos != null && mos > 15 && !mosUnreliable(f)) out.push({ v: `Cotiza un ${mos.toFixed(0)}% por debajo de su valor`, pos: true })
  if (debtEbitdaIsArtifact(debt)) out.push({ v: `EBITDA cercano a cero — ratio deuda/EBITDA no representativo`, pos: false })
  else if (debt != null && debt > 4) out.push({ v: `Deuda elevada (${debt.toFixed(1)}x EBITDA)`, pos: false })
  if (rev != null && rev < 0) out.push({ v: `Ingresos en declive (${rev.toFixed(1)}%)`, pos: false })
  return out.slice(0, 3)
}

function deriveMoatLabel(f) {
  const roic = resolveRoic(f), gm = num(f.gross_margin)
  let sc = 0
  if (roic != null) { if (roic > 20) sc += 2; else if (roic > 12) sc += 1 }
  if (gm != null) { if (gm > 50) sc += 2; else if (gm > 35) sc += 1 }
  return sc >= 3 ? 'wide' : sc >= 2 ? 'narrow' : 'none'
}

const FIELDS = 'ticker, current_price, dps, div_streak, div_cagr5, payout_fcf, payout_eps, fcf_cagr5, revenue_cagr5, debt_ebitda, net_debt_ebitda, interest_coverage, current_ratio, roic, roic_reported, roic_tangible, roe, operating_margin, gross_margin, net_margin, pe_trailing, ev_ebitda, market_cap_m, intrinsic_value, valuation_warning, sector, industry, country'

// Construye los datos completos del comparador para una lista de tickers.
export async function buildComparadorCompanies(tickers, destWHT = 19) {
  const list = [...new Set((tickers || []).filter(Boolean))].slice(0, 5)
  if (!list.length) return []

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  let rows = []
  try {
    const { data } = await sb.from('company_fundamentals').select(FIELDS).in('ticker', list)
    rows = data || []
  } catch {}
  const fundMap = Object.fromEntries(rows.map(f => [f.ticker, f]))
  const dictMap = Object.fromEntries(DICT.map(d => [d[1], d]))

  // Precio fresco de daily_prices (prioridad sobre current_price de fundamentals)
  const freshPrice = {}
  try {
    const since = new Date(); since.setDate(since.getDate() - 7)
    const { data: dp } = await sb.from('daily_prices')
      .select('ticker, close_price, date')
      .in('ticker', list)
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false })
    for (const r of (dp || [])) if (!(r.ticker in freshPrice)) freshPrice[r.ticker] = Number(r.close_price)
  } catch {}

  // Mantener el orden en que llegaron los tickers
  return list.map(ticker => {
    const d = dictMap[ticker]
    const f = fundMap[ticker] || {}
    const name = d?.[0] || ticker
    const country = d?.[2] || f.country || 'US'
    const currency = d?.[3] || 'USD'
    const superSector = d?.[4] || f.sector || '—'
    const type = d?.[6] || 'general'

    const y = yieldPct(f)
    const roic = resolveRoic(f)
    // Precio: daily_prices (fresco) con fallback a current_price
    const price = freshPrice[ticker] ?? num(f.current_price)
    // Margen de seguridad recalculado con el precio usado
    const intrinsic = num(f.intrinsic_value)
    const mos = (intrinsic != null && price != null && price > 0) ? Math.round((intrinsic - price) / price * 1000) / 10 : null
    const radar = scoreRadar(f)
    const subs = subScores(f, radar, mos)

    return {
      ticker, name, country, currency, superSector, type,
      cont: getContinent(country),
      // Dividendo
      yield: y,
      yieldNet: y != null ? netYield(y, getWHT(country), destWHT, country === 'ES') : null,
      streak: num(f.div_streak),
      cagr: num(f.div_cagr5),
      payout: num(f.payout_fcf),
      rule1010: rule1010(f),
      // Calidad
      roic,
      grossMargin: cleanGrossMargin(f),
      opMargin: num(f.operating_margin),
      netMargin: num(f.net_margin),
      revCagr: num(f.revenue_cagr5),
      fcfCagr: num(f.fcf_cagr5),
      // Solidez
      debt: num(f.net_debt_ebitda) ?? num(f.debt_ebitda),
      icov: num(f.interest_coverage),
      currentRatio: num(f.current_ratio),
      // Valoración
      price,
      intrinsic,
      mos,
      pe: num(f.pe_trailing),
      ev: num(f.ev_ebitda),
      // Scoring
      score: computeScore(f, type),
      divQuality: calcDivQuality(f, type, country, destWHT),
      subDividendo: subs.dividendo, subCalidad: subs.calidad, subSolidez: subs.solidez, subValoracion: subs.valoracion,
      radar,
      // Tarjeta
      moat: deriveMoatLabel(f),
      insights: buildInsights(f),
      warning: f.valuation_warning || null,
      hasData: rows.some(r => r.ticker === ticker),
    }
  })
}

export { RADAR_METRICS }
