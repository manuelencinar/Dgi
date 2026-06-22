// Métodos de valoración complementarios al DCF sector-aware. Todos devuelven, donde
// aplica, { value, mos } (valor justo por acción y margen de seguridad vs precio).
import { dcfProjection } from '@/lib/valuation'

const mos = (value, price) => (value != null && price > 0) ? (value - price) / price : null

// 1. Reversión de yield: valor = dividendo actual / yield medio histórico.
//    Si la empresa rinde por encima de su media, implica recorrido al alza.
export function yieldReversionValue(dps, yieldAvgPct, price) {
  if (!(dps > 0) || !(yieldAvgPct > 0) || !(price > 0)) return null
  const value = dps / (yieldAvgPct / 100)
  return { value, mos: mos(value, price) }
}

// 2. DDM bietápico: 5 años creciendo a g1 (capado), luego valor terminal (Gordon).
export function twoStageDDM(dps, cagrPct, discountPct, price, { years1 = 5, cap = 12, terminal = 2.5 } = {}) {
  if (!(dps > 0) || !(price > 0)) return null
  const r = (discountPct > 0 ? discountPct : 9) / 100
  const gT = terminal / 100
  if (r <= gT + 0.005) return null            // Gordon explota si r≈g
  const g1 = Math.max(Math.min((cagrPct ?? 0) / 100, cap / 100), 0)
  let value = 0, d = dps
  for (let i = 1; i <= years1; i++) { d *= (1 + g1); value += d / Math.pow(1 + r, i) }
  const tv = d * (1 + gT) / (r - gT)          // valor terminal al final del año years1
  value += tv / Math.pow(1 + r, years1)
  return { value, mos: mos(value, price) }
}

// 3. Múltiplo relativo: valor implícito al aplicar la mediana de PER del sector.
//    value = EPS × medianaPER = precio × (medianaPER / PER actual).
export function peRelativeValue(peTrailing, sectorMedianPe, price) {
  if (!(peTrailing > 0) || !(sectorMedianPe > 0) || !(price > 0)) return null
  const value = price * (sectorMedianPe / peTrailing)
  return { value, mos: mos(value, price) }
}

// 4. EPV (Earnings Power Value): valor del negocio SIN crecimiento. Reutiliza los
//    inputs del DCF general (FCFF base, WACC, deuda neta, acciones) → coherente.
export function epvValue(params, price) {
  if (!params || !(params.base > 0) || !(params.r > 0) || !(params.shares > 0)) return null
  const ev = params.base / params.r          // perpetuidad sin crecimiento del FCFF
  const value = (ev - (params.netDebt || 0)) / params.shares
  if (!(value > 0)) return null
  return { value, mos: mos(value, price) }
}

// 5. DCF inverso: crecimiento de fase 1 IMPLÍCITO en el precio actual (resto del
//    modelo igual que el DCF mostrado). Devuelve { impliedG, floor/ceil }.
export function impliedGrowth(params, price) {
  if (!params || !(params.base > 0) || !(params.shares > 0) || !(price > 0)) return null
  const ratio = params.g1 ? params.g2 / params.g1 : 0.5   // conserva la relación fase2/fase1
  const ivAt = g1 => {
    const proj = dcfProjection({ ...params, g1, g2: g1 * ratio })
    return (proj.totalPV - (params.netDebt || 0)) / params.shares
  }
  const f = g1 => ivAt(g1) - price
  let lo = -0.20, hi = 0.40
  if (f(lo) >= 0) return { impliedG: lo, floor: true }
  if (f(hi) <= 0) return { impliedG: hi, ceil: true }
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) hi = mid; else lo = mid
  }
  return { impliedG: (lo + hi) / 2 }
}

// 6. Regla Chowder: yield + CAGR del dividendo ≥ umbral (más exigente en low-yield).
//    Filtro DGI clásico de "renta + crecimiento" suficiente.
export function chowder(yieldPct, cagrPct, sectorType) {
  if (yieldPct == null || cagrPct == null) return null
  const sum = yieldPct + cagrPct
  // Utilities/REITs (alto yield, bajo crecimiento) → umbral 8; resto → 12.
  const threshold = (sectorType === 'utilities' || sectorType === 'reit' || yieldPct >= 4) ? 8 : 12
  return { sum: Math.round(sum * 10) / 10, threshold, pass: sum >= threshold }
}
