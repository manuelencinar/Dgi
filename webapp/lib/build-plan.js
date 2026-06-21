// Genera un plan de cartera priorizado a partir de las empresas del screener y
// las respuestas del wizard "construir cartera desde cero".
//   buildPortfolioPlan(companies, { monthly, targetYield, horizon, excludeSectors, destWHT, size })
// Puro: se ejecuta en cliente (los `co` ya vienen como props). Reúsa la lógica
// de zona de compra y yield neto del screener.
import { buyZoneReason, netYield, getWHT } from '@/lib/screener'

// Peso de yield / calidad / crecimiento según el horizonte de inversión.
const HORIZON_W = {
  corto: { y: 0.50, q: 0.30, g: 0.20 },   // <5 años → prima la renta ya
  medio: { y: 0.35, q: 0.35, g: 0.30 },
  largo: { y: 0.20, q: 0.40, g: 0.40 },   // >15 años → prima calidad + crecimiento
}

const QUALITY_FLOOR = 6          // solo empresas sólidas en el plan
const PER_SECTOR_MAX = 3         // diversificación: máx por sector

export function buildPortfolioPlan(companies = [], opts = {}) {
  const { monthly = 0, targetYield = 3, horizon = 'medio', excludeSectors = [], destWHT = 19, size = 12 } = opts
  const w = HORIZON_W[horizon] || HORIZON_W.medio
  const exclude = new Set(excludeSectors)
  const target = Math.max(Number(targetYield) || 3, 0.5)

  const candidates = companies.filter(co =>
    co && co.pays !== false &&
    co.sc != null && co.sc >= QUALITY_FLOOR &&
    co.y != null && co.y > 0 &&
    !co.ero && !co.mosUnreliable &&
    co.s && !exclude.has(co.s)
  ).map(co => {
    const yieldFit    = Math.min(co.y / target, 1.3) / 1.3
    const qualityFit  = Math.min(co.sc, 10) / 10
    const growthFit   = Math.min(Math.max(co.cagr ?? 0, 0), 12) / 12
    const base = w.y * yieldFit + w.q * qualityFit + w.g * growthFit
    const reason = buyZoneReason(co)
    const entryNow = !!reason
    return { co, fit: base + (entryNow ? 0.15 : 0), entryNow, reason }
  })

  // Selección con tope por sector para diversificar.
  candidates.sort((a, b) => b.fit - a.fit)
  const sectorCount = {}
  const picked = []
  for (const c of candidates) {
    if (picked.length >= size) break
    if ((sectorCount[c.co.s] || 0) >= PER_SECTOR_MAX) continue
    sectorCount[c.co.s] = (sectorCount[c.co.s] || 0) + 1
    picked.push(c)
  }
  // Si el tope sectorial deja el plan corto, rellenar con los mejores restantes.
  if (picked.length < Math.min(size, candidates.length)) {
    const inSet = new Set(picked.map(p => p.co.t))
    for (const c of candidates) {
      if (picked.length >= size) break
      if (!inSet.has(c.co.t)) picked.push(c)
    }
  }

  // Orden final = PRIORIDAD DE ENTRADA: zona de compra primero, luego mejor fit.
  picked.sort((a, b) => (Number(b.entryNow) - Number(a.entryNow)) || (b.fit - a.fit))

  const n = picked.length
  const weightPct  = n ? Math.round(1000 / n) / 10 : 0
  const monthlyEur = n && monthly ? Math.round((Number(monthly) || 0) / n) : 0
  const avgYield    = n ? picked.reduce((s, p) => s + p.co.y, 0) / n : 0
  const avgYieldNet = n ? picked.reduce((s, p) => s + netYield(p.co.y, getWHT(p.co.c), destWHT, p.co.c === 'ES'), 0) / n : 0

  return {
    plan: picked.map((p, i) => ({
      priority: i + 1,
      ticker: p.co.t, name: p.co.n, country: p.co.c, sector: p.co.s,
      currency: p.co.cur, price: p.co.px, score: p.co.sc, yield: p.co.y, cagr: p.co.cagr,
      entryNow: p.entryNow, reason: p.reason, weightPct, monthlyEur,
    })),
    meta: {
      size: n, monthly: Number(monthly) || 0, targetYield: target, horizon,
      sectors: Object.keys(sectorCount).length,
      avgYield: Math.round(avgYield * 100) / 100,
      avgYieldNet: Math.round(avgYieldNet * 100) / 100,
      entryNowCount: picked.filter(p => p.entryNow).length,
    },
  }
}
