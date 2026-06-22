// Seguridad del dividendo (0–100): un único número PREDICTIVO de cuánto riesgo de
// recorte tiene el dividendo, ANTES de que pase nada. Complementa al detector de
// recortes (reactivo) y al Score DGI (calidad global). Sintetiza payout, balance,
// historial y tendencia, con umbrales por sector (un REIT/utility soporta payouts
// que en una tecnológica serían alarmantes).
//
// Función pura → testeable. La usa la ficha (tarjeta de seguridad).
import { dividendTrend } from './helpers'

const n = v => { const x = Number(v); return isFinite(x) ? x : null }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
// puntuación lineal decreciente: good→100, bad→floor
const downScore = (v, good, bad, floor = 10) => v <= good ? 100 : v >= bad ? floor : 100 - (v - good) / (bad - good) * (100 - floor)

// Payout efectivo (FCF preferido, EPS de respaldo). Anula los absurdos.
function effectivePayout(data) {
  const pf = n(data.payout_fcf), pe = n(data.payout_eps)
  const ok = v => v != null && v > 0 && v < 300
  if (ok(pf)) return pf
  if (ok(pe)) return pe
  return null
}

// Bandas de payout (good/bad en %) según el sector.
function payoutBands(sectorType) {
  switch (sectorType) {
    case 'reit': return { good: 75, bad: 110 }       // se reparte casi todo el AFFO
    case 'utilities': return { good: 70, bad: 100 }
    case 'bank':
    case 'insurer': return { good: 50, bad: 85 }
    case 'energy': return { good: 55, bad: 95 }      // cíclico: margen extra
    default: return { good: 50, bad: 95 }
  }
}

// 1. Payout: cuánto del beneficio/caja se reparte (cuanto menos, más colchón).
function payoutScore(data, sectorType) {
  const p = effectivePayout(data)
  if (p == null) return { score: 50, label: 'Payout', detail: 'Sin dato de payout', weak: true }
  const { good, bad } = payoutBands(sectorType)
  const score = clamp(downScore(p, good, bad), 5, 100)
  return { score, label: 'Payout', detail: `Reparte el ${p.toFixed(0)}% (${sectorType === 'reit' ? 'sobre FCF; en REIT mejor AFFO' : 'preferido FCF'})` }
}

// 2. Balance: deuda neta/EBITDA + cobertura de intereses (capacidad de aguantar).
function balanceScore(data, sectorType) {
  const nde = n(data.net_debt_ebitda)
  const cov = n(data.interest_coverage)
  const levered = sectorType === 'reit' || sectorType === 'utilities'
  const parts = []
  if (nde != null && sectorType !== 'bank' && sectorType !== 'insurer') {
    parts.push(downScore(nde, levered ? 5 : 2.5, levered ? 9 : 6))
  }
  if (cov != null) parts.push(clamp(downScore(8 - clamp(cov, 0, 8), 0, 6), 10, 100))
  if (!parts.length) return { score: 55, label: 'Solidez del balance', detail: 'Sin datos de deuda', weak: true }
  const score = parts.reduce((a, b) => a + b, 0) / parts.length
  const bits = []
  if (nde != null) bits.push(`deuda ${nde.toFixed(1)}x EBITDA`)
  if (cov != null) bits.push(`cobertura ${cov.toFixed(1)}x`)
  return { score, label: 'Solidez del balance', detail: bits.join(' · ') }
}

// 3. Historial: la racha de subidas (compromiso demostrado con el dividendo).
function trackScore(data) {
  const s = n(data.div_streak)
  if (s == null) return { score: 45, label: 'Historial', detail: 'Sin racha registrada', weak: true }
  const score = s >= 25 ? 100 : s >= 10 ? 80 : s >= 5 ? 60 : s >= 1 ? 40 : 20
  return { score, label: 'Historial', detail: s > 0 ? `${s} años subiendo el dividendo` : 'Sin racha de subidas' }
}

// 4. Tendencia reciente: subidas recientes suman; recortes/congelaciones restan.
function trendScore(data) {
  const t = dividendTrend(data.div_history)
  if (!t) return { score: 60, label: 'Tendencia', detail: 'Histórico insuficiente', weak: true }
  let score = 65
  if (t.pos > 0) score = clamp(65 + Math.min(t.pos, 10) * 3.5, 65, 100)
  if (t.noRaise > 0 && t.down === 0) score = 45              // congelado
  if (t.down >= 1) score = clamp(30 - (t.down - 1) * 8, 6, 30) // recortando
  if (t.cuts10 >= 3) score = Math.min(score, 28)              // historial de recortes
  const detail = t.down >= 1 ? `${t.down} años recortando`
    : t.noRaise > 0 ? `${t.noRaise} años sin subir`
    : t.pos > 0 ? `${t.pos} años de subidas seguidas` : 'estable'
  return { score, label: 'Tendencia', detail }
}

const WEIGHTS = { payout: 0.35, balance: 0.25, track: 0.15, trend: 0.25 }

export function safetyGrade(score) {
  if (score >= 85) return { grade: 'Muy seguro', color: '#34d399' }
  if (score >= 70) return { grade: 'Seguro', color: '#4ade80' }
  if (score >= 50) return { grade: 'Vigilar', color: '#fbbf24' }
  if (score >= 30) return { grade: 'En riesgo', color: '#fb923c' }
  return { grade: 'Peligro', color: '#f87171' }
}

// Resultado: { available, score, grade, color, factors[] }.
export function dividendSafety(data, sectorType = 'general') {
  if (!data) return { available: false }
  const factors = [
    { key: 'payout', ...payoutScore(data, sectorType) },
    { key: 'balance', ...balanceScore(data, sectorType) },
    { key: 'track', ...trackScore(data) },
    { key: 'trend', ...trendScore(data) },
  ]
  // Si casi todo es "sin dato", no es fiable.
  if (factors.filter(f => f.weak).length >= 3) return { available: false }

  const score = Math.round(factors.reduce((s, f) => s + f.score * WEIGHTS[f.key], 0))
  const { grade, color } = safetyGrade(score)
  return {
    available: true, score, grade, color,
    factors: factors.map(f => ({ label: f.label, score: Math.round(f.score), weight: WEIGHTS[f.key], detail: f.detail })),
  }
}
