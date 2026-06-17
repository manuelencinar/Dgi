// Métricas de aseguradoras, calculadas desde los estados financieros guardados
// + valores manuales por trimestre (insurer_metrics_manual).
//
// Se EXCLUYEN para aseguradoras: margen sobre ingresos, EBITDA, FCF, ROIC.
// Manuales (críticas): combined ratio, loss ratio, expense ratio, solvencia.
// Calculadas: investment yield (NII/Inversiones), GWP (≈Revenue) + CAGR, ROTE.

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
function lastVal(map) { const ys = Object.keys(map).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a); return ys.length ? map[ys[0]] : null }
function lastCommonYear(...maps) {
  const years = Object.keys(maps[0] || {}).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a)
  for (const y of years) if (maps.every(m => m && m[y] != null)) return y
  return null
}
function cagr5(map) {
  const ys = Object.keys(map).map(Number).filter(y => !isNaN(y) && map[y] > 0).sort((a, b) => a - b)
  if (ys.length < 2) return null
  const yE = ys[ys.length - 1], yS = ys[Math.max(0, ys.length - 6)], n = yE - yS
  return (n > 0 && map[yS] > 0) ? (Math.pow(map[yE] / map[yS], 1 / n) - 1) * 100 : null
}
function ppDelta(series, back) {
  if (!series) return null
  const ys = Object.keys(series).map(Number).sort((a, b) => b - a)
  if (!ys.length) return null
  const last = ys[0], t = last - back
  return (series[last] != null && series[t] != null) ? series[last] - series[t] : null
}
function pctDelta(series, back) {
  if (!series) return null
  const ys = Object.keys(series).map(Number).sort((a, b) => b - a)
  if (!ys.length) return null
  const last = ys[0], t = last - back
  return (series[last] != null && series[t] != null && series[t] !== 0) ? (series[last] - series[t]) / Math.abs(series[t]) * 100 : null
}
// Delta de una métrica manual trimestral: mismo trimestre N años antes.
function histDelta(history, back) {
  if (!history?.length) return null
  const last = history[history.length - 1]
  const m = /^(\d{4})Q([1-4])$/.exec(last.period || '')
  if (!m) return null
  const prev = history.find(h => h.period === `${Number(m[1]) - back}Q${m[2]}`)
  return prev ? last.value - prev.value : null
}

export function computeInsurerMetrics(data) {
  const is = data?.income_statement_annual
  const bs = data?.balance_sheet_annual

  const nii = readRow(is, 'Net Interest Income', 'Interest Income')
  const inv = readRow(bs, 'Investmentin Financial Assets', 'Investments And Advances')
  const gwpMap = readRow(is, 'Total Revenue', 'Operating Revenue', 'Ingresos Totales')
  const ni = readRow(is, 'Net Income Common Stockholders', 'Net Income', 'Net Income Continuous Operations', 'Beneficio Neto')
  const tbv = readRow(bs, 'Tangible Book Value', 'Net Tangible Assets')
  const eq = readRow(bs, 'Common Stock Equity', 'Stockholders Equity', 'Total Equity Gross Minority Interest', 'Patrimonio Neto')
  const gw = readRow(bs, 'Goodwill')
  const intang = readRow(bs, 'Other Intangible Assets')

  // Investment yield = ingresos por inversiones / inversiones financieras.
  // Yahoo desglosa las inversiones de forma inconsistente entre aseguradoras →
  // si el resultado sale fuera de un rango razonable (0–10%), se descarta
  // (null → "–", se puede fijar con override manual).
  const sane = v => (v != null && v > 0 && v <= 10) ? v : null
  const iyS = {}
  for (const y of Object.keys(nii)) if (inv[y] > 0) { const v = sane(nii[y] / inv[y] * 100); if (v != null) iyS[y] = v }
  const yIy = lastCommonYear(nii, inv)
  const investmentYield = yIy != null && inv[yIy] > 0 ? sane(nii[yIy] / inv[yIy] * 100) : null

  // ROTE = Beneficio neto / patrimonio tangible
  let rote = null
  const roteS = {}
  for (const y of Object.keys(ni).map(Number).sort((a, b) => b - a)) {
    const te = tbv[y] != null ? tbv[y] : (eq[y] != null ? eq[y] - (gw[y] || 0) - (intang[y] || 0) : null)
    if (te != null && te > 0) { const v = ni[y] / te * 100; if (rote == null) rote = v; roteS[y] = v }
  }

  return {
    investmentYield,
    gwp: lastVal(gwpMap),
    gwpCagr5: cagr5(gwpMap),
    rote,
    series: { iy: iyS, gwp: { ...gwpMap }, rote: roteS },
  }
}

function byPeriodDesc(a, b) { return (b.period || '').localeCompare(a.period || '') }
const numOr = (a, b) => (a != null && !isNaN(a)) ? Number(a) : (b != null ? b : null)

export function effectiveInsurerMetrics(computed, manualRows = []) {
  const rows = (manualRows || []).slice().sort(byPeriodDesc)
  const latest = rows[0] || {}
  const s = computed?.series || {}
  // Histórico trimestral de cada métrica manual (asc) para el último valor + deltas.
  const histOf = (k) => rows.filter(r => r[k] != null).map(r => ({ period: r.period, value: Number(r[k]) }))
    .sort((a, b) => (a.period || '').localeCompare(b.period || ''))
  const last = (hist) => hist.length ? hist[hist.length - 1] : null
  const combinedH = histOf('combined'), lossH = histOf('loss'), expenseH = histOf('expense'), solvencyH = histOf('solvency')
  const lc = last(combinedH), ll = last(lossH), le = last(expenseH), ls = last(solvencyH)

  return {
    investmentYield: numOr(latest.iy, computed?.investmentYield),
    gwp:      computed?.gwp ?? null,
    gwpCagr5: computed?.gwpCagr5 ?? null,
    rote:     numOr(latest.rote, computed?.rote),
    // Manuales (null → la UI muestra "–"):
    combined: lc ? lc.value : null, combinedPeriod: lc ? lc.period : null,
    loss:     ll ? ll.value : null,
    expense:  le ? le.value : null,
    solvency: ls ? ls.value : null, solvencyPeriod: ls ? ls.period : null,
    // Históricos trimestrales para los gráficos.
    solvencyHistory: solvencyH, lossHistory: lossH, combinedHistory: combinedH,
    changes: {
      investmentYield: { d1: ppDelta(s.iy, 1), d3: ppDelta(s.iy, 3) },
      rote: { d1: ppDelta(s.rote, 1), d3: ppDelta(s.rote, 3) },
      gwp:  { d1: pctDelta(s.gwp, 1), d3: pctDelta(s.gwp, 3), pct: true },
      combined: { d1: histDelta(combinedH, 1), d3: histDelta(combinedH, 3) },
      loss:     { d1: histDelta(lossH, 1), d3: histDelta(lossH, 3) },
      expense:  { d1: histDelta(expenseH, 1), d3: histDelta(expenseH, 3) },
      solvency: { d1: histDelta(solvencyH, 1), d3: histDelta(solvencyH, 3) },
    },
  }
}
