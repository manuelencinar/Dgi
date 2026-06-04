// Lógica de cálculo del screener. project10y, netYield y calcDivQuality son
// portados del HTML original (project/js/helpers.js) manteniendo la fórmula exacta.

import { SECTORS, WHT_DEFAULTS } from '@/lib/sectors'

export function getWHT(country) { return WHT_DEFAULTS[country] ?? 0 }

// ROIC con prioridad: tangible → reported → legacy. Nunca vacío si hay alguno.
export function resolveRoic(f) {
  if (f == null) return null
  const t = num(f.roic_tangible), r = num(f.roic_reported), l = num(f.roic)
  return t ?? r ?? l
}

function num(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }

// Dividendo neto tras doble imposición (origen acreditado contra destino)
export function netYield(grossYield, originWHT, destWHT) {
  const effective = Math.max(originWHT, destWHT) / 100
  return parseFloat((grossYield * (1 - effective)).toFixed(4))
}

// Crecimiento del dividendo con fade lineal: el CAGR inicial se capa a CAGR_CAP
// y decae año a año hasta CAGR_TERMINAL. Más realista que un CAGR constante:
// ninguna empresa crece a doble dígito indefinidamente.
const CAGR_CAP      = 12   // tope del CAGR inicial (%)
const CAGR_TERMINAL = 3    // crecimiento terminal sostenible (%)
const FADE_YEARS    = 10   // años hasta converger a la terminal

// Factor acumulado de crecimiento del dividendo hasta el inicio del año `i` (0-based).
function divGrowthFactor(growthPct, i) {
  const g0 = Math.min(growthPct, CAGR_CAP)
  let factor = 1
  for (let k = 0; k < i; k++) {
    // g del año k (decae linealmente de g0 a la terminal a lo largo de FADE_YEARS)
    const g = g0 - (g0 - CAGR_TERMINAL) * (k / (FADE_YEARS - 1))
    factor *= 1 + Math.max(g, CAGR_TERMINAL) / 100
  }
  return factor
}

// Proyección a 10 años. El dividendo crece con CAGR decreciente (fade lineal).
// Devuelve [{year, gross, net, cum}].
export function project10y(investAmt, yieldPct, growthPct, originWHT, destWHT) {
  if (!investAmt || !yieldPct) return null
  const y = yieldPct / 100
  const effective = Math.max(originWHT, destWHT) / 100
  const rows = []; let cumNet = 0
  for (let i = 0; i < 10; i++) {
    const gross = investAmt * y * divGrowthFactor(growthPct || 0, i)
    const net = gross * (1 - effective)
    cumNet += net
    rows.push({ year: i + 1, gross: round2(gross), net: round2(net), cum: round2(cumNet) })
  }
  return rows
}

// Año en que la suma de dividendos netos iguala la inversión inicial (payback).
export function paybackYear(investAmt, yieldPct, growthPct, originWHT, destWHT) {
  if (!investAmt || !yieldPct) return null
  const y = yieldPct / 100
  const effective = Math.max(originWHT, destWHT) / 100
  let cum = 0
  for (let i = 0; i < 100; i++) {
    cum += investAmt * y * divGrowthFactor(growthPct || 0, i) * (1 - effective)
    if (cum >= investAmt) return i + 1
  }
  return null
}

function round2(v) { return parseFloat(v.toFixed(2)) }

// Margen de seguridad DCF en % a partir del valor intrínseco precalculado.
export function marginSafety(f) {
  const iv = num(f?.intrinsic_value), px = num(f?.current_price)
  if (iv == null || px == null || px <= 0) return null
  return Math.round((iv - px) / px * 1000) / 10
}

// Yield en % (dps / precio).
export function yieldPct(f) {
  const dps = num(f?.dps), px = num(f?.current_price)
  if (dps == null || px == null || px <= 0) return null
  return Math.round(dps / px * 10000) / 100
}

// Foso económico aproximado a partir de ROIC y margen bruto (rápido, para 2000 empresas).
export function deriveMoat(f) {
  const roic = resolveRoic(f), gm = num(f?.gross_margin)
  let score = 0
  if (roic != null) { if (roic > 20) score += 2; else if (roic > 12) score += 1 }
  if (gm != null)   { if (gm > 50) score += 2; else if (gm > 35) score += 1 }
  if (score >= 3) return 'wide'
  if (score >= 2) return 'narrow'
  return 'none'
}

// Señal de erosión del foso: ingresos en declive o márgenes débiles con ROIC bajo.
export function moatErosion(f) {
  const rev = num(f?.revenue_cagr5), roic = resolveRoic(f), om = num(f?.operating_margin)
  if (rev != null && rev < -2) return true
  if (roic != null && roic < 8 && om != null && om < 10) return true
  return false
}

// Score DGI 0-10 usando las métricas sector-aware (mismo enfoque que el HTML original).
const SECTOR_KEY = { banco: 'banco', aseguradora: 'aseguradora', reit: 'reit', bdc: 'bdc' }

export function computeScore(f, type) {
  if (!f) return null
  // Sin dividendo no es una empresa DGI evaluable → sin Score DGI
  const yld = yieldPct(f)
  if (yld == null || yld <= 0) return null
  const key = SECTOR_KEY[type] || 'general'
  const metrics = (SECTORS[key] || SECTORS.general).metrics
  const vals = mapValues(f)
  let tot = 0, cnt = 0
  for (const m of metrics) {
    const v = vals[m.id]
    if (v == null || v === '') continue
    const s = m.score(v)
    if (s != null) { tot += s; cnt++ }
  }
  return cnt > 0 ? Math.round(tot / cnt * 10) / 10 : null
}

// Mapea company_fundamentals a los ids de métricas de SECTORS.
function mapValues(f) {
  const roic = resolveRoic(f)
  // Un payout de 0 significa que no reparte, no que sea excelente → se ignora
  const payoutFcf = num(f.payout_fcf), payoutEps = num(f.payout_eps)
  return {
    yield_pct:    yieldPct(f),
    div_years:    num(f.div_streak),
    div_cagr5:    num(f.div_cagr5),
    payout_fcf:   payoutFcf != null && payoutFcf > 0 ? payoutFcf : null,
    payout_earn:  payoutEps != null && payoutEps > 0 ? payoutEps : null,
    fcf_cagr5:    num(f.fcf_cagr5),
    debt_ebitda:  num(f.net_debt_ebitda) ?? num(f.debt_ebitda),
    interest_cov: num(f.interest_coverage),
    roic:         roic,
    roe:          num(f.roe),
    eps_cagr5:    num(f.eps_cagr5),
    margin_safety: marginSafety(f),
  }
}

// Calidad del dividendo 💎 — portado de calcDivQuality del HTML original.
export function calcDivQuality(f, type, country, destWHT = 19) {
  // Sin dividendo no hay calidad del dividendo que medir
  const yldGate = yieldPct(f)
  if (yldGate == null || yldGate <= 0) return null

  let score = 0, weight = 0
  const isReitLike = type === 'reit' || type === 'bdc'
  // Un payout de 0 = no reparte → no puntúa como excelente
  const payout = num(f.payout_fcf) ?? num(f.payout_eps)
  if (payout != null && payout > 0) {
    const [t1, t2, t3, t4, t5] = isReitLike ? [70, 80, 90, 100, 110] : [40, 50, 60, 70, 80]
    const s = payout < t1 ? 10 : payout < t2 ? 9 : payout < t3 ? 7 : payout < t4 ? 5 : payout < t5 ? 3 : 1
    score += s * 1.5; weight += 1.5
  }
  const debt = num(f.net_debt_ebitda) ?? num(f.debt_ebitda)
  if (debt != null && debt >= 0) {
    const s = debt < 1 ? 10 : debt < 2 ? 8 : debt < 3 ? 6 : debt < 4 ? 4 : 2
    score += s; weight += 1
  }
  const cagr = num(f.div_cagr5)
  if (cagr != null && cagr > 0) {
    const s = cagr > 12 ? 10 : cagr > 9 ? 9 : cagr > 7 ? 8 : cagr > 5 ? 6 : cagr > 3 ? 4 : 2
    score += s * 1.5; weight += 1.5
  }
  const streak = num(f.div_streak) || 0
  if (streak > 0) {
    const s = streak >= 35 ? 10 : streak >= 25 ? 9 : streak >= 15 ? 7 : streak >= 10 ? 6 : streak >= 5 ? 4 : 2
    score += s; weight += 1
  }
  const yld = yieldPct(f)
  if (yld != null && yld > 0) {
    const ny = netYield(yld, getWHT(country), destWHT)
    const s = ny > 5 ? 10 : ny > 3.5 ? 8 : ny > 2.5 ? 6 : ny > 1.5 ? 4 : 2
    score += s; weight += 1
  }
  if (weight === 0) return null
  return Math.round(score / weight * 10) / 10
}

// Regla 10/10: yield + CAGR dividendo ≥ 10
export function rule1010(f) {
  const y = yieldPct(f), c = num(f.div_cagr5)
  if (y == null || c == null) return false
  return (y + c) >= 10
}

// ── Radar del comparador ─────────────────────────────────────────────────────
// Métricas y scoring 0-10 (mismas escalas que el scoring DGI). Conjunto general
// para que el radar funcione también con empresas de sectores mixtos.
const G = SECTORS.general.metrics
const scoreOf = id => (G.find(m => m.id === id) || {}).score || (() => null)

export const RADAR_METRICS = [
  { id: 'yield',     short: 'Yield',     get: f => yieldPct(f),                                   score: v => scoreOf('yield_pct')(v) },
  { id: 'streak',    short: 'Racha',     get: f => num(f.div_streak),                             score: v => scoreOf('div_years')(v) },
  { id: 'cagr',      short: 'CAGR Div',  get: f => num(f.div_cagr5),                              score: v => scoreOf('div_cagr5')(v) },
  { id: 'payout',    short: 'Payout',    get: f => { const p = num(f.payout_fcf); return p > 0 ? p : null }, score: v => scoreOf('payout_fcf')(v) },
  { id: 'roic',      short: 'ROIC',      get: f => resolveRoic(f),                                score: v => scoreOf('roic')(v) },
  { id: 'gmargin',   short: 'M.Bruto',   get: f => num(f.gross_margin),                           score: marginScore },
  { id: 'omargin',   short: 'M.Op.',     get: f => num(f.operating_margin),                       score: marginScore },
  { id: 'debt',      short: 'Deuda',     get: f => num(f.net_debt_ebitda) ?? num(f.debt_ebitda),  score: v => scoreOf('debt_ebitda')(v) },
  { id: 'icov',      short: 'Cobertura', get: f => num(f.interest_coverage),                      score: v => scoreOf('interest_cov')(v) },
]

function marginScore(v) {
  const n = parseFloat(v); if (isNaN(n)) return null
  if (n > 50) return 10; if (n > 40) return 9; if (n > 30) return 8; if (n > 22) return 7
  if (n > 16) return 6; if (n > 11) return 5; if (n > 7) return 4; if (n > 4) return 3; if (n > 0) return 2; return 1
}

// Devuelve { metricId: score 0-10 } para el radar.
export function scoreRadar(f) {
  const out = {}
  for (const m of RADAR_METRICS) {
    const v = m.get(f)
    out[m.id] = v != null ? m.score(v) : null
  }
  return out
}
