// Métricas específicas de banca, calculadas desde los estados financieros ya
// guardados (company_fundamentals.*_annual). Se complementan con valores
// manuales por trimestre (tabla bank_metrics_manual): NPL siempre manual;
// NIM/ROTE/eficiencia con override manual cuando el cálculo no es fiable.
//
// Se EXCLUYEN para banca: EBITDA, FCF, ROIC (no aplican).

// Lee una línea del estado (data[label] = array alineado con columns) → {año: valor}.
function readRow(stmt, ...labels) {
  const d = stmt?.data, cols = stmt?.columns
  if (!d || !Array.isArray(cols)) return {}
  let arr = null
  for (const l of labels) { if (Array.isArray(d[l])) { arr = d[l]; break } }
  if (!arr) return {}
  const out = {}
  cols.forEach((c, i) => {
    const y = parseInt(String(c).slice(0, 4), 10)
    const v = arr[i]
    if (!isNaN(y) && v != null && !isNaN(v)) out[y] = Number(v)
  })
  return out
}
function lastYear(...maps) {
  const ys = new Set()
  maps.forEach(m => Object.keys(m || {}).forEach(y => { const n = Number(y); if (!isNaN(n)) ys.add(n) }))
  return [...ys].sort((a, b) => b - a)[0] ?? null
}
// Último año en el que TODOS los mapas tienen valor.
function lastCommonYear(...maps) {
  const years = Object.keys(maps[0] || {}).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a)
  for (const y of years) if (maps.every(m => m && m[y] != null)) return y
  return null
}
function lastVal(map) { const y = lastYear(map); return y != null ? map[y] : null }
function cagr5(map) {
  const ys = Object.keys(map).map(Number).filter(y => !isNaN(y) && map[y] > 0).sort((a, b) => a - b)
  if (ys.length < 2) return null
  const yE = ys[ys.length - 1], yS = ys[Math.max(0, ys.length - 6)], n = yE - yS
  return (n > 0 && map[yS] > 0) ? (Math.pow(map[yE] / map[yS], 1 / n) - 1) * 100 : null
}

// Métricas calculadas (sin manual). Devuelve null en las no calculables.
export function computeBankMetrics(data) {
  const is = data?.income_statement_annual
  const bs = data?.balance_sheet_annual

  const eps    = readRow(is, 'Diluted EPS', 'BPA Diluido')
  const nii    = readRow(is, 'Net Interest Income')
  const ta     = readRow(bs, 'Total Assets', 'Activos Totales')
  const ni     = readRow(is, 'Net Income Common Stockholders', 'Net Income', 'Beneficio Neto')
  const tbv    = readRow(bs, 'Tangible Book Value', 'Net Tangible Assets')
  const eq     = readRow(bs, 'Common Stock Equity', 'Stockholders Equity', 'Total Equity Gross Minority Interest', 'Patrimonio Neto')
  const gw     = readRow(bs, 'Goodwill')
  const intang = readRow(bs, 'Other Intangible Assets')
  const rev    = readRow(is, 'Total Revenue', 'Ingresos Totales', 'Operating Revenue')
  const opex   = readRow(is, 'Operating Expense', 'Selling General And Administration')

  // NIM proxy = Ingresos netos por intereses / Activos totales
  const yNim = lastCommonYear(nii, ta)
  const nim = yNim != null && ta[yNim] ? nii[yNim] / ta[yNim] * 100 : null

  // ROTE = Beneficio neto / Patrimonio tangible (TBV de Yahoo, o equity - goodwill - intangibles)
  let rote = null, rh = {}
  for (const y of Object.keys(ni).map(Number).sort((a, b) => b - a)) {
    let te = tbv[y] != null ? tbv[y] : (eq[y] != null ? eq[y] - (gw[y] || 0) - (intang[y] || 0) : null)
    if (te != null && te > 0) { const v = ni[y] / te * 100; if (rote == null) rote = v; rh[y] = v }
  }

  // Ratio de eficiencia = Costes operativos / Ingresos netos bancarios (Total Revenue)
  const yEff = lastCommonYear(opex, rev)
  const efficiency = yEff != null && rev[yEff] > 0 ? Math.abs(opex[yEff]) / rev[yEff] * 100 : null

  return {
    epsDiluted: lastVal(eps),
    epsCagr5:   cagr5(eps),
    nim, rote, efficiency,
  }
}

// Ordena periodos 'YYYYQn' descendente (orden lexicográfico = cronológico).
function byPeriodDesc(a, b) { return (b.period || '').localeCompare(a.period || '') }
const numOr = (a, b) => (a != null && !isNaN(a)) ? Number(a) : (b != null ? b : null)

// Combina lo calculado con los valores manuales (NPL + overrides). El valor
// manual del trimestre más reciente tiene prioridad.
export function effectiveBankMetrics(computed, manualRows = []) {
  const rows = (manualRows || []).slice().sort(byPeriodDesc)
  const latest = rows[0] || {}
  const nplRows = rows.filter(r => r.npl != null).sort((a, b) => (a.period || '').localeCompare(b.period || ''))
  const lastNpl = nplRows.length ? nplRows[nplRows.length - 1] : null
  return {
    epsDiluted: computed?.epsDiluted ?? null,
    epsCagr5:   computed?.epsCagr5 ?? null,
    nim:        numOr(latest.nim, computed?.nim),
    rote:       numOr(latest.rote, computed?.rote),
    efficiency: numOr(latest.efficiency, computed?.efficiency),
    // NPL: SOLO manual. Si no hay, null → la UI muestra "-" (nunca 0).
    npl:        lastNpl ? Number(lastNpl.npl) : null,
    nplPeriod:  lastNpl ? lastNpl.period : null,
    nplHistory: nplRows.map(r => ({ period: r.period, value: Number(r.npl) })),
  }
}
