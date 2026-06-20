// Breakeven del crudo por empresa, estimado por regresión contra el precio medio
// anual del WTI. Dos niveles:
//   · producción: margen neto = 0 → precio al que deja de ganar dinero operando.
//   · capex+dividendo (cash-neutral): CFO − capex total − dividendos = 0 → precio
//     por debajo del cual NO cubre inversión + dividendo y tiene que endeudarse.
// El de capex+dividendo es el relevante para un inversor DGI (Exxon: prod. ~$25
// pero capex+div bastante más alto por su capex de crecimiento). Usa capex TOTAL
// (incluye crecimiento), así que es más conservador que el "breakeven oficial"
// que publican las empresas (solo capex de mantenimiento).
// Solo se usa cuando el ajuste es fiable (R² alto, pendiente correcta).

// Media anual del WTI (USD/barril). Actualizar el año en curso periódicamente.
// Brent ≈ WTI + 4-5 $.
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

// Regresión lineal y = a + b·x sobre puntos [oil, valor%]. Breakeven = x con y=0.
function regress(pts) {
  const n = pts.length
  if (n < 4) return null
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

export function computeOilBreakeven(data) {
  if ((data?.sector || '') !== 'Energy') return null   // solo petróleo y gas
  const is = data?.income_statement_annual
  const cf = data?.cashflow_annual
  const ni  = readRow(is, 'Net Income Common Stockholders', 'Net Income', 'Beneficio Neto')
  const rev = readRow(is, 'Total Revenue', 'Ingresos Totales', 'Operating Revenue')
  const cfo = readRow(cf, 'Operating Cash Flow', 'Cash Flow From Continuing Operating Activities', 'Cash Flow Operativo')
  const cap = readRow(cf, 'Capital Expenditure', 'Capital Expenditure Reported')
  const div = readRow(cf, 'Cash Dividends Paid', 'Common Stock Dividend Paid', 'Dividendos Pagados', 'Dividend Paid Cfo', 'Common Stock Payments')

  const prodPts = [], cashPts = []
  for (const y of Object.keys(rev)) {
    if (!(rev[y] > 0) || WTI_ANNUAL[y] == null) continue
    if (ni[y] != null) prodPts.push([WTI_ANNUAL[y], ni[y] / rev[y] * 100])
    if (cfo[y] != null && cap[y] != null && div[y] != null)
      cashPts.push([WTI_ANNUAL[y], (cfo[y] - Math.abs(cap[y]) - Math.abs(div[y])) / rev[y] * 100])
  }

  const production = regress(prodPts)
  const cashflow = regress(cashPts)
  if (!production && !cashflow) return null
  return { production, cashflow }
}
