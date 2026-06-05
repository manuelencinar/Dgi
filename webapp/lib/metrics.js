// Métricas financieras — fuente única de verdad
// calculateROIC: ROIC corregido (capital invertido real, no equity contable)

function n(v) { return v != null && !isNaN(v) ? parseFloat(v) : null }

// Detección de sector mínima (bancos/aseguradoras/REITs no aplican ROIC)
function roicSector(data) {
  const t = (data.type || '').toLowerCase()
  const s = (data.sector || '').toLowerCase()
  const i = (data.industry || '').toLowerCase()
  if (t === 'banco' || i.includes('bank') || i.includes('savings')) return 'bank'
  if (t === 'aseguradora' || i.includes('insur')) return 'insurer'
  if (t === 'reit' || t === 'bdc' || i.includes('reit') || i.includes('real estate investment')) return 'reit'
  return 'other'
}

// Lee una fila de un statement (Spanish o English) en el índice idx
function row(stmtData, names, idx = 0) {
  if (!stmtData) return null
  for (const nm of names) {
    if (stmtData[nm]?.[idx] != null) return stmtData[nm][idx]
  }
  return null
}

const HIGH_WARNING = 'ROIC muy elevado — puede reflejar estructura de capital con bajo patrimonio contable por recompras de acciones o intangibles no capitalizados. Comparar con peers del sector.'
const ADQ_WARNING  = 'Gran diferencia entre ROIC con y sin goodwill — crecimiento basado en adquisiciones.'
const ATYP_NOTE    = 'Capital invertido ajustado — estructura de balance atípica.'

// NOI/activos aproximado para REITs
function reitNoiOverAssets(data) {
  const is = data.income_statement_annual?.data
  const bs = data.balance_sheet_annual?.data
  const op = row(is, ['EBIT / Bº Operativo', 'Operating Income', 'Ebit'])
  const at = row(bs, ['Activos Totales', 'Total Assets'])
  return (op != null && at && at > 0) ? Math.round(op / at * 1000) / 10 : null
}

// Promedio de los dos últimos ejercicios (idx 0 y 1) para suavizar el balance
function row2(stmt, names) {
  const v0 = row(stmt, names, 0)
  if (v0 == null) return null
  const v1 = row(stmt, names, 1)
  return v1 != null ? (v0 + v1) / 2 : v0
}

// Cálculo desde estados financieros (mismo algoritmo que el script Python).
// ROIC = NOPAT / (Deuda total + Patrimonio neto), capital empleado medio,
// sin restar caja (no distorsiona negocios que acumulan mucho efectivo).
function computeFromStatements(data, currency) {
  const is = data.income_statement_annual?.data
  const bs = data.balance_sheet_annual?.data
  if (!is || !bs) return null

  const ebit = row(is, ['EBIT / Bº Operativo', 'Operating Income', 'Ebit', 'EBIT'])
  if (ebit == null) return null

  const totalAssets = row(bs, ['Activos Totales', 'Total Assets'])
  if (totalAssets == null || totalAssets <= 0) return null

  // Tasa impositiva efectiva
  const taxProv = row(is, ['Tax Provision', 'Income Tax Expense'])
  const pretax  = row(is, ['Pretax Income', 'Income Before Tax'])
  const defTax  = currency === 'USD' ? 0.21 : currency === 'EUR' ? 0.25 : 0.23
  let taxRate = (taxProv != null && pretax != null && pretax > 0) ? taxProv / pretax : defTax
  if (taxRate < 0 || taxRate > 0.50) taxRate = defTax

  const nopat = ebit * (1 - taxRate)

  const equity = row2(bs, ['Patrimonio Neto', 'Stockholders Equity', 'Total Equity Gross Minority Interest', 'Common Stock Equity', 'Total Equity'])
  if (equity == null) return null
  let debt = row2(bs, ['Deuda Total', 'Total Debt'])
  if (debt == null) {
    const lp = row2(bs, ['Deuda a L/P', 'Long Term Debt', 'Long Term Debt And Capital Lease Obligation']) || 0
    const cp = row2(bs, ['Current Debt', 'Deuda a C/P', 'Current Debt And Capital Lease Obligation', 'Short Long Term Debt']) || 0
    debt = lp + cp
  }

  let investedCapital = equity + debt

  // Capital invertido negativo (patrimonio muy negativo) → no calcular
  if (investedCapital <= 0) {
    return {
      roic_reported: null, roic_tangible: null, roic_display: null, roic_warning: null,
      roic_method: 'N/A — balance atípico', roic_not_applicable: false,
      nopat: Math.round(nopat), invested_capital: Math.round(investedCapital),
      invested_capital_tangible: null, tax_rate_effective: Math.round(taxRate * 1000) / 1000,
    }
  }

  // Suelo de seguridad: capital invertido mínimo 10% de activos
  let adjusted = false
  const floor = 0.10 * totalAssets
  if (investedCapital < floor) { investedCapital = floor; adjusted = true }

  const roicReported = nopat / investedCapital * 100

  // Capital invertido tangible (sin goodwill ni intangibles)
  let gw = row2(bs, ['Fondo de Comercio', 'Goodwill'])
  let intang = row2(bs, ['Other Intangible Assets', 'Otros Intangibles'])
  if (gw == null && intang == null) {
    const combined = row2(bs, ['Fondo de Comercio e Intangibles', 'Goodwill And Other Intangible Assets'])
    gw = combined || 0; intang = 0
  }
  gw = gw || 0; intang = intang || 0

  let icTangible = investedCapital - gw - intang
  if (icTangible < floor) icTangible = floor
  const roicTangible = nopat / icTangible * 100

  let warning = null
  if (roicReported > 60 || roicTangible > 60) warning = HIGH_WARNING
  if (Math.abs(roicReported - roicTangible) > 10) warning = warning ? warning + ' ' + ADQ_WARNING : ADQ_WARNING

  const rep = Math.round(roicReported * 10) / 10
  const tan = Math.round(roicTangible * 10) / 10
  return {
    roic_reported: rep,
    roic_tangible: tan,
    roic_display: minRoic(rep, tan),
    roic_warning: warning,
    roic_method: adjusted ? ATYP_NOTE : 'Capital invertido = activos − caja excedente − pasivos no financieros',
    roic_not_applicable: false,
    nopat: Math.round(nopat),
    invested_capital: Math.round(investedCapital),
    invested_capital_tangible: Math.round(icTangible),
    tax_rate_effective: Math.round(taxRate * 1000) / 1000,
  }
}

// ROIC a usar en toda la app: el más conservador (menor) de reported/tangible.
export function minRoic(reported, tangible) {
  const vals = [reported, tangible].filter(v => v != null && !isNaN(v))
  return vals.length ? Math.min(...vals) : null
}

// ── Export principal ───────────────────────────────────────────────────────

export function calculateROIC(data, currency) {
  if (!data) return blank()

  const sector = roicSector(data)
  if (sector === 'bank' || sector === 'insurer') {
    return { ...blank(), roic_not_applicable: true, roic_method: 'No aplica en banca/seguros',
      alternative_label: 'ROE', alternative_value: n(data.roe) }
  }
  if (sector === 'reit') {
    return { ...blank(), roic_not_applicable: true, roic_method: 'No aplica en REITs',
      alternative_label: 'NOI / Activos', alternative_value: reitNoiOverAssets(data) }
  }

  // Preferir valores precalculados por el script (mismo algoritmo, tasa correcta)
  if (n(data.roic_reported) != null || n(data.roic_tangible) != null) {
    // roic_warning puede venir como boolean, "true"/"false" (text) o mensaje.
    // Normalizar a un mensaje string o null — nunca renderizar "false".
    const wr = data.roic_warning
    const warnMsg = (wr === true || wr === 'true') ? HIGH_WARNING
      : (typeof wr === 'string' && wr.length > 10) ? wr
      : null
    return {
      roic_reported: n(data.roic_reported),
      roic_tangible: n(data.roic_tangible),
      roic_display: minRoic(n(data.roic_reported), n(data.roic_tangible)),
      roic_warning: warnMsg,
      roic_method: 'Precalculado',
      roic_not_applicable: false,
      nopat: n(data.nopat), invested_capital: n(data.invested_capital),
      invested_capital_tangible: n(data.invested_capital_tangible),
      tax_rate_effective: n(data.tax_rate_effective),
      alternative_label: null, alternative_value: null,
    }
  }

  // Calcular desde estados financieros
  const computed = computeFromStatements(data, currency)
  if (computed) return { ...computed, alternative_label: null, alternative_value: null }

  // Fallback al ROIC legacy
  if (n(data.roic) != null) {
    return { ...blank(), roic_reported: n(data.roic), roic_tangible: n(data.roic), roic_display: n(data.roic), roic_method: 'Legacy' }
  }
  return blank()
}

function blank() {
  return {
    roic_reported: null, roic_tangible: null, roic_display: null, roic_warning: null, roic_method: null,
    roic_not_applicable: false, nopat: null, invested_capital: null,
    invested_capital_tangible: null, tax_rate_effective: null,
    alternative_label: null, alternative_value: null,
  }
}

// Valor para gauge/scoring: el más conservador (MIN reported/tangible), capado a
// 60 para no premiar ROICs imposibles.
export function roicForScoring(data, currency) {
  const r = calculateROIC(data, currency)
  if (r.roic_not_applicable) return null
  const v = r.roic_display
  if (v == null) return null
  return Math.min(v, 60)
}
