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

// ── FCFF / WACC / puente EV→Equity ──────────────────────────────────────────
// El DCF se hace SIEMPRE sobre FCFF (no apalancado) → da Enterprise Value → se resta
// la deuda neta para llegar al equity. Así no se duplica el efecto de la deuda en
// empresas US (cuyo FCF de Yahoo ya es post-intereses) ni se ignora en las europeas.
const INTEREST_NAMES = ['Interest Expense', 'Gastos por Intereses', 'Interest Expense Non Operating']
const TOTAL_DEBT_NAMES = ['Total Debt', 'Deuda Total']
const MINORITY_NAMES = ['Minority Interest', 'Intereses Minoritarios', 'Minority Interests']
function effTax(data) {
  const t = n(data.tax_rate_effective)
  return (t != null && t >= 0.05 && t <= 0.45) ? t : 0.25
}
function netDebtAbs(data) {
  const nd = n(data.net_debt)   // almacenado en MILLONES
  return nd != null ? nd * 1e6 : 0
}
// Obligaciones por arrendamientos (IFRS 16 / leases). Total y porción corriente
// (≈ principal de lease pagado al año). Bajo IFRS 16 el principal del lease va a
// FINANCIACIÓN, así que el FCF (OCF−capex) NO lo resta → infla el FCF de retailers
// intensivos en alquiler (Dunelm, Ahold). El "Total Debt" SÍ engloba los leases.
function leaseTotal(data) {
  const v = fromStmt(data, 'balance_sheet_annual', ['Capital Lease Obligations', 'Long Term Capital Lease Obligation'])
  return v != null && v > 0 ? v : 0
}
function leaseCurrent(data) {
  const v = fromStmt(data, 'balance_sheet_annual', ['Current Capital Lease Obligation'])
  return v != null && v > 0 ? v : 0
}
function minorityAbs(data) {
  const v = fromStmt(data, 'balance_sheet_annual', MINORITY_NAMES)
  return v != null && v > 0 ? v : 0
}
// Intereses netos de impuestos (para "des-apalancar" el FCF US-GAAP a FCFF).
function interestAfterTax(data, t) {
  const v = fromStmt(data, 'income_statement_annual', INTEREST_NAMES)
  return v != null ? Math.abs(v) * (1 - t) : 0
}

const FCF_NAMES = ['Flujo de Caja Libre', 'Free Cash Flow']
const OCF_NAMES = ['Cash Flow Operativo', 'Operating Cash Flow', 'Cash Flow From Continuing Operating Activities', 'Total Cash From Operating Activities']
const REV_NAMES = ['Ingresos Totales', 'Total Revenue', 'Total Revenues']
const EQUITY_NAMES = ['Patrimonio Neto', 'Stockholders Equity', 'Common Stock Equity', 'Total Equity Gross Minority Interest', 'Total Equity']

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

// CAGR robusto a un AÑO DE INICIO DEPRIMIDO: si el año más antiguo de la ventana es
// un outlier estadístico (>1,5 desviaciones por debajo de la tendencia de los demás
// años), se EXCLUYE del cálculo del CAGR para no inflar el crecimiento (p.ej. Colgate,
// cuyo FCF base estaba deprimido por inflación de costes). El año sí se mantiene en la
// MEDIA del FCF base (suavizado de ciclo); aquí solo se corrige el crecimiento.
// Misma idea que con las cíclicas de materiales, pero el "ciclo" aquí es de márgenes.
function adjustedCagr(data, key, names, fallback) {
  const recentFirst = fromStmtSlice(data, key, names, 5)   // más reciente primero, sin nulos
  const v = recentFirst.slice().reverse().filter(x => x != null && x > 0)  // antiguo→reciente
  if (v.length < 4) return fallback                        // pocos datos → CAGR precalculado
  const others = v.slice(1)                                // todos menos el más antiguo
  const m = others.length
  const xs = others.map((_, i) => i + 1)
  const mx = xs.reduce((a, b) => a + b, 0) / m, my = others.reduce((a, b) => a + b, 0) / m
  let num = 0, den = 0
  for (let i = 0; i < m; i++) { num += (xs[i] - mx) * (others[i] - my); den += (xs[i] - mx) ** 2 }
  const slope = den ? num / den : 0, intercept = my - slope * mx
  const pred0 = intercept                                  // tendencia extrapolada al año 0 (más antiguo)
  let ss = 0; for (let i = 0; i < m; i++) { const e = others[i] - (intercept + slope * xs[i]); ss += e * e }
  const std = Math.sqrt(ss / m)
  if (v[0] < pred0 - 1.5 * std) {                          // año de inicio deprimido → excluirlo
    const start = v[1], end = v[v.length - 1], yrs = v.length - 2
    if (start > 0 && end > 0 && yrs >= 1) return (Math.pow(end / start, 1 / yrs) - 1) * 100
  }
  return fallback
}

// ── Business growth hierarchy (Corrección 1) ───────────────────────────────
// Nunca usa div_cagr5. Devuelve gPct en %, fuente, y rev/fcf crudos.

function businessGrowth(data, revenueOnly = false) {
  const rev = adjustedCagr(data, 'income_statement_annual', REV_NAMES, n(data.revenue_cagr5))
  const fcf = adjustedCagr(data, 'cashflow_annual', FCF_NAMES, n(data.fcf_cagr5))
  let gPct, source
  if (revenueOnly) {
    gPct = rev != null ? rev : 0
    source = rev != null ? 'revenue_cagr5' : 'cero_por_declive'
  } else if (rev != null && fcf != null) {
    // Divergencia FCF↔ingresos: si el FCF se DESPLOMA mientras los ingresos CRECEN, la
    // caída suele ser no recurrente (litigios, contingencias, capex de integración) y no
    // representa la trayectoria del negocio → usar los ingresos como proxy, no el promedio
    // que colapsa el valor intrínseco (caso Coca-Cola 2024-25: rev +3,7% / fcf −17,8%).
    if (rev > 0 && (rev - fcf) >= 15 && fcf < -5) {
      gPct = rev; source = 'revenue_cagr5_divergencia_fcf'
    } else {
      gPct = (rev + fcf) / 2; source = 'media_fcf_revenue'
    }
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

export function dcfProjection({ base, g1, g2, gT, r, stage2 = 5 }) {
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
  if (engine === 'epb') {
    // Exceso de retorno: Valor = BVPS × (ROE − g) / (Ke − g)
    const { bvps, roe, g, ke } = params
    const iv = (ke > g && roe > g && bvps > 0) ? bvps * (roe - g) / (ke - g) : null
    return { intrinsicValue: iv, mos: mosFn(iv, price), projection: null }
  }
  // dcf — el DCF da Enterprise Value (FCFF); se resta deuda neta (+minoritarios) → equity.
  const proj = dcfProjection(params)
  const iv = params.shares > 0 ? (proj.totalPV - (params.netDebt || 0)) / params.shares : null
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
  if (engine === 'epb') return [
    { key: 'bvps', label: 'Valor contable / acción', type: 'number', unit: currency },
    { key: 'roe',  label: 'ROE',                    type: 'slider', unit: '%', min: 0, max: 30, step: 0.5, pct: true },
    { key: 'g',    label: 'Crecimiento sostenible', type: 'slider', unit: '%', min: 0, max: 8,  step: 0.5, pct: true },
    { key: 'ke',   label: 'Coste de equity',        type: 'slider', unit: '%', min: 6, max: 15, step: 0.5, pct: true },
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

  // Crecimiento + penalizaciones (gp.r = coste de equity: foso + penalización declive)
  const gp = growthAndPenalties(data, { discountBase, terminalBase, capHigh, revenueOnly })

  // ── Homogeneizar a FCFF (no apalancado) ───────────────────────────────────
  // El FCF de Yahoo (OCF−Capex) es post-intereses en US-GAAP (apalancado). Se le
  // devuelven los intereses netos de impuestos para volverlo FCFF; en IFRS se asume
  // ya no apalancado (intereses en financiación). El CFO de utilities se deja igual.
  const t = effTax(data)
  // US-GAAP ≈ ticker sin sufijo de mercado (AAPL, PG). El campo country viene como
  // nombre completo ("United States"), no sirve para comparar con 'US'.
  const isUS = !(data.ticker || '').includes('.')
  let intAdd = 0
  if (baseSource !== 'cfo' && isUS) intAdd = interestAfterTax(data, t)
  // Ajuste por arrendamientos (IFRS 16): en no-US el FCF excluye el principal del
  // lease (va a financiación) → se expensa el principal anual para reflejar el coste
  // recurrente real (un retailer alquila a perpetuidad). El CFO de utilities no se toca.
  const leaseAdj = (!isUS && baseSource !== 'cfo') ? leaseCurrent(data) : 0
  const fcffBase = base + intAdd - leaseAdj

  // Descuento del FCFF: la tasa ajustada por foso/sector (gp.r) se usa como WACC
  // (ya está calibrada a ~coste de capital; derivar un WACC más bajo desde ella como
  // si fuera coste de equity inflaba el EV). El FCFF a WACC da Enterprise Value.
  const wacc = gp.r

  const stage2 = opts.stage2 || 5
  // La deuda neta engloba los leases (Total Debt los incluye). Como el coste del lease
  // ya está en el FCF (US: en OCF; IFRS: restado arriba), se EXCLUYE la obligación de
  // leases del puente EV→equity para no contarla dos veces.
  const netDebt = netDebtAbs(data) - leaseTotal(data) + minorityAbs(data)
  const params = { base: fcffBase, g1: gp.g1, g2: gp.g2, gT: gp.gT, r: wacc, shares, stage2, netDebt }
  const proj = dcfProjection(params)
  const ev = proj.totalPV                 // Enterprise Value
  const equity = ev - netDebt             // − deuda neta (+minoritarios) → Equity Value
  const iv = equity / shares

  const inputs = [
    { label: baseLabel || 'FCF base', value: fmtBig(base) },
  ]
  if (intAdd > 0) inputs.push({ label: '+ Intereses netos de imp. (a FCFF)', value: fmtBig(intAdd) })
  if (leaseAdj > 0) inputs.push({ label: '− Principal de arrendamientos (IFRS 16)', value: fmtBig(leaseAdj), danger: true })
  inputs.push(
    { label: 'Crecimiento fase 1 (años 1–5)', value: fmtPct(gp.g1) },
    { label: `Crecimiento fase 2 (años 6–${5 + stage2})`, value: fmtPct(gp.g2) },
    { label: 'Crecimiento terminal', value: fmtPct(gp.gT) },
    { label: 'WACC (descuento)', value: fmtPct(wacc) },
    { label: 'Valor de empresa (EV)', value: fmtBig(ev) },
    { label: '− Deuda neta', value: fmtBig(netDebt), danger: netDebt > 0 },
    { label: 'Valor del equity', value: fmtBig(equity) },
    { label: 'Métrica de crecimiento usada', value: SOURCE_LABEL[gp.source] || gp.source },
    { label: 'CAGR ingresos 5a', value: gp.rev != null ? fmtRaw(gp.rev) : '—', danger: gp.rev != null && gp.rev < 0 },
    { label: 'Acciones (aprox.)', value: fmtBig(shares) },
  )
  if (gp.declinePenalty > 0) {
    inputs.push({ label: 'Penalización por ingresos en declive', value: `+${(gp.declinePenalty * 100).toFixed(0)}% al coste de equity`, danger: true })
  }

  return {
    method, methodLabel: label, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mosFn(iv, price),
    discount: wacc, growth: gp.g1, terminal: gp.gT,
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
    tooltip: 'Valor calculado mediante descuento de flujos de caja libre proyectados a 10 años. Se parte del FCF NORMALIZADO (media de los últimos años) para que un ejercicio puntual de capex alto o bajo no distorsione la valoración. La tasa de descuento se ajusta según el foso económico detectado. Un margen de seguridad positivo indica que la empresa cotiza por debajo de su valor estimado.',
    baseSource: 'fcf_normalized', baseLabel: 'FCF normalizado (media)',
    discountBase: moatWidth === 'wide' ? 0.08 : moatWidth === 'narrow' ? 0.10 : 0.12,
    terminalBase: currency === 'EUR' ? 0.025 : 0.030,
    capHigh: 0.20,
    extraNotes: ['Se usa el FCF medio de los últimos años (no el del último ejercicio) para neutralizar picos puntuales de capex o circulante.'],
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
  // FCFF (des-apalancar si US-GAAP) + WACC + puente EV→equity (igual que buildDCF).
  const t = effTax(data)
  const isUS = !(data.ticker || '').includes('.')
  const intAdd = isUS ? interestAfterTax(data, t) : 0
  const leaseAdj = !isUS ? leaseCurrent(data) : 0
  const wacc = gp.r
  const netDebt = netDebtAbs(data) - leaseTotal(data) + minorityAbs(data)
  const params = { base: base + intAdd - leaseAdj, g1: gp.g1, g2: gp.g2, gT: gp.gT, r: wacc, shares, netDebt }
  const proj = dcfProjection(params)
  const ev = proj.totalPV
  const equity = ev - netDebt
  const iv = equity / shares

  const inputs = [
    { label: 'FCF base' + (preNotes.length ? ' (ajustado)' : ''), value: fmtBig(base) },
    ...(intAdd > 0 ? [{ label: '+ Intereses netos de imp. (a FCFF)', value: fmtBig(intAdd) }] : []),
    { label: 'Crecimiento fase 1', value: fmtPct(gp.g1) },
    { label: 'Crecimiento fase 2', value: fmtPct(gp.g2) },
    { label: 'Crecimiento terminal', value: fmtPct(gp.gT) },
    { label: 'WACC (con prima de riesgo)', value: fmtPct(wacc) },
    { label: 'Valor de empresa (EV)', value: fmtBig(ev) },
    { label: '− Deuda neta', value: fmtBig(netDebt), danger: netDebt > 0 },
    { label: 'Valor del equity', value: fmtBig(equity) },
    { label: 'Ajuste por I+D', value: rdAdj ? '−1pp (I+D >20%)' : 'No aplicado' },
    { label: 'Acciones (aprox.)', value: fmtBig(shares) },
  ]
  if (gp.declinePenalty > 0) inputs.push({ label: 'Penalización por ingresos en declive', value: `+${(gp.declinePenalty * 100).toFixed(0)}% al coste de equity`, danger: true })

  return {
    method: 'dcf_pharma', methodLabel: 'DCF · Prima riesgo', available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mosFn(iv, price),
    discount: wacc, growth: gp.g1, terminal: gp.gT,
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

// Prima de riesgo de equity por divisa (mercados emergentes / alta inflación).
// Se suma al coste de equity. Las divisas no listadas se asumen desarrolladas (0).
const EQUITY_RISK_PREMIUM = {
  MXN: 0.05, BRL: 0.05, ZAR: 0.05, INR: 0.04, IDR: 0.05, TRY: 0.08, PHP: 0.04,
  THB: 0.03, MYR: 0.03, CLP: 0.04, COP: 0.05, PEN: 0.04, PLN: 0.03, HUF: 0.04,
  CZK: 0.02, CNY: 0.02, HKD: 0.01,
}
function equityRiskPremium(currency) { return EQUITY_RISK_PREMIUM[(currency || '').toUpperCase()] || 0 }

// ── Method 2b: Exceso de retorno / P/B justificado — Bancos y Aseguradoras ─
// El DCF de FCF no aplica a financieras (su balance es apalancamiento por diseño
// y el FCF no representa caja del accionista) — era la fuente de los MoS absurdos
// (Banorte +120%). El estándar de la industria es el modelo de exceso de retorno:
//   Valor = Valor contable por acción × (ROE − g) / (Coste de equity − g)
// Equivale a comparar el P/B que MERECE la entidad por su ROE con el P/B al que
// cotiza. Es mucho más robusto que un DCF forzado y se computa con datos de Yahoo
// (ROE, valor contable / P/B, crecimiento). En aseguradoras, sin combined ratio
// fiable, no se puede saber si el ROE viene de buena suscripción o de un mercado
// alcista de inversiones → se marca con un disclaimer y menos confianza.
function excessReturnPB(data, sectorType, currency) {
  const M = 'epb', L = 'Exceso de retorno (P/B justificado)'
  const TT = 'En bancos y aseguradoras el FCF no es una métrica válida (el balance es apalancamiento por diseño). El valor intrínseco se estima por el modelo de exceso de retorno: el P/B que justifica la rentabilidad sobre el capital (ROE) frente al coste de equity. Valor = Valor contable × (ROE − g) / (Coste de equity − g).'
  const price = n(data.current_price)

  const roePct = n(data.roe)
  if (roePct == null) return na(M, L, price, 'No disponible — ROE no disponible', TT)
  // ROE usado: en ASEGURADORAS se amortigua (tope 14%) porque un ROE alto suele
  // venir del resultado de inversión —no sostenible— y no del negocio técnico; sin
  // combined ratio no se puede distinguir, así que se es conservador. En bancos se
  // usa el ROE real (un banco de ROE alto sostenido sí merece más múltiplo).
  const roe = sectorType === 'insurer' ? Math.min(roePct / 100, 0.14) : roePct / 100
  const eur = currency === 'EUR'
  // Coste de equity: bancos algo mayor que aseguradoras; EUR algo menor que USD,
  // MÁS una prima de riesgo país/divisa. Sin esta prima un banco emergente de ROE
  // alto (Banorte, ROE 23%) parece infravaloradísimo: su Ke real es ~15%, no 10%.
  const ke = (sectorType === 'bank' ? (eur ? 0.10 : 0.105) : (eur ? 0.09 : 0.095)) + equityRiskPremium(currency)

  // Crecimiento sostenible: CAGR del dividendo si lo hay; si no, ROE × retención.
  // Acotado a < ROE y, sobre todo, a Ke − 4% para que el spread (Ke − g) no se
  // estreche y dispare el P/B justificado (el modelo de Gordon explota cuando g→Ke).
  const dc = n(data.div_cagr5)
  const payout = n(data.payout_eps)
  const retention = payout != null && payout > 0 && payout < 100 ? (1 - payout / 100) : 0.5
  let g = dc != null ? dc / 100 : roe * retention
  g = clamp(g, 0, Math.min(roe - 0.005, ke - 0.04, 0.05))

  // Valor contable por acción: desde P/B (preferido) o patrimonio / acciones.
  let pb = n(data.price_to_book), bvps = null
  if (pb != null && pb > 0 && price) bvps = price / pb
  if (bvps == null) {
    const eq = fromStmt(data, 'balance_sheet_annual', EQUITY_NAMES)
    const sh = getShares(data)
    if (eq && sh) { bvps = eq / sh; if (price && bvps > 0) pb = price / bvps }
  }
  if (bvps == null || bvps <= 0) return na(M, L, price, 'No disponible — valor contable no disponible', TT)

  // Si el ROE no supera al crecimiento, la entidad no crea valor sobre su capital
  // → el modelo no aplica (P/B justificado ≤ 1, sin sentido proyectar).
  if (roe <= g) return na(M, L, price, 'No disponible — el ROE no supera el crecimiento sostenible (no crea valor sobre el coste de capital)', TT)

  // P/B justificado, acotado a un rango realista (0,3×–3×). El modelo de Gordon es
  // muy sensible cerca de g→Ke; sin tope, una entidad de ROE alto con P/B de
  // mercado bajo daría múltiplos de 4-5× irreales.
  const justifiedPB = clamp((roe - g) / (ke - g), 0.3, 3)
  const iv = bvps * justifiedPB

  const warnings = []
  if (sectorType === 'insurer') {
    warnings.push('Estimación basada solo en ROE y valor contable, sin ajustar por la calidad de la suscripción (combined ratio). Un ROE alto puede venir del resultado de inversión —no sostenible— y no del negocio técnico: interpretar con cautela.')
  }

  const params = { bvps, roe, g, ke }
  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mosFn(iv, price), discount: ke, growth: g, terminal: g,
    inputs: [
      { label: 'Valor contable por acción (BVPS)', value: fmtBig(bvps) },
      { label: 'ROE', value: fmtRaw(roePct) },
      { label: 'Crecimiento sostenible (g)', value: fmtPct(g) },
      { label: 'Coste de equity (Ke)', value: fmtPct(ke) },
      { label: 'P/B justificado por ROE', value: justifiedPB.toFixed(2) + '×' },
      { label: 'P/B de mercado actual', value: pb != null ? pb.toFixed(2) + '×' : '—', danger: pb != null && pb > justifiedPB },
    ],
    notes: ['Compara el P/B que merece la entidad según su ROE con el P/B al que cotiza. Más robusto que un DCF forzado: no depende de proyectar un FCF que en una financiera no representa caja del accionista.'],
    warnings, fcfYears: null, tooltip: TT,
    engine: 'epb', params, editable: editableFor('epb', currency), projection: null,
    growthInputUsed: dc != null ? 'div_cagr5' : 'roe_retencion', revCagr: null, fcfCagr: null, declinePenalty: 0, terminalZero: false,
  }
}

// ── Estructuras complejas (holdings, trusts, partnerships) ─────────────────
// Su valor es la suma de partes de activos subyacentes que no están en la cuenta
// de resultados consolidada → ningún DCF/EPS automático sirve (Brookfield Infra
// +401% era esto). Se valoran por descuento/prima sobre NAV, dato no disponible
// en Yahoo. Mejor un guion honesto que un número inventado que socava la confianza.
function detectComplexStructure(data) {
  const i = (data.industry || '').toLowerCase()
  const s = (data.sector || '').toLowerCase()
  const nm = (data.name || '').toLowerCase()
  const tk = (data.ticker || '').toUpperCase()
  // Holdings de inversión / capital privado / trusts cotizados / fondos cerrados.
  if (i.includes('holding') && (s.includes('financ') || i.includes('invers') || i.includes('investment'))) return true
  if (i.includes('investment trust') || i.includes('closed-end') || i.includes('asset management') && i.includes('holding')) return true
  if (i.includes('capital privado') || i.includes('private equity')) return true
  // Partnerships / LPs cotizadas (Brookfield Infrastructure/Renewable Partners…).
  if (/\bpartners?\b/.test(nm) && (nm.includes('l.p') || nm.includes(' lp'))) return true
  // Unidades (sufijo -UN): trusts/LPs cotizados por unidades, no acciones. Los
  // REITs ya se han enrutado por su sector antes de llegar aquí (p.ej. BIP-UN.TO).
  if (tk.includes('-UN')) return true
  if (nm.includes('investment trust') || (nm.includes(' trust') && !i.includes('reit') && s.includes('financ'))) return true
  return false
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
  // Estructuras complejas (holdings/trusts/partnerships): NO se valoran por DCF —
  // su valor es suma de partes / NAV (dato no disponible). Mejor un guion honesto.
  // Se comprueba ANTES del DCF de FCF (los REITs ya se han enrutado por su sector).
  if (sector !== 'reit' && sector !== 'bank' && sector !== 'insurer' && detectComplexStructure(data)) {
    return na('nav', 'Estructura compleja', n(data.current_price),
      'Valoración no disponible — estructura compleja (holding, trust o partnership). Su valor depende de la suma de sus activos subyacentes (NAV), no de un DCF sobre la cuenta consolidada.',
      'En holdings de inversión, trusts cotizados y partnerships el valor es la suma de las partes de los activos subyacentes (NAV), que no aparece en la cuenta de resultados consolidada. Un DCF automático produce resultados sin sentido, por eso no se calcula.')
  }
  let res
  switch (sector) {
    case 'bank':
    case 'insurer':   res = excessReturnPB(data, sector, currency); break
    case 'reit':      res = dcfAFFO(data, moatWidth, currency); break
    case 'utilities': res = dcfCFO(data, moatWidth, currency); break
    case 'pharma':    res = dcfPharma(data, moatWidth, currency); break
    case 'energy':    res = dcfNormalized(data, moatWidth, currency); break
    default:          res = dcfFCF(data, moatWidth, currency)
  }
  // Guard de fiabilidad (cap de cordura): si el valor intrínseco sale como una
  // fracción ínfima (MoS < −85%) o un múltiplo absurdo del precio (MoS > 80%),
  // casi nunca es una oportunidad real: es el modelo DCF disparado en un sector
  // donde no encaja sin ajustes (financieras, REITs con FFO en vez de FCF,
  // utilities muy apalancadas) o un artefacto de datos/divisa (p.ej. Infosys con
  // iv en escala errónea). Se marca "no fiable" en vez de mostrarlo como señal
  // verde de compra. Umbral en la decena alta del rango 60-80% para no descartar
  // descuentos genuinamente amplios.
  if (res && res.available && res.mos != null && (res.mos < -0.85 || res.mos > 0.8)) {
    return {
      ...res, available: false,
      unavailableReason: 'Valoración no fiable para este sector/modelo — el valor intrínseco se dispara fuera de un rango razonable (modelo DCF no apto para este activo o problema de datos/divisa).',
      intrinsicValue: null, mos: null, projection: null,
    }
  }
  return res
}
