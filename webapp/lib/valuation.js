// DGI Valuation System — sector-aware intrinsic value calculation
// Correcciones: jerarquía de crecimiento del negocio (nunca div_cagr5 en DCF),
// penalizaciones por declive, límites de crecimiento, FCF negativo normalizado.

function n(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function fmtBig(v) {
  if (v == null) return '—'
  const a = Math.abs(v)
  // En España siempre en millones (M): 3.5e9 → "3.500 M", 8e8 → "800 M".
  if (a >= 1e6) return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' M'
  return v.toFixed(2)
}
function fmtPct(v, d = 1) { return v != null ? (v * 100).toFixed(d) + '%' : '—' }
function fmtRaw(v, d = 1) { return v != null ? v.toFixed(d) + '%' : '—' }

// ── Statement helpers ─────────────────────────────────────────────────────

function fromStmt(data, key, names, idx = 0) {
  const d = data[key]?.data
  if (!d) return null
  for (const nm of names) {
    if (d[nm]?.[idx] != null) return d[nm][idx]
  }
  return null
}

function fromStmtSlice(data, key, names, count = 4) {
  const d = data[key]?.data
  if (!d) return []
  for (const nm of names) {
    if (d[nm]) return d[nm].slice(0, count).filter(v => v != null)
  }
  return []
}

function getShares(data) {
  const p = n(data.current_price), m = n(data.market_cap_m)
  return p && m && p > 0 ? (m * 1e6) / p : null
}

const FCF_NAMES = ['Flujo de Caja Libre', 'Free Cash Flow']
const OCF_NAMES = ['Cash Flow Operativo', 'Operating Cash Flow', 'Cash Flow From Continuing Operating Activities', 'Total Cash From Operating Activities']
const REV_NAMES = ['Ingresos Totales', 'Total Revenue', 'Total Revenues']

// Detecta 3+ años consecutivos de caída de ingresos (idx 0 = más reciente)
function revenueDeclining3y(data) {
  const rev = fromStmtSlice(data, 'income_statement_annual', REV_NAMES, 5)
  if (rev.length < 4) return false
  let declines = 0
  for (let i = 0; i < 3; i++) {
    if (rev[i] != null && rev[i + 1] != null && rev[i] < rev[i + 1]) declines++
    else break
  }
  return declines >= 3
}

// FCF base con fallback a media 4 años si el año reciente es negativo (Corrección 4)
function fcfBaseWithFallback(data) {
  const vals = fromStmtSlice(data, 'cashflow_annual', FCF_NAMES, 4)
  if (!vals.length) return { value: null, normalized: false, sustainedNegative: false }
  const recent = vals[0]
  if (recent != null && recent > 0) return { value: recent, normalized: false, sustainedNegative: false }
  // reciente negativo → probar media
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  if (avg > 0) return { value: avg, normalized: true, sustainedNegative: false }
  return { value: null, normalized: false, sustainedNegative: true }
}

// ── Business growth hierarchy (Corrección 1) ───────────────────────────────
// Nunca usa div_cagr5. Devuelve gPct en %, fuente, y rev/fcf crudos.

function businessGrowth(data, revenueOnly = false) {
  const rev = n(data.revenue_cagr5)
  const fcf = n(data.fcf_cagr5)
  let gPct, source
  if (revenueOnly) {
    gPct = rev != null ? rev : 0
    source = rev != null ? 'revenue_cagr5' : 'cero_por_declive'
  } else if (rev != null && fcf != null) {
    gPct = (rev + fcf) / 2; source = 'media_fcf_revenue'
  } else if (fcf != null) {
    gPct = fcf; source = 'fcf_cagr5'
  } else if (rev != null) {
    gPct = rev; source = 'revenue_cagr5'
  } else {
    gPct = 0; source = 'cero_por_declive'
  }
  return { gPct, source, rev, fcf }
}

// Aplica límites, penalizaciones y avisos comunes a todos los DCF (Corr. 1,2,3)
function growthAndPenalties(data, { discountBase, terminalBase, capHigh, revenueOnly = false }) {
  const bg = businessGrowth(data, revenueOnly)

  // Corrección 3 — límites: superior capHigh, inferior −15%
  const g1 = clamp(bg.gPct / 100, -0.15, capHigh)
  let g2
  if (g1 >= 0)        g2 = g1 / 2
  else if (g1 < -0.10) g2 = -0.05
  else                g2 = g1 / 2

  let r  = discountBase
  let gT = terminalBase
  const notes = [], warnings = []

  // Corrección 2 — penalización por declive sobre la tasa de descuento
  let declinePenalty = 0
  if (bg.rev != null && bg.rev < 0 && bg.fcf != null && bg.fcf < 0) declinePenalty = 0.03
  else if (bg.rev != null && bg.rev < 0)                            declinePenalty = 0.02
  if (declinePenalty > 0) r += declinePenalty

  // Corrección 2 — crecimiento terminal cero por declive sostenido
  let terminalZero = false
  if (revenueDeclining3y(data)) {
    gT = 0; terminalZero = true
    notes.push('Crecimiento terminal cero aplicado por declive sostenido de ingresos')
  }

  // Corrección 1 paso 4 — coherencia dividendo vs negocio
  const divc = n(data.div_cagr5)
  if (divc != null && bg.rev != null && (divc - bg.rev) > 5) {
    warnings.push('El dividendo crece más rápido que el negocio — el crecimiento del dividendo refleja expansión del payout, no crecimiento real de la empresa. La valoración usa métricas del negocio, no del dividendo.')
    if (bg.rev < 0) warnings.push('Empresa con ingresos en declive — valoración conservadora aplicada')
  }

  return { g1, g2, r, gT, source: bg.source, rev: bg.rev, fcf: bg.fcf, declinePenalty, terminalZero, notes, warnings }
}

// ── DCF core / projection ──────────────────────────────────────────────────

function dcfProjection({ base, g1, g2, gT, r, stage2 = 5 }) {
  const years = []
  let cf = base, totalPV = 0
  for (let i = 1; i <= 5; i++) { cf *= (1 + g1); const pv = cf / Math.pow(1 + r, i);     totalPV += pv; years.push({ year: i, cf, pv }) }
  for (let i = 1; i <= stage2; i++) { cf *= (1 + g2); const pv = cf / Math.pow(1 + r, 5 + i); totalPV += pv; years.push({ year: 5 + i, cf, pv }) }
  const N = 5 + stage2   // horizonte explícito antes del valor terminal
  let terminalPV = 0
  if (r > gT) terminalPV = cf * (1 + gT) / (r - gT) / Math.pow(1 + r, N)
  totalPV += terminalPV
  return { years, totalPV, terminalPV }
}

function mosFn(iv, price) { return iv != null && price && price > 0 ? (iv - price) / price : null }

// ── Recompute (modo personalizado, cliente) ────────────────────────────────

export function recomputeValuation(engine, params, price) {
  if (engine === 'ddm') {
    let value = 0, div = params.dps
    for (let i = 1; i <= 5; i++) { div *= (1 + params.g); value += div / Math.pow(1 + params.ke, i) }
    if (params.ke > params.gT) value += div * (1 + params.gT) / (params.ke - params.gT) / Math.pow(1 + params.ke, 5)
    return { intrinsicValue: value, mos: mosFn(value, price), projection: null }
  }
  if (engine === 'affo') {
    const iv = params.shares > 0 ? (params.ocf / params.shares) * params.mult : null
    return { intrinsicValue: iv, mos: mosFn(iv, price), projection: null }
  }
  // dcf
  const proj = dcfProjection(params)
  const iv = params.shares > 0 ? proj.totalPV / params.shares : null
  return { intrinsicValue: iv, mos: mosFn(iv, price), projection: proj.years }
}

// ── Editable field descriptors ─────────────────────────────────────────────

function editableFor(engine, currency) {
  if (engine === 'ddm') return [
    { key: 'dps', label: 'DPS base',               type: 'number', unit: currency },
    { key: 'g',   label: 'Crecimiento dividendo',  type: 'slider', unit: '%', min: 0,  max: 15, step: 0.5, pct: true },
    { key: 'ke',  label: 'Coste de equity',        type: 'slider', unit: '%', min: 6,  max: 15, step: 0.5, pct: true },
    { key: 'gT',  label: 'Crecimiento terminal',   type: 'slider', unit: '%', min: 0,  max: 4,  step: 0.5, pct: true },
  ]
  if (engine === 'affo') return [
    { key: 'ocf',    label: 'OCF base',          type: 'number', unit: 'M', scale: 1e6 },
    { key: 'mult',   label: 'Múltiplo objetivo', type: 'slider', unit: '×', min: 8, max: 30, step: 0.5 },
    { key: 'shares', label: 'Acciones',          type: 'number', unit: 'M', scale: 1e6 },
  ]
  return [
    { key: 'base',   label: 'FCF/CFO base',         type: 'number', unit: 'M', scale: 1e6 },
    { key: 'g1',     label: 'Crecimiento fase 1',   type: 'slider', unit: '%', min: -15, max: 20, step: 0.5, pct: true },
    { key: 'g2',     label: 'Crecimiento fase 2',   type: 'slider', unit: '%', min: -10, max: 15, step: 0.5, pct: true },
    { key: 'gT',     label: 'Crecimiento terminal', type: 'slider', unit: '%', min: -2,  max: 5,  step: 0.5, pct: true },
    { key: 'r',      label: 'Tasa de descuento',    type: 'slider', unit: '%', min: 6,   max: 20, step: 0.5, pct: true },
    { key: 'shares', label: 'Acciones',             type: 'number', unit: 'M', scale: 1e6 },
  ]
}

// ── Sector detection ──────────────────────────────────────────────────────

function detectSector(type, sector, industry) {
  const t = (type || '').toLowerCase()
  const s = (sector || '').toLowerCase()
  const i = (industry || '').toLowerCase()
  if (t === 'banco'       || i.includes('bank')    || i.includes('savings'))   return 'bank'
  if (t === 'aseguradora' || i.includes('insur'))                               return 'insurer'
  if (t === 'reit' || t === 'bdc' || i.includes('reit') || i.includes('real estate investment')) return 'reit'
  if (t === 'utilities'   || s === 'utilities')                                  return 'utilities'
  if (s === 'energy'      || s === 'basic materials')                            return 'energy'
  if (i.includes('drug')  || i.includes('biotech')  || i.includes('pharma') ||
      (s === 'healthcare' && !i.includes('plan')))                               return 'pharma'
  return 'general'
}

function detectReit(industry) {
  const i = (industry || '').toLowerCase()
  if (i.includes('office'))                                        return { label: 'Oficinas',         m: 14 }
  if (i.includes('retail') || i.includes('commercial') || i.includes('shopping')) return { label: 'Comercial',  m: 13 }
  if (i.includes('residential') || i.includes('apartment'))       return { label: 'Residencial',      m: 18 }
  if (i.includes('industrial')  || i.includes('logistic') || i.includes('warehouse')) return { label: 'Industrial/Logístico', m: 20 }
  if (i.includes('healthcare')  || i.includes('medical'))         return { label: 'Sanitario',        m: 16 }
  return { label: 'Diversificado', m: 15 }
}

// ── Unavailable ───────────────────────────────────────────────────────────

function na(method, label, price, reason, tooltip) {
  return { method, methodLabel: label, available: false, unavailableReason: reason,
    intrinsicValue: null, price, mos: null, discount: 0, growth: 0, terminal: 0,
    inputs: [], notes: [], warnings: [], fcfYears: null, tooltip,
    engine: null, params: null, editable: [], projection: null, growthInputUsed: null,
    revCagr: null, fcfCagr: null, declinePenalty: 0, terminalZero: false }
}

// growth_input_used legible
const SOURCE_LABEL = {
  media_fcf_revenue: 'Media FCF + Ingresos',
  fcf_cagr5: 'CAGR FCF 5a',
  revenue_cagr5: 'CAGR Ingresos 5a',
  cero_por_declive: 'Cero (sin datos / declive)',
}

// ── Generic DCF builder (Métodos 1, 4, 5, 6) ──────────────────────────────

function buildDCF(data, opts) {
  const { method, label, tooltip, currency,
          baseSource,        // 'fcf' | 'cfo' | 'fcf_normalized'
          discountBase, terminalBase, capHigh, revenueOnly = false,
          extraNotes = [], baseLabel } = opts
  const price = n(data.current_price)

  // Base
  let base, fcfYears = null
  const notes = [...extraNotes]

  if (baseSource === 'fcf') {
    const fb = fcfBaseWithFallback(data)
    if (fb.sustainedNegative) return na(method, label, price, 'DCF no disponible — FCF negativo de forma sostenida', tooltip)
    if (fb.value == null)     return na(method, label, price, 'DCF no disponible — FCF no disponible', tooltip)
    base = fb.value
    if (fb.normalized) notes.push('FCF normalizado — el año más reciente es negativo pero la media histórica es positiva')
  } else if (baseSource === 'cfo') {
    const cfo = fromStmt(data, 'cashflow_annual', OCF_NAMES)
    if (!cfo || cfo <= 0) return na(method, label, price, 'DCF no disponible — CFO negativo o no disponible', tooltip)
    base = cfo
  } else if (baseSource === 'fcf_normalized') {
    const vals = fromStmtSlice(data, 'cashflow_annual', FCF_NAMES, 4)
    if (vals.length < 2) return na(method, label, price, 'DCF no disponible — menos de 2 años de FCF disponibles', tooltip)
    base = vals.reduce((a, b) => a + b, 0) / vals.length
    if (base <= 0) return na(method, label, price, 'DCF no disponible — FCF normalizado negativo de forma sostenida', tooltip)
    const cols = data.cashflow_annual?.columns || []
    fcfYears = vals.map((v, i) => ({ year: cols[i] ? cols[i].substring(0, 4) : `Año -${i}`, value: v }))
  }

  const shares = getShares(data)
  if (!shares) return na(method, label, price, 'Datos insuficientes — capitalización no disponible', tooltip)

  // Crecimiento + penalizaciones
  const gp = growthAndPenalties(data, { discountBase, terminalBase, capHigh, revenueOnly })

  const stage2 = opts.stage2 || 5
  const params = { base, g1: gp.g1, g2: gp.g2, gT: gp.gT, r: gp.r, shares, stage2 }
  const proj = dcfProjection(params)
  const iv = proj.totalPV / shares

  const inputs = [
    { label: baseLabel || 'FCF base', value: fmtBig(base) },
    { label: 'Crecimiento fase 1 (años 1–5)', value: fmtPct(gp.g1) },
    { label: `Crecimiento fase 2 (años 6–${5 + stage2})`, value: fmtPct(gp.g2) },
    { label: 'Crecimiento terminal', value: fmtPct(gp.gT) },
    { label: 'Tasa de descuento', value: fmtPct(gp.r) },
    { label: 'Métrica de crecimiento usada', value: SOURCE_LABEL[gp.source] || gp.source },
    { label: 'CAGR ingresos 5a', value: gp.rev != null ? fmtRaw(gp.rev) : '—', danger: gp.rev != null && gp.rev < 0 },
    { label: 'CAGR FCF 5a', value: gp.fcf != null ? fmtRaw(gp.fcf) : '—', danger: gp.fcf != null && gp.fcf < 0 },
    { label: 'Acciones (aprox.)', value: fmtBig(shares) },
  ]
  if (gp.declinePenalty > 0) {
    inputs.push({ label: 'Penalización por ingresos en declive', value: `+${(gp.declinePenalty * 100).toFixed(0)}% al descuento`, danger: true })
  }

  return {
    method, methodLabel: label, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mosFn(iv, price),
    discount: gp.r, growth: gp.g1, terminal: gp.gT,
    inputs, notes: [...notes, ...gp.notes], warnings: gp.warnings,
    fcfYears, tooltip,
    engine: 'dcf', params, editable: editableFor('dcf', currency),
    projection: proj.years,
    growthInputUsed: gp.terminalZero ? 'cero_por_declive' : gp.source,
    revCagr: gp.rev, fcfCagr: gp.fcf, declinePenalty: gp.declinePenalty, terminalZero: gp.terminalZero,
  }
}

// ── Method 1: DCF FCF — General ───────────────────────────────────────────

function dcfFCF(data, moatWidth, currency) {
  return buildDCF(data, {
    method: 'dcf_fcf', label: 'DCF · FCF', currency,
    tooltip: 'Valor calculado mediante descuento de flujos de caja libre proyectados a 10 años. La tasa de descuento se ajusta según el foso económico detectado. Un margen de seguridad positivo indica que la empresa cotiza por debajo de su valor estimado.',
    baseSource: 'fcf', baseLabel: 'FCF base',
    discountBase: moatWidth === 'wide' ? 0.08 : moatWidth === 'narrow' ? 0.10 : 0.12,
    terminalBase: currency === 'EUR' ? 0.025 : 0.030,
    capHigh: 0.20,
  })
}

// ── Method 4: DCF CFO — Utilities ─────────────────────────────────────────

function dcfCFO(data, moatWidth, currency) {
  const res = buildDCF(data, {
    method: 'dcf_cfo', label: 'DCF · CFO', currency,
    stage2: 10,   // horizonte largo: activos regulados de muy larga vida (20-30 años)
    tooltip: 'En utilities los flujos regulados son muy predecibles, lo que justifica una tasa de descuento más baja. El CFO se usa como base porque el FCF suele ser negativo por las inversiones en la red regulada.',
    baseSource: 'cfo', baseLabel: 'CFO base',
    discountBase: moatWidth === 'wide' ? 0.06 : moatWidth === 'narrow' ? 0.075 : 0.09,
    terminalBase: 0.02,
    capHigh: 0.08, revenueOnly: true,
    extraNotes: ['Se usa el flujo de caja operativo en lugar del libre porque el capex de utilities es inversión en activos regulados, no gasto de mantenimiento.'],
  })
  return res
}

// ── Method 5: DCF prima riesgo — Farmacéuticas ───────────────────────────

function dcfPharma(data, moatWidth, currency) {
  const price = n(data.current_price)

  // Base FCF con fallback
  const fb = fcfBaseWithFallback(data)
  if (fb.sustainedNegative) return na('dcf_pharma', 'DCF · Prima riesgo', price, 'DCF no disponible — FCF negativo de forma sostenida', '')
  if (fb.value == null)     return na('dcf_pharma', 'DCF · Prima riesgo', price, 'DCF no disponible — FCF no disponible', '')
  let base = fb.value
  const preNotes = []
  if (fb.normalized) preNotes.push('FCF normalizado — el año más reciente es negativo pero la media histórica es positiva')

  // Ajuste por goodwill >50%
  const bsd = data.balance_sheet_annual?.data
  if (bsd) {
    const gw = (bsd['Fondo de Comercio'] || bsd['Goodwill'])?.[0]
    const at = (bsd['Activos Totales']   || bsd['Total Assets'])?.[0]
    if (gw && at && at > 0 && gw / at > 0.50) { base *= 0.90; preNotes.push('FCF ajustado por goodwill elevado (>50% de activos)') }
  }

  // Prima de riesgo de descuento + reducción por I+D
  let discountBase = moatWidth === 'wide' ? 0.10 : moatWidth === 'narrow' ? 0.12 : 0.14
  const isd = data.income_statement_annual?.data
  let rdAdj = false
  if (isd) {
    const rd  = Math.abs((isd['I+D'] || isd['Research And Development'])?.[0] || 0)
    const rev = (isd['Ingresos Totales'] || isd['Total Revenue'])?.[0]
    if (rd && rev && rev > 0 && rd / rev > 0.20) { discountBase -= 0.01; rdAdj = true; preNotes.push('Prima de riesgo reducida por alta inversión en I+D (>20% ingresos)') }
  }

  const shares = getShares(data)
  if (!shares) return na('dcf_pharma', 'DCF · Prima riesgo', price, 'Datos insuficientes — capitalización no disponible', '')

  const gp = growthAndPenalties(data, { discountBase, terminalBase: currency === 'EUR' ? 0.025 : 0.030, capHigh: 0.15 })
  const params = { base, g1: gp.g1, g2: gp.g2, gT: gp.gT, r: gp.r, shares }
  const proj = dcfProjection(params)
  const iv = proj.totalPV / shares

  const inputs = [
    { label: 'FCF base' + (preNotes.length ? ' (ajustado)' : ''), value: fmtBig(base) },
    { label: 'Crecimiento fase 1', value: fmtPct(gp.g1) },
    { label: 'Crecimiento fase 2', value: fmtPct(gp.g2) },
    { label: 'Crecimiento terminal', value: fmtPct(gp.gT) },
    { label: 'Tasa de descuento (con prima)', value: fmtPct(gp.r) },
    { label: 'Ajuste por I+D', value: rdAdj ? '−1pp (I+D >20%)' : 'No aplicado' },
    { label: 'Métrica de crecimiento usada', value: SOURCE_LABEL[gp.source] || gp.source },
    { label: 'CAGR ingresos 5a', value: gp.rev != null ? fmtRaw(gp.rev) : '—', danger: gp.rev != null && gp.rev < 0 },
    { label: 'CAGR FCF 5a', value: gp.fcf != null ? fmtRaw(gp.fcf) : '—', danger: gp.fcf != null && gp.fcf < 0 },
    { label: 'Acciones (aprox.)', value: fmtBig(shares) },
  ]
  if (gp.declinePenalty > 0) inputs.push({ label: 'Penalización por ingresos en declive', value: `+${(gp.declinePenalty * 100).toFixed(0)}% al descuento`, danger: true })

  return {
    method: 'dcf_pharma', methodLabel: 'DCF · Prima riesgo', available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mosFn(iv, price),
    discount: gp.r, growth: gp.g1, terminal: gp.gT,
    inputs, notes: [...preNotes, ...gp.notes], warnings: gp.warnings,
    fcfYears: null,
    tooltip: 'En farmacéuticas se aplica una tasa de descuento más alta para reflejar la incertidumbre del pipeline de patentes. Una alta inversión en I+D reduce parcialmente esta prima.',
    engine: 'dcf', params, editable: editableFor('dcf', currency), projection: proj.years,
    growthInputUsed: gp.terminalZero ? 'cero_por_declive' : gp.source,
    revCagr: gp.rev, fcfCagr: gp.fcf, declinePenalty: gp.declinePenalty, terminalZero: gp.terminalZero,
  }
}

// ── Method 6: DCF normalizado — Energía ──────────────────────────────────

function dcfNormalized(data, moatWidth, currency) {
  return buildDCF(data, {
    method: 'dcf_normalized', label: 'DCF · Normalizado', currency,
    tooltip: 'En sectores cíclicos usar el FCF del año más reciente puede generar valoraciones extremas. El FCF normalizado como media del ciclo completo da una estimación más estable y conservadora del valor intrínseco.',
    baseSource: 'fcf_normalized', baseLabel: 'FCF normalizado (media ciclo)',
    discountBase: moatWidth === 'wide' ? 0.10 : moatWidth === 'narrow' ? 0.12 : 0.14,
    terminalBase: 0.02,
    capHigh: 0.10, revenueOnly: true,
    extraNotes: ['Se usa el FCF medio de los últimos 4 años para neutralizar el efecto del ciclo de precios del commodity.'],
  })
}

// ── Method 2: DDM — Bancos y Aseguradoras (sin cambios de corrección) ─────

function dcfDDM(data, sectorType, currency) {
  const M = 'ddm', L = 'DDM'
  const TT = 'El modelo DDM descuenta los dividendos futuros esperados al coste de equity estimado. Es el método preferido para bancos y aseguradoras porque el dividendo es el flujo de caja real que recibe el accionista.'
  const price = n(data.current_price)

  const dps = n(data.dps)
  if (!dps || dps <= 0) return na(M, L, price, 'DDM no disponible — empresa sin dividendo', TT)

  const dc = n(data.div_cagr5)
  const g  = clamp(dc != null ? dc / 100 : 0.03, 0, 0.15)
  const eur = currency === 'EUR'
  const ke = sectorType === 'bank' ? (eur ? 0.09 : 0.10) : (eur ? 0.08 : 0.09)
  const gT = eur ? 0.02 : 0.025

  if (ke <= gT) return na(M, L, price, 'Modelo no convergente — coste de equity ≤ crecimiento terminal', TT)

  const params = { dps, g, ke, gT }
  const { intrinsicValue } = recomputeValuation('ddm', params, price)

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue, price, mos: mosFn(intrinsicValue, price), discount: ke, growth: g, terminal: gT,
    inputs: [
      { label: 'DPS base (último año completo)', value: dps?.toFixed(4) ?? '—' },
      { label: 'Tasa crecimiento dividendo', value: fmtPct(g) },
      { label: 'Coste de equity', value: fmtPct(ke) },
      { label: 'Crecimiento terminal', value: fmtPct(gT) },
      { label: 'CAGR dividendo 5a histórico', value: dc != null ? fmtRaw(dc) : '—' },
    ],
    notes: ['Valoración mediante descuento de dividendos futuros. Método estándar para entidades financieras donde el FCF no es una métrica relevante.'],
    warnings: [], fcfYears: null, tooltip: TT,
    engine: 'ddm', params, editable: editableFor('ddm', currency), projection: null,
    growthInputUsed: 'div_cagr5', revCagr: null, fcfCagr: null, declinePenalty: 0, terminalZero: false,
  }
}

// ── Method 3: Múltiplo AFFO — REITs (sin cambios de corrección) ───────────

function dcfAFFO(data, moatWidth, currency) {
  const M = 'affo', L = 'Múltiplo AFFO'
  const TT = 'En REITs el valor intrínseco se estima aplicando un múltiplo sobre el AFFO por acción — el flujo de caja operativo ajustado. El FCF tradicional no aplica porque el capex incluye inversiones en crecimiento del portfolio.'
  const price = n(data.current_price)

  const ocf = fromStmt(data, 'cashflow_annual', OCF_NAMES)
  if (!ocf || ocf <= 0) return na(M, L, price, 'AFFO no disponible — OCF no disponible o negativo', TT)

  const shares = getShares(data)
  if (!shares) return na(M, L, price, 'Datos insuficientes — capitalización no disponible', TT)

  const reit = detectReit(data.industry)
  let mult = reit.m
  if (moatWidth === 'wide') mult = Math.round(mult * 1.1 * 10) / 10
  else if (moatWidth === 'none') mult = Math.round(mult * 0.9 * 10) / 10

  const params = { ocf, mult, shares }
  const { intrinsicValue } = recomputeValuation('affo', params, price)
  const affoPS = ocf / shares

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue, price, mos: mosFn(intrinsicValue, price), discount: 0, growth: 0, terminal: 0,
    inputs: [
      { label: 'OCF base (último año)', value: fmtBig(ocf) },
      { label: 'Acciones (aprox.)', value: fmtBig(shares) },
      { label: 'AFFO por acción estimado', value: affoPS.toFixed(4) },
      { label: 'Tipo de REIT detectado', value: reit.label },
      { label: 'Múltiplo base', value: reit.m + '×' },
      { label: 'Múltiplo aplicado (adj. foso)', value: mult + '×' },
    ],
    notes: [], warnings: [], fcfYears: null, tooltip: TT,
    engine: 'affo', params, editable: editableFor('affo', currency), projection: null,
    growthInputUsed: null, revCagr: null, fcfCagr: null, declinePenalty: 0, terminalZero: false,
  }
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeValuation(data, moatWidth, type, currency) {
  if (!data) return null
  const sector = detectSector(type, data.sector, data.industry)
  let res
  switch (sector) {
    case 'bank':
    case 'insurer':   res = dcfDDM(data, sector, currency); break
    case 'reit':      res = dcfAFFO(data, moatWidth, currency); break
    case 'utilities': res = dcfCFO(data, moatWidth, currency); break
    case 'pharma':    res = dcfPharma(data, moatWidth, currency); break
    case 'energy':    res = dcfNormalized(data, moatWidth, currency); break
    default:          res = dcfFCF(data, moatWidth, currency)
  }
  // Guard de fiabilidad: si el valor intrínseco sale como una fracción ínfima
  // (MoS < −85%) o un múltiplo absurdo (MoS > 500%) del precio, casi siempre es
  // un artefacto de datos/divisa (p.ej. Infosys, iv en escala errónea) → no se
  // muestra como fiable en vez de un "−99%" que destruye la confianza.
  if (res && res.available && res.mos != null && (res.mos < -0.85 || res.mos > 5)) {
    return {
      ...res, available: false,
      unavailableReason: 'Valor intrínseco no fiable para este activo — posible problema de datos o de divisa.',
      intrinsicValue: null, mos: null, projection: null,
    }
  }
  return res
}
