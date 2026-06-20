// Breakeven del crudo por empresa, estimado por regresión: margen neto anual vs
// precio medio del WTI de ese año. Despejando margen=0 sale el precio de crudo a
// partir del cual la empresa gana dinero. Funciona en las claramente sensibles
// al crudo (E&P / integradas puras); en las diversificadas el ajuste es malo, por
// eso solo se usa cuando el R² es alto (modelo fiable).

// Media anual del WTI (USD/barril). Actualizar el año en curso periódicamente.
const WTI_ANNUAL = {
  2016: 43.3, 2017: 50.9, 2018: 64.9, 2019: 57.0, 2020: 39.2,
  2021: 68.0, 2022: 94.9, 2023: 77.6, 2024: 75.8, 2025: 70.0,
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

// Devuelve { slope (pp de margen por $), r2, breakeven ($), reliable, points } o null.
export function computeOilBreakeven(data) {
  if ((data?.sector || '') !== 'Energy') return null   // solo petróleo y gas
  const is = data?.income_statement_annual
  const ni = readRow(is, 'Net Income Common Stockholders', 'Net Income', 'Beneficio Neto')
  const rev = readRow(is, 'Total Revenue', 'Ingresos Totales', 'Operating Revenue')
  const pts = []
  for (const y of Object.keys(ni)) if (rev[y] > 0 && WTI_ANNUAL[y] != null) pts.push([WTI_ANNUAL[y], ni[y] / rev[y] * 100])
  if (pts.length < 4) return null

  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  let num = 0, den = 0, sst = 0
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; sst += (y - my) ** 2 }
  if (den === 0) return null
  const slope = num / den
  const intercept = my - slope * mx
  let ssr = 0
  for (const [x, y] of pts) { const yh = intercept + slope * x; ssr += (y - yh) ** 2 }
  const r2 = sst > 0 ? 1 - ssr / sst : 0
  const breakeven = slope !== 0 ? -intercept / slope : null

  const reliable = slope > 0 && r2 >= 0.7 && breakeven != null && breakeven > 0 && breakeven < 150
  return { slope, r2, breakeven, reliable, points: n }
}
