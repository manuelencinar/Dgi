// Métricas de REITs desde los estados de Yahoo. En REITs la amortización de
// inmuebles destruye el beneficio contable → el payout sobre EPS engaña
// (Realty Income ~280% EPS pero ~75% AFFO). Se usa FFO/AFFO (definición NAREIT):
//   FFO  = Beneficio neto + Amortización inmobiliaria + deterioros (impairments)
//   NOI  ≈ Resultado operativo + Amortización (proxy, ≈EBITDA)
//   AFFO = FFO − capex de mantenimiento (= NOI × % según sub-tipo, manual)
// Los deterioros de activos (impairments) son cargos NO monetarios que hunden el
// beneficio GAAP pero deben sumarse de vuelta al FFO. Omitirlos lo infravalora:
// Realty Income 2025 sin ajustar = $3,93/acc; con los $471M de impairment = $4,45.
// Las acciones son la media DILUIDA PONDERADA (no las de fin de año), que es la
// que exige la norma contable y la que la empresa usa en su FFO reportado.

// % de capex de mantenimiento sobre NOI por sub-tipo (punto medio de los rangos).
export const REIT_SUBTYPES = {
  netlease:    { label: 'Net Lease (triple neto)', maint: 2 },
  lodging:     { label: 'Hoteles',                 maint: 31 },
  office:      { label: 'Oficinas',                maint: 27.5 },
  retail:      { label: 'Centros comerciales',     maint: 18.5 },
  residential: { label: 'Residencial',             maint: 12.5 },
  industrial:  { label: 'Logístico / Industrial',  maint: 7.5 },
  selfstorage: { label: 'Self-Storage',            maint: 6.5 },
  datatowers:  { label: 'Data Centers / Torres',   maint: 6 },
  healthcare:  { label: 'Salud',                   maint: 17 },
  diversified: { label: 'Diversificado',           maint: 12 },
}
export const REIT_SUBTYPE_ORDER = Object.keys(REIT_SUBTYPES)

// Adivina el sub-tipo desde la industria de Yahoo (corrígelo a mano, sobre todo
// los net-lease, que Yahoo etiqueta como "Retail" o "Diversified").
export function defaultReitSubtype(industry) {
  const i = (industry || '').toLowerCase()
  if (i.includes('hotel') || i.includes('motel') || i.includes('lodging')) return 'lodging'
  if (i.includes('office')) return 'office'
  if (i.includes('residential') || i.includes('apartment')) return 'residential'
  if (i.includes('industrial')) return 'industrial'
  if (i.includes('healthcare') || i.includes('health care')) return 'healthcare'
  if (i.includes('retail')) return 'retail'
  if (i.includes('diversif')) return 'diversified'
  if (i.includes('specialty')) return 'datatowers'
  return 'diversified'
}

function readRow(stmt, ...labels) {
  const d = stmt?.data, cols = stmt?.columns
  if (!d || !Array.isArray(cols)) return {}
  let arr = null
  for (const l of labels) { if (Array.isArray(d[l])) { arr = d[l]; break } }
  if (!arr) return {}
  const out = {}
  cols.forEach((c, i) => { const y = parseInt(String(c).slice(0, 4), 10); const v = arr[i]; if (!isNaN(y) && v != null && !isNaN(v)) out[y] = Number(v) })
  return out
}
function lastVal(map) { const ys = Object.keys(map).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a); return ys.length ? map[ys[0]] : null }
function cagr5(map) {
  const ys = Object.keys(map).map(Number).filter(y => !isNaN(y) && map[y] > 0).sort((a, b) => a - b)
  if (ys.length < 2) return null
  const yE = ys[ys.length - 1], yS = ys[Math.max(0, ys.length - 6)], n = yE - yS
  return (n > 0 && map[yS] > 0) ? (Math.pow(map[yE] / map[yS], 1 / n) - 1) * 100 : null
}

// Calcula las métricas de REIT. Devuelve null si no es real estate / sin D&A.
export function buildReitMetrics(data, manualRow = null) {
  const s = (data?.sector || '').toLowerCase()
  if (s && s !== 'real estate' && s !== 'inmobiliario' && (data?.type || '') !== 'reit') return null

  const is = data?.income_statement_annual
  const cf = data?.cashflow_annual
  const ni = readRow(is, 'Net Income Common Stockholders', 'Net Income', 'Beneficio Neto')
  let da = readRow(cf, 'Depreciation And Amortization', 'Depreciation Amortization Depletion', 'Depreciation')
  if (!Object.keys(da).length) da = readRow(is, 'Depreciation And Amortization In Income Statement', 'Reconciled Depreciation', 'Depreciation Amortization Depletion Income Statement')
  if (!Object.keys(da).length) return null   // sin amortización → no es un REIT clásico
  const oi = readRow(is, 'Operating Income', 'EBIT', 'Total Operating Income As Reported')
  // Deterioros de activos (cargo no monetario) → se suman de vuelta al FFO (NAREIT).
  let imp = readRow(cf, 'Asset Impairment Charge', 'Impairment Of Capital Assets')
  if (!Object.keys(imp).length) imp = readRow(is, 'Impairment Of Capital Assets')

  const ffoS = {}, noiS = {}
  for (const y of Object.keys(ni)) if (da[y] != null) ffoS[y] = ni[y] + da[y] + Math.abs(imp[y] || 0)
  for (const y of Object.keys(oi)) if (da[y] != null) noiS[y] = oi[y] + da[y]

  const subtype = manualRow?.subtype && REIT_SUBTYPES[manualRow.subtype] ? manualRow.subtype : defaultReitSubtype(data?.industry)
  const maintPct = manualRow?.maint_pct != null ? Number(manualRow.maint_pct) : (REIT_SUBTYPES[subtype]?.maint ?? 12)

  let shares = lastVal(readRow(is, 'Diluted Average Shares', 'Basic Average Shares'))
  const bs = data?.balance_sheet_annual
  if (!(shares > 0)) shares = lastVal(readRow(bs, 'Ordinary Shares Number', 'Share Issued'))
  const price = data?.current_price != null ? Number(data.current_price) : null
  const dps = data?.dps != null ? Number(data.dps) : null

  const ffo = lastVal(ffoS)
  const noi = lastVal(noiS)
  const maintCapex = noi != null ? noi * maintPct / 100 : null
  const affo = (ffo != null && maintCapex != null) ? ffo - maintCapex : null
  const mcap = (price > 0 && shares > 0) ? price * shares : null

  return {
    subtype, subtypeLabel: REIT_SUBTYPES[subtype]?.label || subtype, maintPct,
    ffo, affo, noi,
    ffoPerShare: ffo != null && shares > 0 ? ffo / shares : null,
    affoPerShare: affo != null && shares > 0 ? affo / shares : null,
    ffoCagr5: cagr5(ffoS),
    pFfo: (mcap != null && ffo > 0) ? mcap / ffo : null,
    pAffo: (mcap != null && affo > 0) ? mcap / affo : null,
    payoutFfo: (ffo > 0 && shares > 0 && dps != null) ? (dps * shares) / ffo * 100 : null,
    payoutAffo: (affo > 0 && shares > 0 && dps != null) ? (dps * shares) / affo * 100 : null,
  }
}
