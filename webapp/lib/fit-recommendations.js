// Recomendación semanal de "empresas que encajan en tu cartera".
//   recommendFitCompanies(companies, weights, weekSeed, size)
// Puro: se ejecuta en el SERVER (el universo no llega al cliente). Selecciona
// hasta `size` empresas que:
//   · tienen buena nota DGI y están EN ZONA DE COMPRA (buyZoneReason),
//   · pertenecen a un SUPERSECTOR y un SECTOR infraponderados de la cartera,
//   · están en una DIVISA infraponderada,
//   · pertenecen a un PAÍS que NO está sobreponderado,
//   · preferentemente son de EE. UU., Canadá o Europa.
// La selección ROTA cada 7 días (vía weekSeed) sobre una preselección de calidad.
import { superSectorOf, sectorInfo, SUPERSECTORS } from '@/lib/supersectors'
import { buyZoneReason } from '@/lib/screener'
import { getCountry } from '@/lib/helpers'

// Umbrales de "infraponderado / no sobreponderado" (en % del valor de cartera).
const SUP_UNDER       = 33   // un supersector por debajo de su reparto equitativo (3 → 33%)
const SECTOR_UNDER    = 12   // un sector por debajo del 12% está poco representado
const CURR_UNDER      = 25   // una divisa por debajo del 25%
const COUNTRY_OVER    = 30   // país sobreponderado por encima del 30%…
const COUNTRY_OVER_US = 50   // …salvo EE. UU. (dominante natural en DGI)
const MIN_SCORE       = 6.5  // calidad DGI clara
const SHORTLIST       = 18   // preselección de la que rota la recomendación semanal

const pct = (m, k) => Number((m && m[k]) || 0)

// Hash estable del ticker con semilla semanal → orden pseudo-aleatorio que
// cambia cada 7 días pero es determinista dentro de la misma semana.
function seededHash(s, seed) {
  let h = 2166136261 ^ (seed >>> 0)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function whyFit(co, weights, sup) {
  const secEs   = sectorInfo(co.s).es
  const supLbl  = (SUPERSECTORS[sup]?.label || '').toLowerCase()
  const bits = []
  bits.push(`refuerza ${secEs}${supLbl ? ` (${supLbl})` : ''}, poco presente en tu cartera`)
  const cw = pct(weights.currW, co.cur)
  if (cw === 0) bits.push(`añade exposición a ${co.cur}, divisa que no tienes`)
  else bits.push(`aumenta tu exposición a ${co.cur}`)
  const ctry = getCountry(co.c)
  if (pct(weights.countryW, co.c) === 0 && ctry?.name) bits.push(`y a ${ctry.name}`)
  return bits.join('; ')
}

export function recommendFitCompanies(companies = [], weights = {}, weekSeed = 0, size = 5) {
  const { sectorW = {}, supW = {}, currW = {}, countryW = {} } = weights

  const candidates = (companies || []).filter(co => {
    if (!co || co.pays === false) return false
    if (co.sc == null || co.sc < MIN_SCORE) return false
    if (co.ero || co.mosUnreliable) return false
    if (!buyZoneReason(co)) return false                 // en precio de compra
    const sup = superSectorOf(co.s)
    if (sup === 'otros') return false                    // sin clasificar / ETF
    if (pct(supW, sup) >= SUP_UNDER) return false         // supersector infraponderado
    if (pct(sectorW, co.s) >= SECTOR_UNDER) return false  // sector infraponderado
    if (pct(currW, co.cur) >= CURR_UNDER) return false    // divisa infraponderada
    const overLimit = co.c === 'US' ? COUNTRY_OVER_US : COUNTRY_OVER
    if (pct(countryW, co.c) > overLimit) return false     // país NO sobreponderado
    return true
  }).map(co => {
    const sup = superSectorOf(co.s)
    const preferred = co.c === 'US' || co.c === 'CA' || co.cont === 'Europa'
    // Beneficio de diversificación: cuanto menos peso actual, mayor encaje.
    const divBenefit = (SUP_UNDER    - pct(supW, sup))     / SUP_UNDER    * 0.4
                     + (SECTOR_UNDER - pct(sectorW, co.s)) / SECTOR_UNDER * 0.3
                     + (CURR_UNDER   - pct(currW, co.cur)) / CURR_UNDER   * 0.3
    const quality = Math.min(co.sc, 10) / 10
    const fit = quality * 0.6 + divBenefit * 0.4 + (preferred ? 0.15 : 0)
    return { co, sup, preferred, fit }
  })

  // Ranking de calidad: preferentes (US/CA/Europa) primero, luego mejor encaje.
  candidates.sort((a, b) => (Number(b.preferred) - Number(a.preferred)) || (b.fit - a.fit))

  // Preselección de la que se rota semanalmente.
  const shortlist = candidates.slice(0, SHORTLIST)
  // Orden semanal estable (cambia cada 7 días vía weekSeed).
  shortlist.sort((a, b) => seededHash(a.co.t, weekSeed) - seededHash(b.co.t, weekSeed))

  // Selección final con tope de 2 por sector para diversificar la recomendación.
  const sectorCount = {}
  const picked = []
  for (const c of shortlist) {
    if (picked.length >= size) break
    if ((sectorCount[c.co.s] || 0) >= 2) continue
    sectorCount[c.co.s] = (sectorCount[c.co.s] || 0) + 1
    picked.push(c)
  }
  // Si el tope sectorial deja la lista corta, rellenar con el resto del shortlist.
  if (picked.length < Math.min(size, shortlist.length)) {
    const inSet = new Set(picked.map(p => p.co.t))
    for (const c of shortlist) {
      if (picked.length >= size) break
      if (!inSet.has(c.co.t)) picked.push(c)
    }
  }

  return picked.map(({ co, sup, preferred }) => {
    const ctry = getCountry(co.c)
    return {
      ticker: co.t, name: co.n,
      country: co.c, flag: ctry?.flag || '🌍', countryName: ctry?.name || co.c,
      sector: co.s, sectorEs: sectorInfo(co.s).es,
      supersector: sup, supersectorLabel: SUPERSECTORS[sup]?.label || '',
      currency: co.cur, price: co.px, score: co.sc, yield: co.y, cagr: co.cagr,
      reason: buyZoneReason(co), preferred,
      whyFit: whyFit(co, weights, sup),
    }
  })
}

// Índice de la "semana" (bucket de 7 días desde el epoch). La recomendación es
// estable dentro del mismo bucket y rota al pasar al siguiente.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
export function currentWeekSeed(now = Date.now()) {
  return Math.floor(now / WEEK_MS)
}
// Fecha (ISO) en que la recomendación se renovará (inicio del próximo bucket).
export function nextUpdateDate(now = Date.now()) {
  return new Date((currentWeekSeed(now) + 1) * WEEK_MS).toISOString()
}
