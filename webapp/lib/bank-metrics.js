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
  let rote = null
  const roteS = {}
  for (const y of Object.keys(ni).map(Number).sort((a, b) => b - a)) {
    let te = tbv[y] != null ? tbv[y] : (eq[y] != null ? eq[y] - (gw[y] || 0) - (intang[y] || 0) : null)
    if (te != null && te > 0) { const v = ni[y] / te * 100; if (rote == null) rote = v; roteS[y] = v }
  }

  // Series por año (para mostrar el cambio a 1 y 3 años).
  const nimS = {}
  for (const y of Object.keys(nii)) if (ta[y]) nimS[y] = nii[y] / ta[y] * 100
  const effS = {}
  for (const y of Object.keys(opex)) if (rev[y] > 0) effS[y] = Math.abs(opex[y]) / rev[y] * 100

  // Ratio de eficiencia = Costes operativos / Ingresos netos bancarios (Total Revenue)
  const yEff = lastCommonYear(opex, rev)
  const efficiency = yEff != null && rev[yEff] > 0 ? Math.abs(opex[yEff]) / rev[yEff] * 100 : null

  // Payout sobre beneficio NORMALIZADO a 5 años (suaviza provisiones puntuales).
  const niYears = Object.keys(ni).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a).slice(0, 5)
  const avgNI5 = niYears.length >= 3 ? niYears.reduce((s, y) => s + ni[y], 0) / niYears.length : null
  let shares = lastVal(readRow(is, 'Diluted Average Shares', 'Basic Average Shares'))
  if (!(shares > 0)) shares = lastVal(readRow(bs, 'Ordinary Shares Number', 'Share Issued'))
  const dps = data?.dps != null ? Number(data.dps) : null
  const payoutNorm = (avgNI5 > 0 && shares > 0 && dps != null) ? (dps * shares) / avgNI5 * 100 : null

  return {
    epsDiluted: lastVal(eps),
    epsCagr5:   cagr5(eps),
    nim, rote, efficiency, payoutNorm,
    series: { nim: nimS, rote: roteS, efficiency: effS, eps: { ...eps } },
  }
}

// Cambio en PUNTOS porcentuales entre el último año y `back` años antes.
function ppDelta(series, back) {
  if (!series) return null
  const ys = Object.keys(series).map(Number).sort((a, b) => b - a)
  if (!ys.length) return null
  const last = ys[0], target = last - back
  return (series[last] != null && series[target] != null) ? series[last] - series[target] : null
}
// Cambio porcentual (para magnitudes como el BPA).
function pctDelta(series, back) {
  if (!series) return null
  const ys = Object.keys(series).map(Number).sort((a, b) => b - a)
  if (!ys.length) return null
  const last = ys[0], target = last - back
  return (series[last] != null && series[target] != null && series[target] !== 0)
    ? (series[last] - series[target]) / Math.abs(series[target]) * 100 : null
}
// Cambio del NPL desde el histórico manual trimestral (mismo trimestre N años antes).
function nplDelta(history, back) {
  if (!history?.length) return null
  const last = history[history.length - 1]
  const m = /^(\d{4})Q([1-4])$/.exec(last.period || '')
  if (!m) return null
  const target = `${Number(m[1]) - back}Q${m[2]}`
  const prev = history.find(h => h.period === target)
  return prev ? last.value - prev.value : null
}

// Ordena periodos 'YYYYQn' descendente (orden lexicográfico = cronológico).
function byPeriodDesc(a, b) { return (b.period || '').localeCompare(a.period || '') }
const numOr = (a, b) => (a != null && !isNaN(a)) ? Number(a) : (b != null ? b : null)

// Combina lo calculado con los valores manuales (NPL + overrides). El valor
// manual del trimestre más reciente tiene prioridad.
export function effectiveBankMetrics(computed, manualRows = []) {
  const rows = (manualRows || []).slice().sort(byPeriodDesc)
  const latest = rows[0] || {}
  const histOf = (k) => rows.filter(r => r[k] != null).map(r => ({ period: r.period, value: Number(r[k]) }))
    .sort((a, b) => (a.period || '').localeCompare(b.period || ''))
  const nplHistory = histOf('npl')
  const cet1History = histOf('cet1')
  const lastNpl = nplHistory.length ? nplHistory[nplHistory.length - 1] : null
  const lastCet1 = cet1History.length ? cet1History[cet1History.length - 1] : null
  const s = computed?.series || {}
  return {
    epsDiluted: computed?.epsDiluted ?? null,
    epsCagr5:   computed?.epsCagr5 ?? null,
    nim:        numOr(latest.nim, computed?.nim),
    rote:       numOr(latest.rote, computed?.rote),
    efficiency: numOr(latest.efficiency, computed?.efficiency),
    payoutNorm: computed?.payoutNorm ?? null,
    // NPL y CET1: SOLO manuales. Si no hay, null → la UI muestra "–" (nunca 0).
    npl:        lastNpl ? lastNpl.value : null,
    nplPeriod:  lastNpl ? lastNpl.period : null,
    nplHistory,
    cet1:       lastCet1 ? lastCet1.value : null,
    cet1Period: lastCet1 ? lastCet1.period : null,
    cet1History,
    // Cambio en el último año y en los 3 últimos (puntos porcentuales; BPA en %).
    changes: {
      rote:       { d1: ppDelta(s.rote, 1), d3: ppDelta(s.rote, 3) },
      nim:        { d1: ppDelta(s.nim, 1), d3: ppDelta(s.nim, 3) },
      efficiency: { d1: ppDelta(s.efficiency, 1), d3: ppDelta(s.efficiency, 3) },
      eps:        { d1: pctDelta(s.eps, 1), d3: pctDelta(s.eps, 3), pct: true },
      npl:        { d1: nplDelta(nplHistory, 1), d3: nplDelta(nplHistory, 3) },
      cet1:       { d1: nplDelta(cet1History, 1), d3: nplDelta(cet1History, 3) },
    },
  }
}
