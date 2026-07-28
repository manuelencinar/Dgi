// Posicionamiento de una empresa DENTRO de su sector: percentiles de sus métricas frente
// a las de sus comparables. Convierte números sueltos en contexto ("top 12% de ROIC del
// sector"). Puro; recibe los valores de los peers ya cargados (page.js hace el fetch).
const num = v => (v != null && !isNaN(v)) ? Number(v) : null

// Percentil (0-100) del valor dentro del array = % de comparables a los que SUPERA (mejor).
// higherBetter=false invierte (menor es mejor, p.ej. deuda/payout).
export function percentileRank(value, arr, higherBetter = true) {
  const v = num(value)
  if (v == null) return null
  const vals = (arr || []).map(num).filter(x => x != null)
  if (vals.length < 5) return null            // muestra insuficiente → sin percentil
  const better = vals.filter(x => higherBetter ? v > x : v < x).length
  const equal = vals.filter(x => x === v).length
  return Math.round((better + equal / 2) / vals.length * 100)
}

// Métricas comparables por sector (clave en company_fundamentals → cómo se lee/formatea).
// yield se deriva de dps/price (se pasa ya calculado por peer).
const METRICS = [
  { key: 'roic', label: 'ROIC', higherBetter: true, fmt: v => `${v.toFixed(1)}%` },
  { key: 'yield', label: 'Rentabilidad', higherBetter: true, fmt: v => `${v.toFixed(2)}%` },
  { key: 'divCagr', label: 'Crecim. dividendo', higherBetter: true, fmt: v => `${v.toFixed(1)}%` },
  { key: 'revCagr', label: 'Crecim. ingresos', higherBetter: true, fmt: v => `${v.toFixed(1)}%` },
  { key: 'opMargin', label: 'Margen operativo', higherBetter: true, fmt: v => `${v.toFixed(1)}%` },
  { key: 'payout', label: 'Payout', higherBetter: false, fmt: v => `${v.toFixed(0)}%` },
  { key: 'debt', label: 'Deuda/EBITDA', higherBetter: false, fmt: v => `${v.toFixed(1)}×` },
  { key: 'streak', label: 'Racha dividendo', higherBetter: true, fmt: v => `${v.toFixed(0)} años` },
]

// company: {roic, yield, divCagr, ...} de la empresa. peers: [{roic, yield, ...}] del sector.
// Devuelve solo las métricas con dato + percentil calculable.
export function buildSectorPositioning(company, peers, sectorLabel, peerCount) {
  const rows = []
  for (const m of METRICS) {
    const v = num(company[m.key])
    if (v == null) continue
    const pr = percentileRank(v, peers.map(p => p[m.key]), m.higherBetter)
    if (pr == null) continue
    rows.push({ key: m.key, label: m.label, value: v, valueFmt: m.fmt(v), percentile: pr, top: 100 - pr })
  }
  return { sectorLabel: sectorLabel || null, peerCount: peerCount ?? peers.length, metrics: rows }
}
