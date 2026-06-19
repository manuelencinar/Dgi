import { createClient } from '@supabase/supabase-js'
import { roicForScoring } from '@/lib/metrics'
import { computeCDR } from '@/lib/capital-discipline'
import { dividendTrend, dividendTrendBadges } from '@/lib/helpers'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

// ── divHistory — añade isPartial en tiempo real ───────────────────────────

function enrichDivHistory(history) {
  if (!Array.isArray(history) || !history.length) return []
  const currentYear = new Date().getFullYear()
  return [...history]
    .sort((a, b) => a.year - b.year)
    .map(h => ({ ...h, isPartial: h.year === currentYear }))
}

// ── Main fetcher ───────────────────────────────────────────────────────────

export async function getCompanyDetail(ticker) {
  try {
    const { data } = await sb()
      .from('company_fundamentals')
      .select('*')
      .eq('ticker', ticker)
      .single()
    if (!data) return null
    return { ...data, divHistory: enrichDivHistory(data.div_history ?? []) }
  } catch {
    return null
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function n(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }

function findStmtRow(stmtData, ...keys) {
  if (!stmtData) return null
  for (const k of keys) { if (stmtData[k] != null) return stmtData[k] }
  return null
}

// ── Detección de crecimiento vía adquisiciones ─────────────────────────────
// Activa cuando ≥2 de: adquisiciones recurrentes, goodwill creció >30%,
// goodwill >40% de activos, deuda neta creció con los ingresos.

export function detectAcquisitions(data) {
  if (!data) return null

  const cfData = data.cashflow_annual?.data
  const bsData = data.balance_sheet_annual?.data

  if (!cfData && !bsData) return null

  const conditions = []

  // ── Goodwill como % de activos totales ─────────────────────────────────
  const gwRow = findStmtRow(bsData,
    'Fondo de Comercio', 'Goodwill',
    'Fondo de Comercio e Intangibles', 'Goodwill And Other Intangible Assets')
  const atRow = findStmtRow(bsData, 'Activos Totales', 'Total Assets')

  let goodwillPct  = null
  let goodwillGrow = null

  if (gwRow?.length && atRow?.length) {
    const gw = gwRow[0], at = atRow[0]
    if (gw != null && at != null && at > 0) {
      goodwillPct = (gw / at) * 100
      if (goodwillPct > 40) conditions.push('goodwill_high')
    }

    // Crecimiento de goodwill en los últimos 4 años disponibles
    const valid = gwRow.slice(0, 4).filter(v => v != null)
    if (valid.length >= 2) {
      const recent = valid[0], older = valid[valid.length - 1]
      if (older > 0) {
        goodwillGrow = ((recent / older) - 1) * 100
        if (goodwillGrow > 30) conditions.push('goodwill_grew')
      }
    }
  }

  // ── Gasto en adquisiciones vs FCF ──────────────────────────────────────
  const bizRow = findStmtRow(cfData,
    'Adquisición de Negocios', 'Purchase Of Business',
    'Compraventa Neta de Negocios', 'Net Business Purchase And Sale')
  const fcfRow = findStmtRow(cfData,
    'Flujo de Caja Libre', 'Free Cash Flow')

  if (bizRow?.length && fcfRow?.length) {
    const n = Math.min(bizRow.length, fcfRow.length, 4)
    let heavyYears = 0
    for (let i = 0; i < n; i++) {
      const acq = bizRow[i], fcf = fcfRow[i]
      if (acq != null && fcf != null && acq < 0 && fcf > 0 && Math.abs(acq) / fcf > 0.15) {
        heavyYears++
      }
    }
    if (heavyYears >= 2) conditions.push('acq_spending')
  }

  if (conditions.length < 2) return null
  return { conditions, goodwillPct, goodwillGrow }
}
function weighted(items) {
  const total = items.reduce((s, i) => s + i.s * i.w, 0)
  const wt    = items.reduce((s, i) => s + i.w, 0)
  return wt > 0 ? Math.round(total / wt) : null
}

// ── 1. HEALTH SCORE ────────────────────────────────────────────────────────
// Campos en %: roe, roa, operating_margin, gross_margin, net_margin, roic
// Ratios crudos: debt_ebitda, current_ratio, interest_coverage
// Payout en %: payout_fcf, payout_eps

export function computeHealthScore(data, type) {
  if (!data) return null

  const debt    = n(data.debt_ebitda)
  const roe     = n(data.roe)
  const roa     = n(data.roa)
  const opM     = n(data.operating_margin)
  const grM     = n(data.gross_margin)
  const netM    = n(data.net_margin)
  const cr      = n(data.current_ratio)
  const fcfPos  = data.fcf_per_share != null ? data.fcf_per_share > 0 : null
  const fcfCagr = n(data.fcf_cagr5)
  const roic    = roicForScoring(data) ?? n(data.roic)
  const intCov  = n(data.interest_coverage)
  const payout  = data.payout_fcf != null ? n(data.payout_fcf)
                : data.payout_eps != null ? n(data.payout_eps) : null

  const items = []
  const push = (s, w) => items.push({ s, w })

  if (type === 'banco' || type === 'aseguradora') {
    if (roe    != null) push(roe > 18 ? 95 : roe > 14 ? 80 : roe > 10 ? 65 : roe > 6 ? 45 : 20, 3)
    if (roa    != null) push(roa > 2  ? 95 : roa > 1.5 ? 80 : roa > 1  ? 65 : roa > 0.5 ? 45 : 20, 3)
    if (payout != null) push(payout < 35 ? 95 : payout < 50 ? 80 : payout < 65 ? 65 : payout < 80 ? 40 : 15, 2)
    if (opM    != null) push(opM > 35 ? 90 : opM > 22 ? 75 : opM > 12 ? 55 : opM > 5 ? 35 : 15, 2)
  } else if (type === 'reit' || type === 'bdc') {
    // Deuda permisiva hasta 10x
    if (debt   != null) push(debt < 3 ? 90 : debt < 5 ? 75 : debt < 7 ? 55 : debt < 10 ? 35 : 15, 2)
    if (roe    != null) push(roe  > 10 ? 85 : roe > 7  ? 70 : roe > 4  ? 50 : 20, 2)
    if (payout != null) push(payout < 70 ? 90 : payout < 80 ? 75 : payout < 90 ? 55 : payout < 100 ? 35 : 15, 2)
    if (grM    != null) push(grM  > 70 ? 90 : grM > 50 ? 75 : grM > 30 ? 55 : 25, 1)
  } else {
    const isUtility  = type === 'utilities'
    const debtCap    = isUtility ? 8 : 5
    // Deuda
    if (debt   != null) push(debt < 1 ? 98 : debt < 2 ? 85 : debt < 3 ? 68 : debt < debtCap ? 40 : 12, 2)
    // Cobertura intereses
    if (intCov != null) push(intCov > 20 ? 95 : intCov > 10 ? 82 : intCov > 5 ? 65 : intCov > 3 ? 42 : 15, 2)
    // Margen operativo
    if (opM    != null) push(opM > 30 ? 95 : opM > 20 ? 80 : opM > 10 ? 62 : opM > 4 ? 38 : 15, 2)
    // ROIC
    if (roic   != null) push(roic > 25 ? 98 : roic > 18 ? 85 : roic > 12 ? 68 : roic > 6 ? 42 : 15, 2)
    // ROE
    if (roe    != null) push(roe > 22 ? 95 : roe > 16 ? 80 : roe > 10 ? 62 : roe > 5 ? 38 : 15, 2)
    // FCF positivo (no penaliza utilities)
    if (!isUtility && fcfPos != null) push(fcfPos ? 88 : 10, 2)
    // FCF CAGR
    if (fcfCagr != null) push(fcfCagr > 15 ? 95 : fcfCagr > 8 ? 80 : fcfCagr > 3 ? 62 : fcfCagr > 0 ? 45 : 18, 1.5)
    // Payout
    if (payout != null) push(payout < 35 ? 95 : payout < 55 ? 80 : payout < 70 ? 62 : payout < 85 ? 38 : 10, 2)
    // Liquidez
    if (cr     != null) push(cr > 2.5 ? 90 : cr > 1.8 ? 75 : cr > 1.2 ? 55 : cr > 0.8 ? 32 : 12, 1)
    // Margen bruto
    if (grM    != null) push(grM > 60 ? 90 : grM > 40 ? 75 : grM > 20 ? 55 : 22, 1)
  }

  if (!items.length) return null
  let score = weighted(items)

  // Penalización si goodwill > 50% de activos totales
  const gwRow2 = findStmtRow(data.balance_sheet_annual?.data, 'Fondo de Comercio', 'Goodwill', 'Fondo de Comercio e Intangibles')
  const atRow2 = findStmtRow(data.balance_sheet_annual?.data, 'Activos Totales', 'Total Assets')
  if (gwRow2?.[0] != null && atRow2?.[0] != null && atRow2[0] > 0) {
    const gwPct = (gwRow2[0] / atRow2[0]) * 100
    if (gwPct > 50) score = Math.max(0, score - 5)
  }

  return score
}

// ── 2. MOAT — sistema de puntuación 0–100 ─────────────────────────────────
// Adaptado del original: ROIC (35pts) + margen bruto (25pts) + FCF CAGR (20pts)
// + margen operativo nivel como proxy de estabilidad (20pts)
// Wide ≥60 · Narrow ≥35

export function computeMoat(data, streak) {
  if (!data) return { width: 'none', label: 'Sin datos', signals: [], negative: [], sources: [] }

  // ROIC corregido (reported preferido); el campo roic legacy estaba disparado
  let roic       = n(data.roic_reported) ?? n(data.roic)
  const roicTang = n(data.roic_tangible)
  const grM     = n(data.gross_margin)
  const opM     = n(data.operating_margin)
  const fcfCagr = n(data.fcf_cagr5)
  const revCagr = n(data.revenue_cagr5)
  const rg      = data.revenue_growth_yoy != null ? n(data.revenue_growth_yoy) : null

  // ── Foso sector-aware para BANCA/SEGUROS ──────────────────────────────────
  // El ROIC y los márgenes brutos no aplican a financieras (de ahí el falso
  // "Sin foso" pese a un Score alto). Se mide con ROE sostenido, escala y racha.
  const _sec = (data.sector || '').toLowerCase(), _ind = (data.industry || '').toLowerCase()
  const isBankIns = _sec.includes('financ') || _ind.includes('bank') || _ind.includes('insur') ||
    _ind.includes('capital market') || _ind.includes('asset manage')
  if (isBankIns) {
    const roe = n(data.roe), mcap = n(data.market_cap_m)
    let s = 0; const sig = [], neg = []
    if (roe != null) {
      if      (roe > 18) { s += 40; sig.push(`ROE excepcional (${roe.toFixed(1)}%) — rentabilidad muy superior a su coste de capital`) }
      else if (roe > 13) { s += 28; sig.push(`ROE sólido (${roe.toFixed(1)}%)`) }
      else if (roe > 10) { s += 15 }
      else if (roe < 8)    neg.push(`ROE bajo (${roe.toFixed(1)}%) — rentabilidad insuficiente para el sector`)
    }
    if (streak >= 20) { s += 20; sig.push(`${streak} años consecutivos aumentando el dividendo`) }
    else if (streak >= 10) s += 10
    if (mcap != null) {
      if      (mcap > 50000) { s += 20; sig.push('Gran escala y diversificación del riesgo') }
      else if (mcap > 10000)   s += 10
    }
    const w = s >= 60 ? 'wide' : s >= 35 ? 'narrow' : 'none'
    const lbl = w === 'wide' ? 'Foso ancho' : w === 'narrow' ? 'Foso estrecho'
      : 'Foso difícil de medir con métricas estándar en banca/seguros'
    return { width: w, label: lbl, signals: sig, negative: neg, sources: w !== 'none' ? ['ROE sostenido', 'Escala y marca'] : [], score: s }
  }

  // ── Foso sector-aware para REITs ──────────────────────────────────────────
  // El ROIC y el margen bruto no aplican a un REIT (negocio capital-intensivo
  // por naturaleza). Se mide por escala/diversificación, crecimiento de rentas,
  // margen operativo (calidad de activos) y racha del dividendo.
  const isReit = _ind.includes('reit') || _ind.includes('real estate investment') || _sec.includes('real estate')
  if (isReit) {
    const mcap = n(data.market_cap_m)
    let s = 0; const sig = [], neg = []
    if (mcap != null) {
      if      (mcap > 20000) { s += 30; sig.push('Gran escala — REIT diversificado de gran capitalización') }
      else if (mcap > 5000)    s += 18
      else if (mcap < 1000)    neg.push('REIT de pequeña capitalización — menor diversificación de activos')
    }
    if (revCagr != null) {
      if      (revCagr > 6) { s += 25; sig.push(`Rentas creciendo con fuerza (CAGR ${revCagr.toFixed(1)}%)`) }
      else if (revCagr > 3)   s += 15
      else if (revCagr > 0)   s += 6
      else                    neg.push(`Rentas en contracción (${revCagr.toFixed(1)}%)`)
    }
    if (opM != null) {
      if      (opM > 55) { s += 20; sig.push(`Margen operativo alto (${opM.toFixed(0)}%) — activos de calidad`) }
      else if (opM > 40)   s += 10
    }
    if (streak >= 15) { s += 20; sig.push(`${streak} años consecutivos aumentando el dividendo`) }
    else if (streak >= 10) s += 12
    else if (streak >= 5)  s += 6
    const w = s >= 60 ? 'wide' : s >= 35 ? 'narrow' : 'none'
    const lbl = w === 'wide' ? 'Foso ancho' : w === 'narrow' ? 'Foso estrecho'
      : 'Foso difícil de medir con métricas estándar en REITs'
    return { width: w, label: lbl, signals: sig, negative: neg, sources: w !== 'none' ? ['Escala y ubicación de activos', 'Rentas crecientes'] : [], score: s }
  }

  let score = 0
  const signals  = []
  const negative = []

  // ROIC: hasta 35 pts. Por encima de 60% el dato es poco fiable (bajo capital
  // contable por recompras/intangibles): intentar el tangible y, si sigue >60,
  // no presumir "excepcional".
  if (roic != null && roic >= 60) {
    if (roicTang != null && roicTang < 60) roic = roicTang
    else { score += 20; signals.push('ROIC elevado — verificar estructura de capital'); roic = null }
  }
  if (roic != null) {
    if      (roic > 25) { score += 35; signals.push(`ROIC excepcional (${roic.toFixed(1)}%) — retornos muy superiores al coste de capital`) }
    else if (roic > 20) { score += 28; signals.push(`ROIC muy elevado (${roic.toFixed(1)}%)`) }
    else if (roic > 15) { score += 20; signals.push(`ROIC sólido (${roic.toFixed(1)}%)`) }
    else if (roic > 10) { score += 10 }
    else if (roic <  6)   negative.push(`ROIC bajo (${roic.toFixed(1)}%) — rentabilidad sobre capital insuficiente`)
  }

  // Margen bruto: hasta 25 pts
  if (grM != null) {
    if      (grM > 60) { score += 25; signals.push(`Alto poder de fijación de precios (${grM.toFixed(0)}% margen bruto)`) }
    else if (grM > 45) { score += 18; signals.push(`Márgenes brutos sólidos (${grM.toFixed(0)}%)`) }
    else if (grM > 30)   score += 10
    else if (grM > 20)   score += 5
    else if (grM < 15)   negative.push(`Margen bruto bajo (${grM.toFixed(0)}%) — poca diferenciación de producto`)
  }

  // Margen operativo nivel como proxy de estabilidad: hasta 20 pts
  if (opM != null) {
    if      (opM > 30) { score += 20; signals.push(`Margen operativo excepcional (${opM.toFixed(1)}%)`) }
    else if (opM > 20) { score += 14; signals.push(`Margen operativo sólido (${opM.toFixed(1)}%)`) }
    else if (opM > 12)   score += 8
    else if (opM > 5)    score += 3
    else if (opM < 3)    negative.push(`Margen operativo muy bajo (${opM.toFixed(1)}%) — escaso colchón operativo`)
  }

  // FCF CAGR: hasta 20 pts
  if (fcfCagr != null) {
    if      (fcfCagr > 12) { score += 20; signals.push(`FCF creciendo con fuerza (CAGR ${fcfCagr.toFixed(1)}%)`) }
    else if (fcfCagr >  6)   score += 12
    else if (fcfCagr >  0)   score += 6
    else if (fcfCagr < -5)   negative.push(`FCF cayendo (CAGR ${fcfCagr.toFixed(1)}%)`)
  }

  // Crecimiento vía adquisiciones
  const acq = detectAcquisitions(data)
  if (acq) negative.push('Crecimiento basado en adquisiciones — verificar sostenibilidad orgánica')

  // Racha de dividendos (señal de estabilidad del negocio)
  if (streak >= 20) signals.push(`${streak} años consecutivos aumentando el dividendo`)
  else if (streak >= 10) signals.push(`${streak} años consecutivos de dividendo creciente`)

  // Ingresos en contracción
  if (rg != null && rg < -8) negative.push(`Ingresos en contracción (${rg.toFixed(1)}% interanual)`)

  // Clasificación. Telecos: foso conservador por defecto — pierden pricing power
  // con el tiempo (competencia, capex de red), así que se capa a 'estrecho'.
  const isTelecom = /telecom/i.test(data.industry || '')
  let width = score >= 60 ? 'wide' : score >= 35 ? 'narrow' : 'none'
  if (isTelecom && width === 'wide') { width = 'narrow'; negative.push('Foso difícil de mantener en telecos — tienden a perder poder de fijación de precios') }
  if (width === 'none' && signals.length === 0) {
    return { width: 'none', label: 'Sin foso detectado', signals: [], negative, sources: [], score }
  }

  const label = width === 'wide'   ? 'Foso ancho'
              : width === 'narrow' ? 'Foso estrecho'
              :                      'Sin foso detectado'

  // Fuentes del foso
  const sources = []
  if (grM != null && grM > 50 && roic != null && roic > 15) sources.push('Activos intangibles / marca reconocida')
  else if (grM != null && grM > 50) sources.push('Poder de fijación de precios')
  if (roic != null && roic > 20 && grM != null && grM < 40) sources.push('Ventaja de costes o escala')
  if (revCagr != null && revCagr > 8 && roic != null && roic > 15) sources.push('Posible efecto red o costes de cambio')
  if (opM != null && opM > 25) sources.push('Eficiencia operativa superior al sector')

  return { width, label, signals, negative, sources, score }
}

// ── 3. VALORACIÓN — delegado a lib/valuation.js ───────────────────────────

// ── 4. PROJECTION ─────────────────────────────────────────────────────────

export function computeProjection(history, cagr) {
  const full = history.filter(h => !h.isPartial)
  if (!full.length) return []
  const baseDps     = full[full.length - 1].dps
  // Crecimiento base acotado a una banda razonable (evita artefactos del CAGR).
  const g           = Math.max(-0.5, Math.min(cagr ?? 0.05, 0.5))
  // Escenarios como OFFSET ADITIVO (no multiplicativo): así el optimista queda
  // SIEMPRE por encima del base y del conservador, también con dividendo
  // decreciente (g<0). Antes (g*0.6 / g*1.4) se invertían con CAGR negativo:
  // el "conservador" caía más lento y dejaba más renta que el "optimista".
  // El spread escala con la magnitud del crecimiento (mínimo 2 pp).
  const spread = Math.max(0.02, Math.abs(g) * 0.4)
  const gCons  = Math.max(g - spread, -0.9)
  const gOpt   = g + spread
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 10 }, (_, i) => ({
    year:         currentYear + i + 1,
    conservative: parseFloat((baseDps * Math.pow(1 + gCons, i + 1)).toFixed(4)),
    base:         parseFloat((baseDps * Math.pow(1 + g,     i + 1)).toFixed(4)),
    optimistic:   parseFloat((baseDps * Math.pow(1 + gOpt,  i + 1)).toFixed(4)),
  }))
}

// ── 4b. VALORACIÓN ────────────────────────────────────────────────────────

export { computeValuation } from '@/lib/valuation'

// ── 5. DGI SCORE — delegado a lib/dgi-score.js ────────────────────────────

export { computeDGIScore } from '@/lib/dgi-score'

// ── 6. INSIGHTS — 25+ señales green/yellow/red ────────────────────────────

export function buildInsights(data, streak, cagr, dcf) {
  if (!data) return []

  const yld     = data.current_price > 0 ? (n(data.dps) ?? 0) / data.current_price : null
  const payout  = data.payout_fcf != null ? n(data.payout_fcf)
                : data.payout_eps != null ? n(data.payout_eps) : null
  const roe     = n(data.roe)
  const opM     = n(data.operating_margin)
  const grM     = n(data.gross_margin)
  const netM    = n(data.net_margin)
  const roic    = n(data.roic)
  const rg      = data.revenue_growth_yoy  != null ? n(data.revenue_growth_yoy)  : null
  const eg      = data.earnings_growth_yoy != null ? n(data.earnings_growth_yoy) : null
  const fcfPos  = data.fcf_per_share != null ? data.fcf_per_share > 0 : null
  const fcfCagr = n(data.fcf_cagr5)
  const nd      = n(data.net_debt)      // en M€/$
  const nde     = n(data.net_debt_ebitda)
  const intCov  = n(data.interest_coverage)
  const beta    = n(data.beta)
  const price   = n(data.current_price)
  const high52  = n(data.week52_high)
  const low52   = n(data.week52_low)

  const insights = []
  const add = (cat, type, text) => insights.push({ cat, type, text })

  // ── DIVIDENDO ─────────────────────────────────────────────────────────
  if (yld != null) {
    if      (yld >= 0.07)   add('dividendo', 'positive', `Yield del ${(yld*100).toFixed(2)}% — rentabilidad inmediata muy elevada.`)
    else if (yld >= 0.04)   add('dividendo', 'positive', `Yield del ${(yld*100).toFixed(2)}% — atractivo para renta inmediata.`)
    else if (yld >= 0.025)  add('dividendo', 'neutral',  `Yield del ${(yld*100).toFixed(2)}% — razonable para una empresa DGI de calidad.`)
    else if (yld >= 0.01)   add('dividendo', 'neutral',  `Yield del ${(yld*100).toFixed(2)}% — bajo hoy, depende del crecimiento futuro del dividendo.`)
    else if (yld > 0)       add('dividendo', 'negative', `Yield residual del ${(yld*100).toFixed(2)}% — prácticamente sin renta.`)
    else                    add('dividendo', 'negative', 'No paga dividendo actualmente.')
  }

  if (payout != null && payout > 0) {
    if      (payout > 100)  add('dividendo', 'negative', `Payout del ${payout.toFixed(0)}% — supera los beneficios. Dividendo en riesgo inminente.`)
    else if (payout > 85)   add('dividendo', 'negative', `Payout del ${payout.toFixed(0)}% — muy elevado. Poco margen antes de un recorte.`)
    else if (payout > 70)   add('dividendo', 'neutral',  `Payout del ${payout.toFixed(0)}% — alto, pero sostenible si el negocio es estable.`)
    else if (payout < 35)   add('dividendo', 'positive', `Payout del ${payout.toFixed(0)}% — amplio margen de seguridad para el dividendo.`)
    else if (payout < 55)   add('dividendo', 'positive', `Payout del ${payout.toFixed(0)}% — razonable y con margen de crecimiento.`)
  }

  if (cagr != null) {
    if      (cagr >= 0.12)  add('dividendo', 'positive', `CAGR del dividendo del ${(cagr*100).toFixed(1)}% — crecimiento excepcional a doble dígito.`)
    else if (cagr >= 0.07)  add('dividendo', 'positive', `CAGR del dividendo del ${(cagr*100).toFixed(1)}% — crecimiento sólido y consistente.`)
    else if (cagr >= 0.03)  add('dividendo', 'neutral',  `CAGR del dividendo del ${(cagr*100).toFixed(1)}% — crecimiento moderado.`)
    else if (cagr > 0)      add('dividendo', 'neutral',  `CAGR del dividendo del ${(cagr*100).toFixed(1)}% — crecimiento muy lento.`)
    else                    add('dividendo', 'negative', 'El dividendo no ha crecido en los últimos 5 años.')
  }

  if      (streak >= 50) add('dividendo', 'positive', `${streak} años consecutivos subiendo el dividendo — Rey del dividendo.`)
  else if (streak >= 25) add('dividendo', 'positive', `${streak} años consecutivos subiendo el dividendo — Aristócrata del dividendo.`)
  else if (streak >= 10) add('dividendo', 'positive', `${streak} años seguidos aumentando el dividendo — Aspirante a aristócrata.`)
  else if (streak >= 5)  add('dividendo', 'neutral',  `${streak} años subiendo el dividendo — historial en construcción.`)

  // Tendencia negativa: caída / congelación reciente y recortes en 10 años.
  if (streak === 0) {
    const tr = dividendTrend(data.divHistory)
    if (tr) {
      if (tr.down > 0)        add('dividendo', 'negative', `Lleva ${tr.down} ${tr.down === 1 ? 'año' : 'años'} consecutivos recortando el dividendo — tendencia contraria al DGI.`)
      else if (tr.noRaise > 0) add('dividendo', 'negative', `El dividendo lleva ${tr.noRaise} ${tr.noRaise === 1 ? 'año' : 'años'} sin subir (congelado).`)
      if (tr.cuts10 >= 3)      add('dividendo', 'negative', `Ha recortado el dividendo ${tr.cuts10} veces en los últimos 10 años — historial poco fiable para una estrategia de dividendo creciente.`)
    }
  }

  // ── DEUDA Y LIQUIDEZ ──────────────────────────────────────────────────
  if (nd != null && nd < 0)     add('valoracion', 'positive', `Tiene más efectivo que deuda neta — posición financiera de fortaleza.`)

  if (nde != null) {
    if      (nde < 0)    add('valoracion', 'positive', `Caja neta positiva (deuda neta ${nde.toFixed(1)}× EBITDA) — balance muy sólido.`)
    else if (nde < 1)    add('valoracion', 'positive', `Deuda neta muy controlada (${nde.toFixed(1)}× EBITDA).`)
    else if (nde < 2.5)  add('valoracion', 'neutral',  `Deuda moderada (${nde.toFixed(1)}× EBITDA).`)
    else if (nde > 4)    add('valoracion', 'negative', `Deuda elevada (${nde.toFixed(1)}× EBITDA) — riesgo financiero relevante.`)
    else if (nde > 3)    add('valoracion', 'neutral',  `Deuda alta (${nde.toFixed(1)}× EBITDA) — vigilar evolución.`)
  }

  if (intCov != null && intCov > 0) {
    if      (intCov > 20)   add('valoracion', 'positive', `Cobertura de intereses excelente (${intCov.toFixed(1)}×) — la deuda no supone presión.`)
    else if (intCov > 8)    add('valoracion', 'positive', `Buena cobertura de intereses (${intCov.toFixed(1)}×).`)
    else if (intCov < 3)    add('valoracion', 'negative', `Cobertura de intereses baja (${intCov.toFixed(1)}×) — el negocio cubre con dificultad sus intereses.`)
  }

  // ── VALORACIÓN ────────────────────────────────────────────────────────
  if (dcf?.mos != null) {
    const p = (Math.abs(dcf.mos) * 100).toFixed(1)
    if      (dcf.mos > 0.30)  add('valoracion', 'positive', `Descuento del ${p}% respecto al valor intrínseco estimado — zona de compra con margen de seguridad amplio.`)
    else if (dcf.mos > 0.10)  add('valoracion', 'positive', `Cotiza por debajo del valor intrínseco estimado (${p}% de margen de seguridad).`)
    else if (dcf.mos > -0.10) add('valoracion', 'neutral',  `Cotiza cerca de su valor intrínseco estimado.`)
    else if (dcf.mos > -0.25) add('valoracion', 'neutral',  `Cotiza ligeramente por encima del valor intrínseco (${p}% de prima).`)
    else                      add('valoracion', 'negative', `Cotiza un ${p}% por encima del valor intrínseco estimado — precio exigente.`)
  }

  // Precio vs rango 52 semanas
  if (price != null && high52 != null && low52 != null && high52 > low52) {
    const distHigh = ((high52 - price) / high52) * 100
    const distLow  = ((price - low52)  / price)  * 100
    if      (distHigh > 25) add('valoracion', 'positive', `El precio está un ${distHigh.toFixed(1)}% por debajo de su máximo anual — posible zona de entrada.`)
    else if (distHigh < 5)  add('valoracion', 'neutral',  `Cotiza cerca de máximos anuales (${distHigh.toFixed(1)}% por debajo del máximo de 52 semanas).`)
    if      (distLow  < 8)  add('valoracion', 'neutral',  `Cerca de mínimos anuales — vigilar si es debilidad temporal o problema estructural.`)
  }

  // ── MERCADO / CALIDAD ─────────────────────────────────────────────────
  if (roic != null) {
    if      (roic > 40)   add('mercado', 'neutral',  `ROIC del ${roic.toFixed(1)}% — muy elevado, puede reflejar intangibles no capitalizados.`)
    else if (roic > 25)   add('mercado', 'positive', `ROIC del ${roic.toFixed(1)}% — genera valor excepcional por cada euro de capital invertido.`)
    else if (roic > 15)   add('mercado', 'positive', `ROIC del ${roic.toFixed(1)}% — negocio rentable con ventajas competitivas visibles.`)
    else if (roic <  6)   add('mercado', 'neutral',  `ROIC del ${roic.toFixed(1)}% — rentabilidad sobre capital por debajo de la media.`)
  }

  if (grM != null) {
    if      (grM > 65)    add('mercado', 'positive', `Margen bruto del ${grM.toFixed(0)}% — poder de fijación de precios excepcional.`)
    else if (grM > 45)    add('mercado', 'positive', `Margen bruto del ${grM.toFixed(0)}% — producto o servicio diferenciado.`)
    else if (grM < 18)    add('mercado', 'neutral',  `Margen bruto del ${grM.toFixed(0)}% — negocio de bajo margen, la eficiencia es clave.`)
  }

  if (opM != null && opM < 5 && opM >= 0) add('mercado', 'negative', `Margen operativo del ${opM.toFixed(1)}% — muy estrecho, vulnerable a shocks de costes.`)

  if (fcfPos === false) add('mercado', 'negative', 'Flujo de caja libre negativo — el dividendo podría no estar cubierto por generación de caja.')
  if (fcfCagr != null && fcfCagr > 12) add('mercado', 'positive', `FCF creciendo al ${fcfCagr.toFixed(1)}% anual — la capacidad de generar caja se acelera.`)

  // Crecimiento vía adquisiciones
  const acq = detectAcquisitions(data)
  if (acq) {
    const gwStr = acq.goodwillPct != null ? ` El goodwill representa el ${acq.goodwillPct.toFixed(0)}% de los activos totales.` : ''
    add('mercado', 'neutral', `El crecimiento de ingresos puede estar inflado por adquisiciones.${gwStr} Verificar sostenibilidad orgánica.`)
  }

  if (rg != null)  {
    if      (rg < -8)   add('mercado', 'negative', `Ingresos cayendo (${rg.toFixed(1)}% interanual) — presión sobre los dividendos futuros.`)
    else if (rg >  12)  add('mercado', 'positive', `Ingresos creciendo al ${rg.toFixed(1)}% — momentum top-line sólido.`)
  }

  if (eg != null && eg > 15)   add('mercado', 'positive', `Beneficios creciendo al ${eg.toFixed(1)}% — momentum positivo en la cuenta de resultados.`)
  if (eg != null && eg < -15)  add('mercado', 'negative', `Beneficios cayendo el ${Math.abs(eg).toFixed(1)}% — deterioro de la rentabilidad.`)

  if (beta != null) {
    if      (beta < 0.5)  add('mercado', 'positive', `Beta muy baja (${beta.toFixed(2)}) — acción muy defensiva, oscila poco con el mercado.`)
    else if (beta < 0.85) add('mercado', 'positive', `Beta baja (${beta.toFixed(2)}) — comportamiento defensivo, menor volatilidad que el mercado.`)
    else if (beta > 1.5)  add('mercado', 'neutral',  `Beta elevada (${beta.toFixed(2)}) — acción más volátil que el mercado.`)
  }

  // ── DISCIPLINA DE CAPITAL (CDR) ────────────────────────────────────────
  // Se OMITE en banca/seguros/REITs: el FCF y "deuda neta = deuda − caja" no son
  // representativos en esos balances → el CDR sería ruido (p.ej. Munich Re).
  const _sec = (data.sector || '').toLowerCase(), _ind = (data.industry || '').toLowerCase()
  const isFinOrReit = _sec.includes('financ') || _sec.includes('real estate') ||
    _ind.includes('bank') || _ind.includes('insur') || _ind.includes('reit') ||
    _ind.includes('capital market') || _ind.includes('mortgage') || _ind.includes('asset manage')
  const cdr = isFinOrReit ? null : computeCDR(data.cashflow_annual, data.balance_sheet_annual)
  if (cdr) {
    const sysAbove = cdr.yearsAbove100 >= 3 || (cdr.avg4y != null && cdr.avg4y > 110)
    if (sysAbove && cdr.debtRising) {
      // El caso que SÍ merece aviso: la deuda neta crece año a año.
      add('dividendo', 'negative', 'Aunque el payout del dividendo es contenido, la distribución total (dividendos + recompras + adquisiciones) supera al FCF y la deuda neta crece año a año — vigilar la disciplina de capital.')
    } else if (sysAbove) {
      // Distribución > FCF pero SIN aumentar deuda → recompras con caja: no es problema.
      add('dividendo', 'neutral', 'La distribución total supera al FCF por las recompras de acciones, pero se financia con caja y la deuda neta no aumenta — no compromete el dividendo.')
    } else if (cdr.cdrLastYear != null && cdr.cdrLastYear > 100 && cdr.lastYear) {
      add('dividendo', 'neutral', `La distribución total (dividendos + recompras + adquisiciones) superó el FCF generado en ${cdr.lastYear.year} — revisar evolución de la deuda.`)
    }
    if (cdr.avg4y != null && cdr.avg4y < 60) {
      add('dividendo', 'positive', 'Disciplina financiera excepcional — la empresa distribuye menos del 60% de su FCF y retiene caja o reduce deuda.')
    }
  }

  return insights
}

// ── 7. BADGES ─────────────────────────────────────────────────────────────
// Devuelve array de { id, label, color, bg, title } para mostrar en cabecera

export function computeBadges(data, streak, cagr, moat) {
  const badges = []

  // Streak
  if      (streak >= 50) badges.push({ id: 'streak50', label: '👑 Rey',         color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  title: `${streak} años consecutivos subiendo el dividendo` })
  else if (streak >= 25) badges.push({ id: 'streak25', label: '🏆 Aristócrata', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', title: `${streak} años consecutivos subiendo el dividendo` })
  else if (streak >= 10) badges.push({ id: 'streak10', label: '⭐ Aspirante',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  title: `${streak} años consecutivos subiendo el dividendo` })

  // Tendencia negativa del dividendo (caída / congelación / historial de recortes)
  for (const b of dividendTrendBadges(dividendTrend(data?.divHistory))) {
    badges.push({ id: `trend-${b.kind}`, label: `${b.emoji} ${b.label}`, color: b.color, bg: `${b.color}1a`, title: b.title })
  }

  // Regla 10/10: yield + CAGR dividendo ≥ 10%
  if (data && cagr != null) {
    const price = n(data.current_price)
    const dpsV  = n(data.dps)
    const yld   = price > 0 && dpsV != null ? (dpsV / price) * 100 : 0
    const cagrP = cagr * 100
    if (yld > 0 && cagrP > 0 && yld + cagrP >= 10) {
      badges.push({ id: '1010', label: '⚡ Regla 10/10', color: '#818cf8', bg: 'rgba(99,102,241,0.12)', title: `Yield (${yld.toFixed(1)}%) + CAGR dividendo (${cagrP.toFixed(1)}%) ≥ 10% — retorno total estimado excelente` })
    }
  }

  // Foso económico
  if (moat?.width === 'wide')   badges.push({ id: 'moat-wide',   label: '🏰 Foso ancho',    color: '#34d399', bg: 'rgba(52,211,153,0.12)', title: `Moat score: ${moat.score}/100` })
  else if (moat?.width === 'narrow') badges.push({ id: 'moat-narrow', label: '🧱 Foso estrecho', color: '#86efac', bg: 'rgba(134,239,172,0.12)', title: `Moat score: ${moat.score}/100` })

  return badges
}

// ── 8. BUYBACKS ───────────────────────────────────────────────────────────

export function computeBuybacks(data) {
  if (!data) return null

  const cf   = data.cashflow_annual
  const rows = cf?.data?.['Recompra de Acciones']
  const cols = cf?.columns
  if (!rows?.length || !cols?.length) return null

  const marketCap = data.market_cap_m != null ? data.market_cap_m * 1e6 : null

  const years = cols.map((col, i) => {
    const amount = rows[i]
    if (amount == null) return null
    const isBuyback = amount < 0
    const yld = (marketCap && isBuyback) ? (Math.abs(amount) / marketCap) * 100 : null
    return { year: col.substring(0, 4), amount, isBuyback, yield: yld }
  }).filter(Boolean)

  if (!years.length) return null

  let streak = 0
  for (const y of years) {
    if (y.isBuyback) streak++
    else break
  }

  const buybackYears = years.slice(0, streak)
  const avgYield = (buybackYears.length && buybackYears.every(y => y.yield != null))
    ? buybackYears.reduce((s, y) => s + y.yield, 0) / buybackYears.length
    : null

  const isCannibal      = streak >= 3 && avgYield != null && avgYield > 5
  const isActiveBuyback = streak >= 3 && !isCannibal
  const isDilutive      = !years[0]?.isBuyback && years[0]?.amount > 0

  return { years: years.slice(0, 4), streak, avgYield, isCannibal, isActiveBuyback, isDilutive }
}
