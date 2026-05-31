// Portfolio utilities — pure functions, no React

import { DICT } from '@/data/dict'

// ── FX ────────────────────────────────────────────────────────────────────

export const FX = { EUR: 1, USD: 0.92, GBP: 1.17, JPY: 0.006 }
export function toEUR(amount, currency) {
  return amount * (FX[currency] || 1.0)
}

// ── Geography ─────────────────────────────────────────────────────────────

const ZONE = {
  ES:'Europa', DE:'Europa', FR:'Europa', IT:'Europa', NL:'Europa',
  GB:'Europa', CH:'Europa', BE:'Europa', SE:'Europa', DK:'Europa',
  NO:'Europa', FI:'Europa', AT:'Europa', PT:'Europa', IE:'Europa',
  LU:'Europa', PL:'Europa', GR:'Europa', HU:'Europa', CZ:'Europa',
  RO:'Europa', SK:'Europa', SI:'Europa', EE:'Europa', LV:'Europa',
  LT:'Europa', HR:'Europa', BG:'Europa', CY:'Europa', MT:'Europa',
  US:'Norteamérica', CA:'Norteamérica',
  MX:'Latinoamérica', BR:'Latinoamérica', CL:'Latinoamérica',
  CO:'Latinoamérica', PE:'Latinoamérica', AR:'Latinoamérica',
  JP:'Asia', CN:'Asia', HK:'Asia', SG:'Asia', KR:'Asia',
  TW:'Asia', IN:'Asia', TH:'Asia', MY:'Asia', ID:'Asia', PH:'Asia',
  AU:'Oceanía', NZ:'Oceanía',
  ZA:'África', NG:'África', KE:'África',
}
export function codeToZone(code) { return ZONE[(code || '').toUpperCase()] || 'Otros' }

// ── Fiscal ────────────────────────────────────────────────────────────────

const WITHHOLDING = {
  'United States': 0.15, 'Germany': 0.26375, 'Switzerland': 0.35,
  'France': 0.128, 'United Kingdom': 0.00, 'Spain': 0.19,
  'Netherlands': 0.15, 'Belgium': 0.30, 'Sweden': 0.30,
  'Denmark': 0.27, 'Norway': 0.25, 'Finland': 0.25,
  'Australia': 0.30, 'Japan': 0.2042, 'Canada': 0.25,
}
const ES_RATE = 0.19

// ── Enrich positions ──────────────────────────────────────────────────────

export function enrichPositions(rawPositions, fundamentalsMap) {
  return rawPositions.map(pos => {
    const fund = fundamentalsMap[pos.ticker] || {}
    const dictEntry = DICT.find(d => d[1] === pos.ticker)
    const name        = dictEntry?.[0] ?? pos.ticker
    const countryCode = dictEntry?.[2] ?? null
    const dictCurr    = dictEntry?.[3] ?? 'USD'
    const sector      = fund.sector    || dictEntry?.[4] || '—'
    const type        = dictEntry?.[6] ?? 'general'

    const currency      = pos.currency || dictCurr
    const currentPrice  = fund.current_price  ?? null
    const dps           = fund.dps             ?? 0

    const valueEUR      = currentPrice != null ? toEUR(currentPrice * pos.shares, currency) : null
    const costEUR       = toEUR(pos.avg_cost * pos.shares, currency)
    const gainEUR       = valueEUR != null ? valueEUR - costEUR : null
    const gainPct       = costEUR > 0 && gainEUR != null ? gainEUR / costEUR * 100 : null
    const annualIncomeEUR = toEUR(dps * pos.shares, currency)
    const yieldOnCost   = pos.avg_cost > 0 ? dps / pos.avg_cost * 100 : null
    const currentYield  = currentPrice ? dps / currentPrice * 100 : null
    const zone          = codeToZone(countryCode)

    return {
      ...pos,
      name, countryCode, sector, currency, zone, type,
      currentPrice, dps,
      valueEUR, costEUR, gainEUR, gainPct,
      annualIncomeEUR, yieldOnCost, currentYield,
      companyCountry: fund.country ?? null,
      payoutFCF:          fund.payout_fcf         ?? null,
      debtEbitda:         fund.debt_ebitda         ?? null,
      interestCoverage:   fund.interest_coverage   ?? null,
      fcfCagr5:           fund.fcf_cagr5           ?? null,
    }
  })
}

// ── Summary ───────────────────────────────────────────────────────────────

export function calcSummary(enriched) {
  const totalValueEUR  = enriched.reduce((s, p) => s + (p.valueEUR  ?? 0), 0)
  const totalCostEUR   = enriched.reduce((s, p) => s + (p.costEUR   ?? 0), 0)
  const totalIncomeEUR = enriched.reduce((s, p) => s + (p.annualIncomeEUR ?? 0), 0)
  const gainEUR        = totalValueEUR - totalCostEUR
  const gainPct        = totalCostEUR > 0 ? gainEUR / totalCostEUR * 100 : null
  const yieldOnCost    = totalCostEUR > 0 ? totalIncomeEUR / totalCostEUR * 100 : null
  return { totalValueEUR, totalCostEUR, totalIncomeEUR, gainEUR, gainPct, yieldOnCost }
}

// ── Concentration ─────────────────────────────────────────────────────────

export function calcConcentration(enriched) {
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return { bySector: [], byZone: [], byCurrency: [] }

  function group(key) {
    const map = {}
    enriched.forEach(p => {
      const k = p[key] || 'Sin clasificar'
      map[k] = (map[k] || 0) + (p.valueEUR ?? 0)
    })
    return Object.entries(map)
      .map(([name, v]) => ({ name, value: v / total * 100 }))
      .sort((a, b) => b.value - a.value)
  }

  return {
    bySector:   group('sector'),
    byZone:     group('zone'),
    byCurrency: group('currency'),
  }
}

// ── Alerts ────────────────────────────────────────────────────────────────

export function calcAlerts(enriched, concentration) {
  const alerts = []
  const total       = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  const totalIncome = enriched.reduce((s, p) => s + (p.annualIncomeEUR ?? 0), 0)

  concentration.bySector.forEach(s => {
    if (s.value > 30) alerts.push(`Concentración elevada en ${s.name} — representa el ${s.value.toFixed(0)}% de la cartera`)
  })
  enriched.forEach(p => {
    if (total > 0 && (p.valueEUR ?? 0) / total > 0.20)
      alerts.push(`Alta dependencia de ${p.name} — ${((p.valueEUR ?? 0) / total * 100).toFixed(0)}% del valor total`)
  })
  enriched.forEach(p => {
    if (totalIncome > 0 && (p.annualIncomeEUR ?? 0) / totalIncome > 0.25)
      alerts.push(`${((p.annualIncomeEUR ?? 0) / totalIncome * 100).toFixed(0)}% de tus dividendos dependen de ${p.name}`)
  })
  concentration.byCurrency.forEach(c => {
    if (c.value > 60) alerts.push(`Exposición elevada a ${c.name} — representa el ${c.value.toFixed(0)}% de la cartera`)
  })
  return alerts
}

// ── Diversification score ─────────────────────────────────────────────────

export function calcDiversificationScore(enriched) {
  if (!enriched.length) return null
  const total = enriched.reduce((s, p) => s + (p.valueEUR ?? 0), 0)
  if (!total) return null

  // 1. Company concentration
  const maxComp = Math.max(...enriched.map(p => (p.valueEUR ?? 0) / total * 100))
  const scComp  = maxComp < 10 ? 10 : maxComp > 30 ? 0 : 10 - (maxComp - 10) / 20 * 10

  // 2. Sector concentration
  const sectors = {}
  enriched.forEach(p => { const k = p.sector || '—'; sectors[k] = (sectors[k] || 0) + (p.valueEUR ?? 0) })
  const maxSec = Math.max(...Object.values(sectors)) / total * 100
  const scSec  = maxSec < 20 ? 10 : maxSec > 40 ? 0 : 10 - (maxSec - 20) / 20 * 10

  // 3. Zone concentration
  const zones = new Set(enriched.map(p => p.zone || 'Otros'))
  const scZone = zones.size >= 3 ? 10 : zones.size === 2 ? 5 : 2

  // 4. Currency concentration
  const currs = {}
  enriched.forEach(p => { const k = p.currency || 'EUR'; currs[k] = (currs[k] || 0) + (p.valueEUR ?? 0) })
  const maxCurr = Math.max(...Object.values(currs)) / total * 100
  const scCurr  = maxCurr < 50 ? 10 : maxCurr > 80 ? 0 : 10 - (maxCurr - 50) / 30 * 10

  // 5. Number of positions
  const n     = enriched.length
  const scNum = n < 5 ? 0 : n <= 10 ? 5 : n <= 20 ? 8 : 10

  const score = Math.round((scComp + scSec + scZone + scCurr + scNum) / 5 * 10) / 10

  const criteria = [
    { sc: scComp, rec: 'Reduce la concentración en posiciones individuales — ninguna debería superar el 10% del valor total.' },
    { sc: scSec,  rec: 'Diversifica por sector — ninguno debería superar el 20% del valor total.' },
    { sc: scZone, rec: 'Añade exposición internacional — tener empresas de al menos 3 zonas geográficas mejora la diversificación.' },
    { sc: scCurr, rec: 'Diversifica por divisa — la exposición a una sola divisa no debería superar el 50%.' },
    { sc: scNum,  rec: 'Añade más posiciones — una cartera diversificada tiene al menos 15–20 empresas.' },
  ]
  const worst = [...criteria].sort((a, b) => a.sc - b.sc)[0]

  return { score, recommendation: worst.rec }
}

// ── Dividend risks ────────────────────────────────────────────────────────

export function calcDividendRisks(enriched, totalIncomeEUR) {
  return enriched
    .map(p => {
      const risks = []
      if (p.payoutFCF != null && p.payoutFCF > 90)
        risks.push({ label: 'Payout FCF elevado', level: p.payoutFCF > 110 ? 'alto' : 'medio' })
      if (p.debtEbitda != null && p.debtEbitda > 4)
        risks.push({ label: 'Deuda elevada', level: p.debtEbitda > 5 ? 'alto' : 'medio' })
      if (p.interestCoverage != null && p.interestCoverage < 3)
        risks.push({ label: 'Cobertura de intereses baja', level: p.interestCoverage < 2 ? 'alto' : 'medio' })
      if (p.fcfCagr5 != null && p.fcfCagr5 < -5)
        risks.push({ label: 'FCF en descenso', level: 'medio' })
      const incPct = totalIncomeEUR > 0 ? (p.annualIncomeEUR ?? 0) / totalIncomeEUR * 100 : 0
      return { ...p, risks, incPct }
    })
    .filter(p => p.risks.length > 0)
}

// ── Fiscal ────────────────────────────────────────────────────────────────

export function calcFiscal(enriched) {
  return enriched
    .filter(p => (p.annualIncomeEUR ?? 0) > 0)
    .map(p => {
      const sourceRate      = WITHHOLDING[p.companyCountry] ?? 0.15
      const gross           = p.annualIncomeEUR
      const sourceWH        = gross * sourceRate
      const additionalES    = Math.max(0, gross * ES_RATE - sourceWH)
      const net             = gross - sourceWH - additionalES
      const effectiveRate   = gross > 0 ? (sourceWH + additionalES) / gross * 100 : 0
      return {
        ticker: p.ticker, name: p.name,
        gross, sourceRate: sourceRate * 100, sourceWH, additionalES, net, effectiveRate,
        companyCountry: p.companyCountry || '—',
      }
    })
}

// ── Weighted avg cost ─────────────────────────────────────────────────────

export function weightedAvgCost(existingShares, existingCost, newShares, newPrice) {
  const total = existingShares + newShares
  if (total <= 0) return 0
  return (existingShares * existingCost + newShares * newPrice) / total
}
