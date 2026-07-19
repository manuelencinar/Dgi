// Lógica pura del Calendario de compras. Reutiliza toEUR/weightedAvgCost de portfolio
// para construir posiciones HIPOTÉTICAS (actuales + entradas del plan) que luego se
// pasan por enrichPositions + calc* (concentración/sectores/país) — sin duplicar cálculos.
import { toEUR, weightedAvgCost } from '@/lib/portfolio'

// Punto medio del rango de entrada (o el extremo disponible).
export function entryMidPrice(e) {
  const lo = Number(e.price_min), hi = Number(e.price_max)
  if (lo > 0 && hi > 0) return (lo + hi) / 2
  if (lo > 0) return lo
  if (hi > 0) return hi
  return null
}

// Nº de acciones estimado de una entrada: directo (shares) o derivado del importe y el
// precio medio (amount_eur / precio_medio_en_EUR).
export function entryShares(e) {
  if (Number(e.shares) > 0) return Number(e.shares)
  const mid = entryMidPrice(e), amt = Number(e.amount_eur)
  if (amt > 0 && mid > 0) {
    const midEUR = toEUR(mid, e.currency || 'EUR')
    return midEUR > 0 ? amt / midEUR : 0
  }
  return 0
}

// Coste estimado de la entrada en EUR (importe directo o acciones × precio medio).
export function entryCostEUR(e) {
  if (Number(e.amount_eur) > 0) return Number(e.amount_eur)
  const sh = entryShares(e), mid = entryMidPrice(e)
  return (sh > 0 && mid > 0) ? toEUR(mid * sh, e.currency || 'EUR') : 0
}

// Aplica una lista de entradas (ya filtradas por estado/horizonte, en orden de fecha)
// sobre las posiciones actuales → posiciones "crudas" para enrichPositions:
// { ticker, shares, avg_cost, currency, asset_type }. Fusiona por ticker con precio
// medio ponderado; abre posición nueva si el ticker no existe.
export function buildHypotheticalPositions(positions, entries) {
  const byTicker = {}
  for (const p of positions || []) byTicker[p.ticker] = { ...p }
  for (const e of entries || []) {
    const sh = entryShares(e); if (!(sh > 0)) continue
    const mid = entryMidPrice(e); if (!(mid > 0)) continue
    const prev = byTicker[e.ticker]
    if (prev) {
      const s0 = Number(prev.shares) || 0, c0 = Number(prev.avg_cost) || 0
      byTicker[e.ticker] = { ...prev, shares: s0 + sh, avg_cost: weightedAvgCost(s0, c0, sh, mid) }
    } else {
      byTicker[e.ticker] = { ticker: e.ticker, shares: sh, avg_cost: mid, currency: e.currency || 'EUR', asset_type: 'stock' }
    }
  }
  return Object.values(byTicker)
}

// Entradas pendientes cuya fecha objetivo cae dentro del horizonte (meses desde hoy).
// Sin fecha → se incluyen siempre (aportación sin planificar mes). Ordenadas por fecha.
export function entriesWithinHorizon(entries, horizonMonths, today = new Date()) {
  const limit = new Date(today); limit.setMonth(limit.getMonth() + horizonMonths)
  const limitStr = limit.toISOString().slice(0, 10)
  return (entries || [])
    .filter(e => e.status === 'pending')
    .filter(e => !e.target_date || e.target_date <= limitStr)
    .sort((a, b) => (a.target_date || '9999').localeCompare(b.target_date || '9999'))
}

// Meses transcurridos desde que se abrió la ÚLTIMA posición nueva (primera compra de un
// ticker). null si no hay compras. Para el aviso "llevas X meses sin abrir posición nueva".
export function monthsSinceNewPosition(transactions, today = new Date()) {
  const firstByTicker = {}
  for (const t of transactions || []) {
    if (t.type === 'sell' || !t.date) continue
    if (!firstByTicker[t.ticker] || t.date < firstByTicker[t.ticker]) firstByTicker[t.ticker] = t.date
  }
  const firsts = Object.values(firstByTicker).map(d => new Date(d + 'T00:00:00')).filter(d => !isNaN(d))
  if (!firsts.length) return null
  const lastNew = new Date(Math.max(...firsts.map(d => d.getTime())))
  return Math.max(0, Math.floor((today - lastNew) / (30.44 * 86400000)))
}

// % de una posición sobre el valor total de la cartera.
export function positionWeights(enriched) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return []
  return enriched
    .map(p => ({ ticker: p.ticker, name: p.name, sector: p.sector, pct: (p.valueEUR ?? 0) / total * 100 }))
    .sort((a, b) => b.pct - a.pct)
}

// Encaje con la banda de equiponderación objetivo [lo, hi] (ej. 4-6%).
// Devuelve 'under' | 'ok' | 'over' por posición.
export function equalWeightFit(pct, lo = 4, hi = 6) {
  if (pct < lo) return 'under'
  if (pct > hi) return 'over'
  return 'ok'
}
