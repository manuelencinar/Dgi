// "¿Está mejorando o empeorando?" — resume las tendencias de calidad ya calculadas
// (bonificaciones por tendencia positiva: ROIC, márgenes, deuda, FCF, dividendo, caja) +
// la evolución del Score DGI. Puro. Las bonificaciones solo marcan mejoras sostenidas
// (valor > 0 = mejorando; 0 = estable, no implica empeorar).
const num = v => (v != null && !isNaN(v)) ? Number(v) : null

const DIMS = [
  { key: 'bonus_roic_trend', label: 'Rentabilidad del capital (ROIC)' },
  { key: 'bonus_margin_trend', label: 'Márgenes' },
  { key: 'bonus_debt_reduction', label: 'Reducción de deuda' },
  { key: 'bonus_fcf_growth', label: 'Flujo de caja libre' },
  { key: 'bonus_div_acceleration', label: 'Aceleración del dividendo' },
  { key: 'bonus_net_cash', label: 'Posición de caja neta' },
]

// detail: fila de company_fundamentals (con las columnas bonus_*). scoreHistory: [{date,score}].
export function buildQualityTrend(detail, scoreHistory) {
  const dims = DIMS.map(d => {
    const v = num(detail?.[d.key])
    return { label: d.label, dir: (v != null && v > 0) ? 'up' : 'flat' }
  })

  // Evolución del Score DGI (primer vs último punto del histórico).
  let scoreDelta = null, scoreDir = 'flat'
  const sh = (scoreHistory || []).filter(p => p && p.score != null)
  if (sh.length >= 2) {
    scoreDelta = Math.round((sh[sh.length - 1].score - sh[0].score) * 10) / 10
    scoreDir = scoreDelta > 0.05 ? 'up' : scoreDelta < -0.05 ? 'down' : 'flat'
  }

  const improving = dims.filter(d => d.dir === 'up').length
  return { dims, improving, total: dims.length, scoreDelta, scoreDir, weeks: sh.length }
}
