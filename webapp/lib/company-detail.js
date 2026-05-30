import { createClient } from '@supabase/supabase-js'

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

// ── Main fetcher — lee de company_fundamentals (poblado por Python) ────────

export async function getCompanyDetail(ticker) {
  try {
    const { data } = await sb()
      .from('company_fundamentals')
      .select('*')
      .eq('ticker', ticker)
      .single()
    if (!data) return null
    return {
      ...data,
      divHistory: enrichDivHistory(data.div_history ?? []),
    }
  } catch {
    return null
  }
}

// ── Compute functions — usan el formato plano de company_fundamentals ──────
// Todos los campos de margen/retorno están en % (ej: roe=15.2 = 15.2%)
// Ratios en crudo (ej: debt_ebitda=2.1, current_ratio=1.5)
// payout_fcf / payout_eps en % (ej: 65 = 65%)

export function computeHealthScore(data, type) {
  if (!data) return null

  const debtEbitda = data.debt_ebitda     ?? null
  const roe        = data.roe              ?? null
  const roa        = data.roa              ?? null
  const opMargin   = data.operating_margin ?? null
  const grMargin   = data.gross_margin     ?? null
  const curRatio   = data.current_ratio    ?? null
  const fcfPos     = data.fcf_per_share != null ? data.fcf_per_share > 0 : null
  const payout     = data.payout_fcf != null ? data.payout_fcf / 100
                   : data.payout_eps != null ? data.payout_eps / 100 : null

  const items = []
  const push  = (s, w) => items.push({ s, w })

  if (type === 'banco' || type === 'aseguradora') {
    if (roe      != null) push(roe  > 15 ? 90 : roe  > 10 ? 70 : roe  > 5  ? 50 : 20, 3)
    if (roa      != null) push(roa  > 2  ? 90 : roa  > 1  ? 70 : roa  > 0.5 ? 50 : 20, 3)
    if (payout   != null) push(payout < 0.4 ? 90 : payout < 0.65 ? 70 : payout < 0.85 ? 50 : 20, 2)
    if (opMargin != null) push(opMargin > 30 ? 85 : opMargin > 18 ? 70 : opMargin > 8 ? 55 : 25, 2)
  } else if (type === 'reit' || type === 'bdc') {
    if (debtEbitda != null) push(debtEbitda < 5 ? 85 : debtEbitda < 7 ? 65 : debtEbitda < 9 ? 45 : 20, 2)
    if (roe        != null) push(roe > 8 ? 85 : roe > 5 ? 70 : roe > 2 ? 50 : 20, 2)
    if (payout     != null) push(payout < 0.85 ? 85 : payout < 1.0 ? 65 : payout < 1.2 ? 45 : 15, 2)
    if (grMargin   != null) push(grMargin > 60 ? 85 : grMargin > 40 ? 70 : grMargin > 20 ? 50 : 25, 1)
  } else {
    const isUtility = type === 'utilities'
    const debtCap   = isUtility ? 7 : 5
    if (debtEbitda != null) push(debtEbitda < 1.5 ? 95 : debtEbitda < 2.5 ? 80 : debtEbitda < 3.5 ? 60 : debtEbitda < debtCap ? 40 : 15, 2)
    if (opMargin   != null) push(opMargin > 25 ? 90 : opMargin > 15 ? 75 : opMargin > 5 ? 55 : 20, 2)
    if (roe        != null) push(roe > 20 ? 90 : roe > 15 ? 75 : roe > 8 ? 55 : 25, 2)
    if (!isUtility && fcfPos != null) push(fcfPos ? 85 : 15, 2)
    if (payout     != null) push(payout < 0.5 ? 90 : payout < 0.7 ? 70 : payout < 0.9 ? 45 : 10, 2)
    if (curRatio   != null) push(curRatio > 2 ? 90 : curRatio > 1.5 ? 75 : curRatio > 1 ? 55 : curRatio > 0.5 ? 35 : 15, 1)
    if (grMargin   != null) push(grMargin > 50 ? 90 : grMargin > 30 ? 75 : grMargin > 15 ? 55 : 25, 1)
  }

  if (!items.length) return null
  const total = items.reduce((s, i) => s + i.s * i.w, 0)
  const wt    = items.reduce((s, i) => s + i.w, 0)
  return Math.round(total / wt)
}

export function computeMoat(data, streak) {
  if (!data) return { width: 'none', label: 'Sin datos', signals: [], negative: [] }

  const roe      = data.roe              ?? null
  const grMargin = data.gross_margin     ?? null
  const opMargin = data.operating_margin ?? null
  const rg       = data.revenue_growth_yoy != null ? data.revenue_growth_yoy / 100 : null

  const signals  = []
  const negative = []

  if (roe      != null && roe  > 20)     signals.push(`ROE del ${roe.toFixed(1)}% — retornos excepcionales sobre el capital`)
  if (roe      != null && roe  < 0)      negative.push(`ROE negativo (${roe.toFixed(1)}%) — destrucción de valor`)
  if (grMargin != null && grMargin > 50) signals.push(`Margen bruto del ${grMargin.toFixed(1)}% — fuerte poder de fijación de precios`)
  if (grMargin != null && grMargin < 20) negative.push(`Margen bruto bajo (${grMargin.toFixed(1)}%) — poca diferenciación`)
  if (opMargin != null && opMargin > 20) signals.push(`Margen operativo sólido (${opMargin.toFixed(1)}%)`)
  if (opMargin != null && opMargin < 3)  negative.push(`Margen operativo muy bajo (${opMargin.toFixed(1)}%)`)
  if (streak >= 10)  signals.push(`${streak} años consecutivos aumentando el dividendo`)
  else if (streak >= 5) signals.push(`${streak} años consecutivos de dividendo creciente`)
  if (rg != null && rg < -0.08) negative.push(`Ingresos en contracción (${(rg * 100).toFixed(1)}% interanual)`)

  if (roe != null && grMargin != null && roe > 20 && grMargin > 50 && streak >= 10) {
    return { width: 'wide',   label: 'Foso ancho',         signals, negative }
  }
  if (signals.length >= 2) {
    return { width: 'narrow', label: 'Foso estrecho',      signals, negative }
  }
  return   { width: 'none',   label: 'Sin foso detectado', signals, negative }
}

export function computeDCF(data, moatWidth) {
  if (!data) return null

  const eps   = data.eps_trailing ?? null
  const price = data.current_price ?? null
  if (!eps || eps <= 0 || !price) return null

  const discount  = moatWidth === 'wide' ? 0.08 : moatWidth === 'narrow' ? 0.10 : 0.12
  const eg        = data.earnings_growth_yoy ?? data.revenue_growth_yoy ?? null
  const rawGrowth = eg != null ? eg / 100 : 0.05
  const growth    = Math.min(0.25, Math.max(0, rawGrowth))

  let value = 0, e = eps
  for (let y = 1; y <= 10; y++) {
    const g = y <= 5 ? growth : growth * 0.6
    e *= (1 + g)
    value += e / Math.pow(1 + discount, y)
  }
  value += (e * 15) / Math.pow(1 + discount, 10)

  const intrinsicValue = Math.round(value * 100) / 100
  const mos = (intrinsicValue - price) / intrinsicValue
  return { intrinsicValue, price, mos, discount, growth }
}

export function computeProjection(history, cagr) {
  const full = history.filter(h => !h.isPartial)
  if (!full.length) return []
  const baseDps     = full[full.length - 1].dps
  const g           = cagr ?? 0.05
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 10 }, (_, i) => ({
    year:         currentYear + i + 1,
    conservative: parseFloat((baseDps * Math.pow(1 + g * 0.6, i + 1)).toFixed(4)),
    base:         parseFloat((baseDps * Math.pow(1 + g,       i + 1)).toFixed(4)),
    optimistic:   parseFloat((baseDps * Math.pow(1 + g * 1.4, i + 1)).toFixed(4)),
  }))
}

export function computeDGIScore(data, streak, cagr) {
  if (!data) return null

  const yld    = data.current_price > 0 ? (data.dps ?? 0) / data.current_price : null
  const payout = data.payout_fcf != null ? data.payout_fcf / 100
               : data.payout_eps != null ? data.payout_eps / 100 : null
  const roe    = data.roe              ?? null
  const opM    = data.operating_margin ?? null
  const pe     = data.pe_trailing      ?? data.pe_forward ?? null
  const fcfPos = data.fcf_per_share != null ? data.fcf_per_share > 0 : null
  const pb     = data.price_to_book   ?? null
  const rg     = data.revenue_growth_yoy  != null ? data.revenue_growth_yoy  / 100 : null
  const eg     = data.earnings_growth_yoy != null ? data.earnings_growth_yoy / 100 : null
  const eps    = data.eps_trailing ?? null

  let div = 0
  if (yld    != null) div += yld >= 0.04 ? 3 : yld >= 0.025 ? 2 : yld >= 0.015 ? 1 : 0
  if (payout != null) div += payout < 0.5 ? 3 : payout < 0.75 ? 1.5 : 0
  if (cagr   != null) div += cagr >= 0.10 ? 2 : cagr >= 0.05 ? 1 : 0
  div += streak >= 10 ? 2 : streak >= 5 ? 1 : 0
  div  = Math.min(10, div)

  let cal = 0
  if (roe    != null) cal += roe > 20 ? 3 : roe > 12 ? 2 : roe > 5 ? 1 : 0
  if (opM    != null) cal += opM > 20 ? 3 : opM > 10 ? 2 : opM > 0 ? 1 : 0
  if (fcfPos != null) cal += fcfPos ? 2 : 0
  if (eps    != null) cal += eps > 0 ? 2 : 0
  cal = Math.min(10, cal)

  let val = 0
  if (pe  != null && pe > 0) val += pe < 15 ? 4 : pe < 20 ? 3 : pe < 25 ? 2 : pe < 35 ? 1 : 0
  if (yld != null)            val += yld >= 0.04 ? 3 : yld >= 0.025 ? 2 : yld >= 0.015 ? 1 : 0
  if (pb  != null && pb > 0) val += pb < 2 ? 3 : pb < 4 ? 2 : pb < 8 ? 1 : 0
  val = Math.min(10, val)

  let mom = 0
  if (rg != null) mom += rg > 0.1 ? 3 : rg > 0.05 ? 2 : rg > 0 ? 1 : 0
  if (eg != null) mom += eg > 0.1 ? 3 : eg > 0.05 ? 2 : eg > 0 ? 1 : 0
  mom += streak >= 10 ? 4 : streak >= 5 ? 2 : streak > 0 ? 1 : 0
  mom = Math.min(10, mom)

  const total = parseFloat((div * 0.35 + cal * 0.30 + val * 0.20 + mom * 0.15).toFixed(1))
  return {
    total,
    breakdown: [
      { key: 'dividendo',  label: 'Dividendo',  score: div, max: 10, weight: '35%' },
      { key: 'calidad',    label: 'Calidad',     score: cal, max: 10, weight: '30%' },
      { key: 'valoracion', label: 'Valoración',  score: val, max: 10, weight: '20%' },
      { key: 'momentum',   label: 'Momentum',    score: mom, max: 10, weight: '15%' },
    ],
  }
}

export function buildInsights(data, streak, cagr, dcf) {
  if (!data) return []

  const yld    = data.current_price > 0 ? (data.dps ?? 0) / data.current_price : null
  const payout = data.payout_fcf != null ? data.payout_fcf / 100
               : data.payout_eps != null ? data.payout_eps / 100 : null
  const roe    = data.roe              ?? null
  const opM    = data.operating_margin ?? null
  const rg     = data.revenue_growth_yoy  != null ? data.revenue_growth_yoy  / 100 : null
  const eg     = data.earnings_growth_yoy != null ? data.earnings_growth_yoy / 100 : null
  const fcfPos = data.fcf_per_share != null ? data.fcf_per_share > 0 : null

  const insights = []
  const add = (cat, type, text) => insights.push({ cat, type, text })

  if (yld != null) {
    if (yld >= 0.05)        add('dividendo', 'positive', `Yield del ${(yld*100).toFixed(2)}% — atractivo para renta inmediata.`)
    else if (yld >= 0.025)  add('dividendo', 'neutral',  `Yield del ${(yld*100).toFixed(2)}% — razonable para una empresa DGI de calidad.`)
    else if (yld > 0)       add('dividendo', 'neutral',  `Yield del ${(yld*100).toFixed(2)}% — bajo hoy, depende del crecimiento futuro.`)
    else                    add('dividendo', 'negative', 'No paga dividendo actualmente.')
  }
  if (payout != null) {
    if (payout > 1.0)       add('dividendo', 'negative', `Payout del ${(payout*100).toFixed(0)}% — supera los beneficios. Dividendo en riesgo.`)
    else if (payout > 0.8)  add('dividendo', 'neutral',  `Payout del ${(payout*100).toFixed(0)}% — elevado, poco margen para seguir subiendo.`)
    else if (payout < 0.45) add('dividendo', 'positive', `Payout del ${(payout*100).toFixed(0)}% — amplio margen de seguridad para el dividendo.`)
  }
  if (cagr != null) {
    if (cagr >= 0.10)       add('dividendo', 'positive', `CAGR del dividendo del ${(cagr*100).toFixed(1)}% — crecimiento excepcional.`)
    else if (cagr >= 0.05)  add('dividendo', 'positive', `CAGR del dividendo del ${(cagr*100).toFixed(1)}% — crecimiento sólido.`)
    else if (cagr > 0)      add('dividendo', 'neutral',  `CAGR del dividendo del ${(cagr*100).toFixed(1)}% — crecimiento moderado.`)
    else                    add('dividendo', 'negative', 'El dividendo no ha crecido en los últimos años.')
  }
  if (streak >= 10) add('dividendo', 'positive', `${streak} años consecutivos de dividendo creciente — rasgo de empresa Aristócrata.`)
  if (dcf?.mos != null) {
    const p = (Math.abs(dcf.mos) * 100).toFixed(1)
    if (dcf.mos > 0.25)      add('valoracion', 'positive', `Descuento del ${p}% respecto al valor intrínseco estimado — zona de compra potencial.`)
    else if (dcf.mos > 0.05) add('valoracion', 'positive', `Cotiza ligeramente por debajo del valor intrínseco (${p}% de margen).`)
    else if (dcf.mos > -0.1) add('valoracion', 'neutral',  `Cotiza cerca de su valor intrínseco estimado.`)
    else                     add('valoracion', 'negative', `Cotiza un ${p}% por encima del valor intrínseco estimado. Precio exigente.`)
  }
  if (roe != null) {
    if (roe > 20)  add('mercado', 'positive', `ROE del ${roe.toFixed(1)}% — genera mucho valor por cada euro de capital propio.`)
    else if (roe < 0) add('mercado', 'negative', `ROE negativo (${roe.toFixed(1)}%) — está destruyendo valor.`)
  }
  if (opM != null && opM < 5)    add('mercado', 'negative', `Margen operativo del ${opM.toFixed(1)}% — muy estrecho.`)
  if (rg  != null && rg < -0.08) add('mercado', 'negative', `Ingresos cayendo (${(rg*100).toFixed(1)}% interanual) — presión sobre el dividendo futuro.`)
  if (eg  != null && eg > 0.10)  add('mercado', 'positive', `Beneficios creciendo al ${(eg*100).toFixed(1)}% — momentum positivo.`)
  if (fcfPos === false)          add('mercado', 'negative', 'Flujo de caja libre negativo — el dividendo podría no estar cubierto por caja.')

  return insights
}
