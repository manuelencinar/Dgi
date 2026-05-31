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

// Cálculo desde estados financieros (mismo algoritmo que el script Python)
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

  const revenue = row(is, ['Ingresos Totales', 'Total Revenue', 'Total Revenues']) || 0
  const cash = row(bs, ['Caja y Equivalentes', 'Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments']) || 0
  const excessCash = Math.max(0, cash - 0.02 * revenue)

  const currentLiab = row(bs, ['Pasivo Corriente', 'Current Liabilities', 'Total Current Liabilities'])
  const shortDebt   = row(bs, ['Current Debt', 'Short Long Term Debt', 'Current Debt And Capital Lease Obligation'])
  let nonFinLiab = 0
  if (currentLiab != null) nonFinLiab = shortDebt != null ? currentLiab - shortDebt : currentLiab * 0.60

  let investedCapital = totalAssets - excessCash - nonFinLiab

  // Ajuste 2 — capital invertido negativo
  if (investedCapital < 0) {
    return {
      roic_reported: null, roic_tangible: null, roic_warning: null,
      roic_method: 'N/A — balance atípico', roic_not_applicable: false,
      nopat: Math.round(nopat), invested_capital: Math.round(investedCapital),
      invested_capital_tangible: null, tax_rate_effective: Math.round(taxRate * 1000) / 1000,
    }
  }

  // Ajuste 1 — capital invertido mínimo 10% de activos
  let adjusted = false
  const floor = 0.10 * totalAssets
  if (investedCapital < floor) { investedCapital = floor; adjusted = true }

  const roicReported = nopat / investedCapital * 100

  // Capital invertido tangible (sin goodwill ni intangibles)
  let gw = row(bs, ['Fondo de Comercio', 'Goodwill'])
  let intang = row(bs, ['Other Intangible Assets', 'Otros Intangibles'])
  if (gw == null && intang == null) {
    const combined = row(bs, ['Fondo de Comercio e Intangibles', 'Goodwill And Other Intangible Assets'])
    gw = combined || 0; intang = 0
  }
  gw = gw || 0; intang = intang || 0

  let icTangible = investedCapital - gw - intang
  if (icTangible < floor) icTangible = floor
  const roicTangible = nopat / icTangible * 100

  let warning = null
  if (roicReported > 60 || roicTangible > 60) warning = HIGH_WARNING
  if (Math.abs(roicReported - roicTangible) > 10) warning = warning ? warning + ' ' + ADQ_WARNING : ADQ_WARNING

  return {
    roic_reported: Math.round(roicReported * 10) / 10,
    roic_tangible: Math.round(roicTangible * 10) / 10,
    roic_warning: warning,
    roic_method: adjusted ? ATYP_NOTE : 'Capital invertido = activos − caja excedente − pasivos no financieros',
    roic_not_applicable: false,
    nopat: Math.round(nopat),
    invested_capital: Math.round(investedCapital),
    invested_capital_tangible: Math.round(icTangible),
    tax_rate_effective: Math.round(taxRate * 1000) / 1000,
  }
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
    return {
      roic_reported: n(data.roic_reported),
      roic_tangible: n(data.roic_tangible),
      roic_warning: data.roic_warning ?? null,
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
    return { ...blank(), roic_reported: n(data.roic), roic_tangible: n(data.roic), roic_method: 'Legacy' }
  }
  return blank()
}

function blank() {
  return {
    roic_reported: null, roic_tangible: null, roic_warning: null, roic_method: null,
    roic_not_applicable: false, nopat: null, invested_capital: null,
    invested_capital_tangible: null, tax_rate_effective: null,
    alternative_label: null, alternative_value: null,
  }
}

// Valor preferido para gauge/scoring: tangible > reported
export function roicForScoring(data, currency) {
  const r = calculateROIC(data, currency)
  if (r.roic_not_applicable) return null
  return r.roic_tangible != null ? r.roic_tangible : r.roic_reported
}
