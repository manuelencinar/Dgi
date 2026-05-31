// DGI Valuation System — sector-aware intrinsic value calculation

function n(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }

function fmtBig(v) {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a >= 1e12) return (v / 1e12).toFixed(2) + ' B'
  if (a >= 1e9)  return (v / 1e9).toFixed(1)  + ' MM'
  if (a >= 1e6)  return (v / 1e6).toFixed(0)  + ' M'
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

// ── DCF core ──────────────────────────────────────────────────────────────

function runDCF(base, g1, g2, gT, r) {
  let total = 0, cf = base
  for (let i = 1; i <= 5; i++) { cf *= (1 + g1); total += cf / Math.pow(1 + r, i) }
  for (let i = 1; i <= 5; i++) { cf *= (1 + g2); total += cf / Math.pow(1 + r, 5 + i) }
  if (r > gT) total += cf * (1 + gT) / (r - gT) / Math.pow(1 + r, 10)
  return total
}

function mos(iv, price) { return iv != null && price && price > 0 ? (iv - price) / price : null }

// ── Unavailable ───────────────────────────────────────────────────────────

function na(method, label, price, reason, tooltip) {
  return { method, methodLabel: label, available: false, unavailableReason: reason,
    intrinsicValue: null, price, mos: null, discount: 0, growth: 0, terminal: 0,
    inputs: [], notes: [], fcfYears: null, tooltip }
}

// ── Method 1: DCF FCF — General ───────────────────────────────────────────

function dcfFCF(data, moatWidth, currency) {
  const M = 'dcf_fcf', L = 'DCF · FCF'
  const TT = 'Valor calculado mediante descuento de flujos de caja libre proyectados a 10 años. La tasa de descuento se ajusta según el foso económico detectado. Un margen de seguridad positivo indica que la empresa cotiza por debajo de su valor estimado.'
  const price = n(data.current_price)

  const fcf = fromStmt(data, 'cashflow_annual', ['Flujo de Caja Libre', 'Free Cash Flow'])
  if (!fcf || fcf <= 0) return na(M, L, price, 'DCF no disponible — FCF negativo o no disponible', TT)

  const shares = getShares(data)
  if (!shares) return na(M, L, price, 'Datos insuficientes — capitalización no disponible', TT)

  const dc = n(data.div_cagr5), rc = n(data.revenue_cagr5)
  const candidates = [dc, rc].filter(v => v != null && v > 0)
  const g1 = Math.min(candidates.length ? Math.min(...candidates) / 100 : 0.05, 0.20)
  const g2 = g1 / 2
  const gT = currency === 'EUR' ? 0.025 : 0.030
  const r  = moatWidth === 'wide' ? 0.08 : moatWidth === 'narrow' ? 0.10 : 0.12

  const iv = runDCF(fcf, g1, g2, gT, r) / shares

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mos(iv, price), discount: r, growth: g1, terminal: gT,
    inputs: [
      { label: 'FCF base (último año)', value: fmtBig(fcf) },
      { label: 'Crecimiento fase 1 (años 1–5)', value: fmtPct(g1) },
      { label: 'Crecimiento fase 2 (años 6–10)', value: fmtPct(g2) },
      { label: 'Crecimiento terminal', value: fmtPct(gT) },
      { label: 'Tasa de descuento', value: fmtPct(r) },
      { label: 'Foso económico', value: moatWidth === 'wide' ? 'Ancho' : moatWidth === 'narrow' ? 'Estrecho' : 'Sin foso' },
      { label: 'CAGR dividendo 5a', value: dc != null ? fmtRaw(dc) : '—' },
      { label: 'CAGR ingresos 5a',  value: rc != null ? fmtRaw(rc) : '—' },
      { label: 'Acciones (aprox.)', value: fmtBig(shares) },
    ],
    notes: [],
    fcfYears: null,
    tooltip: TT,
  }
}

// ── Method 2: DDM — Bancos y Aseguradoras ────────────────────────────────

function dcfDDM(data, sectorType, currency) {
  const M = 'ddm', L = 'DDM'
  const TT = 'El modelo DDM descuenta los dividendos futuros esperados al coste de equity estimado. Es el método preferido para bancos y aseguradoras porque el dividendo es el flujo de caja real que recibe el accionista.'
  const price = n(data.current_price)

  const dps = n(data.dps)
  if (!dps || dps <= 0) return na(M, L, price, 'DDM no disponible — empresa sin dividendo', TT)

  const dc = n(data.div_cagr5)
  const g  = Math.min(Math.max(dc != null ? dc / 100 : 0.03, 0), 0.15)
  const eur = currency === 'EUR'
  const ke = sectorType === 'bank' ? (eur ? 0.09 : 0.10) : (eur ? 0.08 : 0.09)
  const gT = eur ? 0.02 : 0.025

  if (ke <= gT) return na(M, L, price, 'Modelo no convergente — coste de equity ≤ crecimiento terminal', TT)

  let value = 0, div = dps
  for (let i = 1; i <= 5; i++) { div *= (1 + g); value += div / Math.pow(1 + ke, i) }
  value += div * (1 + gT) / (ke - gT) / Math.pow(1 + ke, 5)

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue: value, price, mos: mos(value, price), discount: ke, growth: g, terminal: gT,
    inputs: [
      { label: 'DPS base (último año completo)', value: dps?.toFixed(4) ?? '—' },
      { label: 'Tasa crecimiento dividendo', value: fmtPct(g) },
      { label: 'Coste de equity', value: fmtPct(ke) },
      { label: 'Crecimiento terminal', value: fmtPct(gT) },
      { label: 'CAGR dividendo 5a histórico', value: dc != null ? fmtRaw(dc) : '—' },
      { label: 'Divisa', value: eur ? 'EUR' : 'USD/otro' },
    ],
    notes: ['Valoración mediante descuento de dividendos futuros. Método estándar para entidades financieras donde el FCF no es una métrica relevante.'],
    fcfYears: null,
    tooltip: TT,
  }
}

// ── Method 3: Múltiplo AFFO — REITs ──────────────────────────────────────

function dcfAFFO(data, moatWidth) {
  const M = 'affo', L = 'Múltiplo AFFO'
  const TT = 'En REITs el valor intrínseco se estima aplicando un múltiplo sobre el AFFO por acción — el flujo de caja operativo ajustado. El FCF tradicional no aplica porque el capex incluye inversiones en crecimiento del portfolio.'
  const price = n(data.current_price)

  const ocf = fromStmt(data, 'cashflow_annual', [
    'Cash Flow Operativo', 'Operating Cash Flow',
    'Cash Flow From Continuing Operating Activities', 'Total Cash From Operating Activities',
  ])
  if (!ocf || ocf <= 0) return na(M, L, price, 'AFFO no disponible — OCF no disponible o negativo', TT)

  const shares = getShares(data)
  if (!shares) return na(M, L, price, 'Datos insuficientes — capitalización no disponible', TT)

  const reit = detectReit(data.industry)
  let mult = reit.m
  if (moatWidth === 'wide') mult = Math.round(mult * 1.1 * 10) / 10
  else if (moatWidth === 'none') mult = Math.round(mult * 0.9 * 10) / 10

  const affoPS = ocf / shares
  const iv     = affoPS * mult

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mos(iv, price), discount: 0, growth: 0, terminal: 0,
    inputs: [
      { label: 'OCF base (último año)', value: fmtBig(ocf) },
      { label: 'Acciones (aprox.)', value: fmtBig(shares) },
      { label: 'AFFO por acción estimado', value: affoPS.toFixed(4) },
      { label: 'Tipo de REIT detectado', value: reit.label },
      { label: 'Múltiplo base', value: reit.m + '×' },
      { label: 'Múltiplo aplicado (adj. foso)', value: mult + '×' },
      { label: 'Foso económico', value: moatWidth === 'wide' ? 'Ancho' : moatWidth === 'narrow' ? 'Estrecho' : 'Sin foso' },
    ],
    notes: [],
    fcfYears: null,
    tooltip: TT,
  }
}

// ── Method 4: DCF CFO — Utilities ─────────────────────────────────────────

function dcfCFO(data, moatWidth, currency) {
  const M = 'dcf_cfo', L = 'DCF · CFO'
  const TT = 'En utilities los flujos regulados son muy predecibles, lo que justifica una tasa de descuento más baja. El CFO se usa como base porque el FCF suele ser negativo por las inversiones en la red regulada.'
  const price = n(data.current_price)

  const cfo = fromStmt(data, 'cashflow_annual', [
    'Cash Flow Operativo', 'Operating Cash Flow',
    'Cash Flow From Continuing Operating Activities', 'Total Cash From Operating Activities',
  ])
  if (!cfo || cfo <= 0) return na(M, L, price, 'DCF no disponible — CFO negativo o no disponible', TT)

  const shares = getShares(data)
  if (!shares) return na(M, L, price, 'Datos insuficientes — capitalización no disponible', TT)

  const rc = n(data.revenue_cagr5)
  const g1 = Math.min(Math.max(rc != null ? rc / 100 : 0.03, 0), 0.08)
  const g2 = g1 / 2
  const gT = 0.02
  const r  = moatWidth === 'wide' ? 0.06 : moatWidth === 'narrow' ? 0.075 : 0.09

  const iv = runDCF(cfo, g1, g2, gT, r) / shares

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mos(iv, price), discount: r, growth: g1, terminal: gT,
    inputs: [
      { label: 'CFO base (último año)', value: fmtBig(cfo) },
      { label: 'Crecimiento fase 1 (años 1–5)', value: fmtPct(g1) },
      { label: 'Crecimiento fase 2 (años 6–10)', value: fmtPct(g2) },
      { label: 'Crecimiento terminal', value: fmtPct(gT) },
      { label: 'Tasa de descuento (regulada)', value: fmtPct(r) },
      { label: 'Foso económico', value: moatWidth === 'wide' ? 'Ancho' : moatWidth === 'narrow' ? 'Estrecho' : 'Sin foso' },
      { label: 'CAGR ingresos 5a', value: rc != null ? fmtRaw(rc) : '—' },
      { label: 'Acciones (aprox.)', value: fmtBig(shares) },
    ],
    notes: ['Se usa el flujo de caja operativo en lugar del libre porque el capex de utilities es inversión en activos regulados, no gasto de mantenimiento.'],
    fcfYears: null,
    tooltip: TT,
  }
}

// ── Method 5: DCF prima riesgo — Farmacéuticas ───────────────────────────

function dcfPharma(data, moatWidth, currency) {
  const M = 'dcf_pharma', L = 'DCF · Prima riesgo'
  const TT = 'En farmacéuticas se aplica una tasa de descuento más alta para reflejar la incertidumbre del pipeline de patentes. Una alta inversión en I+D reduce parcialmente esta prima.'
  const price = n(data.current_price)

  let fcf = fromStmt(data, 'cashflow_annual', ['Flujo de Caja Libre', 'Free Cash Flow'])
  if (!fcf || fcf <= 0) return na(M, L, price, 'DCF no disponible — FCF negativo o no disponible', TT)

  const shares = getShares(data)
  if (!shares) return na(M, L, price, 'Datos insuficientes — capitalización no disponible', TT)

  const notes = []

  // Goodwill > 50%? reduce FCF base
  const bsd = data.balance_sheet_annual?.data
  if (bsd) {
    const gw = (bsd['Fondo de Comercio'] || bsd['Goodwill'])?.[0]
    const at = (bsd['Activos Totales']   || bsd['Total Assets'])?.[0]
    if (gw && at && at > 0 && gw / at > 0.50) {
      fcf *= 0.90
      notes.push('FCF ajustado por goodwill elevado (>50% de activos)')
    }
  }

  // R&D > 20%? reduce discount 1pp
  let rdAdj = false
  const isd = data.income_statement_annual?.data
  if (isd) {
    const rd  = Math.abs((isd['I+D'] || isd['Research And Development'])?.[0] || 0)
    const rev = (isd['Ingresos Totales'] || isd['Total Revenue'])?.[0]
    if (rd && rev && rev > 0 && rd / rev > 0.20) rdAdj = true
  }

  let r = moatWidth === 'wide' ? 0.10 : moatWidth === 'narrow' ? 0.12 : 0.14
  if (rdAdj) { r -= 0.01; notes.push('Prima de riesgo reducida por alta inversión en I+D (>20% ingresos)') }

  const dc = n(data.div_cagr5), rc = n(data.revenue_cagr5)
  const candidates = [dc, rc].filter(v => v != null && v > 0)
  const g1 = Math.min(candidates.length ? Math.min(...candidates) / 100 : 0.05, 0.15)
  const g2 = g1 / 2
  const gT = currency === 'EUR' ? 0.025 : 0.030

  const iv = runDCF(fcf, g1, g2, gT, r) / shares

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mos(iv, price), discount: r, growth: g1, terminal: gT,
    inputs: [
      { label: 'FCF base' + (notes.length ? ' (ajustado)' : ''), value: fmtBig(fcf) },
      { label: 'Crecimiento fase 1', value: fmtPct(g1) },
      { label: 'Crecimiento fase 2', value: fmtPct(g2) },
      { label: 'Crecimiento terminal', value: fmtPct(gT) },
      { label: 'Tasa de descuento (con prima)', value: fmtPct(r) },
      { label: 'Ajuste por I+D', value: rdAdj ? '−1pp (I+D >20%)' : 'No aplicado' },
      { label: 'CAGR dividendo 5a', value: dc != null ? fmtRaw(dc) : '—' },
      { label: 'CAGR ingresos 5a',  value: rc != null ? fmtRaw(rc) : '—' },
      { label: 'Acciones (aprox.)', value: fmtBig(shares) },
    ],
    notes,
    fcfYears: null,
    tooltip: TT,
  }
}

// ── Method 6: DCF normalizado — Energía ──────────────────────────────────

function dcfNormalized(data, moatWidth, currency) {
  const M = 'dcf_normalized', L = 'DCF · Normalizado'
  const TT = 'En sectores cíclicos usar el FCF del año más reciente puede generar valoraciones extremas. El FCF normalizado como media del ciclo completo da una estimación más estable y conservadora del valor intrínseco.'
  const price = n(data.current_price)

  const vals = fromStmtSlice(data, 'cashflow_annual', ['Flujo de Caja Libre', 'Free Cash Flow'], 4)
  if (vals.length < 2) return na(M, L, price, 'DCF no disponible — menos de 2 años de FCF disponibles', TT)

  const fcfNorm = vals.reduce((a, b) => a + b, 0) / vals.length
  if (!fcfNorm) return na(M, L, price, 'DCF no disponible — FCF normalizado es cero', TT)

  const shares = getShares(data)
  if (!shares) return na(M, L, price, 'Datos insuficientes — capitalización no disponible', TT)

  const rc = n(data.revenue_cagr5)
  const g1 = Math.min(Math.max(rc != null ? rc / 100 : 0.03, -0.05), 0.10)
  const g2 = g1 / 2
  const gT = 0.02
  const r  = moatWidth === 'wide' ? 0.10 : moatWidth === 'narrow' ? 0.12 : 0.14

  const cols = data.cashflow_annual?.columns || []
  const fcfYears = vals.map((v, i) => ({
    year: cols[i] ? cols[i].substring(0, 4) : `Año -${i}`,
    value: v,
  }))

  const iv = runDCF(fcfNorm, g1, g2, gT, r) / shares

  return {
    method: M, methodLabel: L, available: true, unavailableReason: null,
    intrinsicValue: iv, price, mos: mos(iv, price), discount: r, growth: g1, terminal: gT,
    inputs: [
      { label: 'FCF normalizado (media ciclo)', value: fmtBig(fcfNorm) },
      { label: 'Crecimiento fase 1', value: fmtPct(g1) },
      { label: 'Crecimiento fase 2', value: fmtPct(g2) },
      { label: 'Crecimiento terminal', value: fmtPct(gT) },
      { label: 'Tasa de descuento', value: fmtPct(r) },
      { label: 'CAGR ingresos 5a', value: rc != null ? fmtRaw(rc) : '—' },
      { label: 'Acciones (aprox.)', value: fmtBig(shares) },
    ],
    notes: ['Se usa el FCF medio de los últimos 4 años para neutralizar el efecto del ciclo de precios del commodity.'],
    fcfYears,
    tooltip: TT,
  }
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeValuation(data, moatWidth, type, currency) {
  if (!data) return null
  const sector = detectSector(type, data.sector, data.industry)
  switch (sector) {
    case 'bank':
    case 'insurer':   return dcfDDM(data, sector, currency)
    case 'reit':      return dcfAFFO(data, moatWidth)
    case 'utilities': return dcfCFO(data, moatWidth, currency)
    case 'pharma':    return dcfPharma(data, moatWidth, currency)
    case 'energy':    return dcfNormalized(data, moatWidth, currency)
    default:          return dcfFCF(data, moatWidth, currency)
  }
}
