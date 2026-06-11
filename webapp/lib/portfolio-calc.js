// Portfolio calculation utilities — projections, calendar, DRIP, FI

import { FX, toEUR } from '@/lib/portfolio'

const MAX_CAGR = 0.20

// Crecimiento del dividendo más realista: ninguna empresa sostiene un CAGR alto
// indefinidamente. El CAGR inicial decae linealmente hacia una tasa terminal
// sostenible a lo largo de DIV_FADE_YEARS. Las empresas que ya crecen por debajo
// de la terminal se mantienen (no se les inventa más crecimiento).
const DIV_TERMINAL = 0.03      // 3% terminal sostenible
const DIV_FADE_YEARS = 10      // años hasta converger a la terminal
function fadedGrowth(g0, k) {   // g0 = CAGR inicial (decimal), k = índice de año (0-based)
  if (g0 <= DIV_TERMINAL) return g0
  if (k >= DIV_FADE_YEARS) return DIV_TERMINAL
  return g0 - (g0 - DIV_TERMINAL) * (k / DIV_FADE_YEARS)
}

// ── Projection ────────────────────────────────────────────────────────────

export function projectIncome(enriched, { horizon, monthly = 0, monthlyGrowthPct = 0, reinvest = false, taxRate = 19 }) {
  function scenario(mult) {
    let positions = enriched.map(p => ({
      ticker: p.ticker,
      shares: p.shares,
      dps: p.dps || 0,
      cagr: Math.min(Math.max((p.div_cagr5 || 3) / 100 * mult, 0), MAX_CAGR),
      price: Math.max(p.currentPrice || p.avg_cost || 1, 0.01),
      currency: p.currency || 'EUR',
    }))

    const data = []
    let yearlyContrib = monthly * 12

    for (let y = 1; y <= horizon; y++) {
      // Grow dividends — el CAGR se modera año a año hacia la tasa terminal
      positions = positions.map(p => ({ ...p, dps: p.dps * (1 + fadedGrowth(p.cagr, y - 1)) }))

      // Annual income
      const income = positions.reduce((s, p) => s + toEUR(p.dps * p.shares, p.currency), 0)
      const net    = income * (1 - taxRate / 100)

      // Reinvestment — proportional by value
      if (reinvest && net > 0) {
        const totalVal = positions.reduce((s, p) => s + toEUR(p.price * p.shares, p.currency), 0)
        if (totalVal > 0) {
          positions = positions.map(p => {
            const w = toEUR(p.price * p.shares, p.currency) / totalVal
            const addEUR = net * w
            const fxRate = FX[p.currency] || 1
            const addShares = fxRate > 0 && p.price > 0 ? addEUR / fxRate / p.price : 0
            return { ...p, shares: p.shares + addShares }
          })
        }
      }

      // Additional contributions — proportional by value
      if (yearlyContrib > 0) {
        const totalVal = positions.reduce((s, p) => s + toEUR(p.price * p.shares, p.currency), 0)
        if (totalVal > 0) {
          positions = positions.map(p => {
            const w = toEUR(p.price * p.shares, p.currency) / totalVal
            const addEUR = yearlyContrib * w
            const fxRate = FX[p.currency] || 1
            const addShares = fxRate > 0 && p.price > 0 ? addEUR / fxRate / p.price : 0
            return { ...p, shares: p.shares + addShares }
          })
        }
      }
      yearlyContrib *= (1 + monthlyGrowthPct / 100)

      data.push({ year: y, income: Math.round(income), net: Math.round(net) })
    }
    return data
  }

  return {
    conservative: scenario(0.7),
    base:         scenario(1.0),
    optimistic:   scenario(1.2),
  }
}

// ── DRIP ──────────────────────────────────────────────────────────────────

export function calcDRIP(enriched) {
  return enriched
    .filter(p => (p.dps || 0) > 0 && (p.annualIncomeEUR || 0) > 0)
    .map(p => {
      const annualDiv  = p.annualIncomeEUR || 0
      const priceEUR   = toEUR(p.currentPrice || p.avg_cost || 1, p.currency)
      const cagr       = Math.min(Math.max((p.div_cagr5 || 3) / 100, 0), MAX_CAGR)

      const addSharesY1 = priceEUR > 0 ? annualDiv / priceEUR : 0
      const addIncomeY1 = addSharesY1 * toEUR(p.dps || 0, p.currency)

      // 5-year compound (el CAGR se modera año a año, igual que la proyección)
      let sh5 = p.shares, dps5 = p.dps || 0
      for (let y = 0; y < 5; y++) {
        dps5 *= (1 + fadedGrowth(cagr, y))
        const divEUR = toEUR(dps5 * sh5, p.currency)
        sh5 += priceEUR > 0 ? divEUR / priceEUR : 0
      }
      // 10-year compound
      let sh10 = p.shares, dps10 = p.dps || 0
      for (let y = 0; y < 10; y++) {
        dps10 *= (1 + fadedGrowth(cagr, y))
        const divEUR = toEUR(dps10 * sh10, p.currency)
        sh10 += priceEUR > 0 ? divEUR / priceEUR : 0
      }

      // Without DRIP (just natural growth, con el mismo fade)
      let dpsBase5  = p.dps || 0, dpsBase10 = p.dps || 0
      for (let y = 0; y < 10; y++) { const g = 1 + fadedGrowth(cagr, y); if (y < 5) dpsBase5 *= g; dpsBase10 *= g }
      const incNodrip5  = toEUR(dpsBase5  * p.shares, p.currency)
      const incNodrip10 = toEUR(dpsBase10 * p.shares, p.currency)
      const incDrip5    = toEUR(dps5  * sh5,  p.currency)
      const incDrip10   = toEUR(dps10 * sh10, p.currency)

      return {
        ticker: p.ticker, name: p.name,
        annualDiv, addSharesY1, addIncomeY1,
        incDrip5, incNodrip5, incDrip10, incNodrip10,
        extraY5:  Math.round(incDrip5  - incNodrip5),
        extraY10: Math.round(incDrip10 - incNodrip10),
      }
    })
}

// ── Financial Independence ────────────────────────────────────────────────

export function calcFI(enriched, summary, { targetMonthly, monthlyContrib, contribGrowthPct, reinvest }) {
  if (!targetMonthly) return null
  const targetAnnual = targetMonthly * 12
  const currentYield = summary.totalValueEUR > 0 ? summary.totalIncomeEUR / summary.totalValueEUR : 0.04
  const capitalNeeded = currentYield > 0 ? targetAnnual / currentYield : null

  const avgCagrRaw = enriched.length > 0
    ? enriched.reduce((s, p) => s + Math.min((p.div_cagr5 || 3) / 100, MAX_CAGR), 0) / enriched.length
    : 0.05

  function runScenario(mult) {
    const cagr       = Math.min(avgCagrRaw * mult, 0.15)
    let capital      = summary.totalValueEUR || 0
    let income       = summary.totalIncomeEUR || 0
    let yearlyContrib= monthlyContrib * 12
    let yearsToFI    = null
    const traj       = []

    for (let y = 1; y <= 50; y++) {
      income  = income  * (1 + cagr)
      const net = income * 0.81
      if (reinvest) capital += net
      capital += yearlyContrib
      // New capital generates income at current yield
      const newIncome = (yearlyContrib + (reinvest ? net : 0)) * currentYield
      income += newIncome
      yearlyContrib *= (1 + contribGrowthPct / 100)
      traj.push({ year: y, capital: Math.round(capital), income: Math.round(income) })
      if (!yearsToFI && income >= targetAnnual) yearsToFI = y
    }
    return { yearsToFI, trajectory: traj }
  }

  return {
    targetAnnual, capitalNeeded,
    capitalCurrent: summary.totalValueEUR,
    conservative: runScenario(0.7),
    base:         runScenario(1.0),
    optimistic:   runScenario(1.2),
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────

function inferPayMonths(pos) {
  const type = (pos.type || '').toLowerCase()
  const code = (pos.countryCode || '').toUpperCase()
  if (type === 'reit' || type === 'bdc')                        return [1,2,3,4,5,6,7,8,9,10,11,12]
  if (code === 'US' || code === 'CA')                           return [3,6,9,12]
  if (code === 'GB')                                            return [4,10]
  if (code === 'JP' || code === 'AU' || code === 'NZ')          return [3,9]
  if (['ES','IT','PT'].includes(code))                          return [6,12]
  if (['DE','AT','CH','NL','BE','SE','DK','NO','FI'].includes(code)) return [4]
  if (['FR','LU'].includes(code))                               return [5]
  return [5]
}

// Frecuencia de distribución de un fondo inferida del historial (últimos 12 meses)
function inferFundMonths(pos) {
  const hist = pos.distributionHistory || []
  const cutoff = Date.now() - 365 * 24 * 3600 * 1000
  const n = hist.filter(d => d.date && new Date(d.date).getTime() >= cutoff).length
  if (n >= 11) return [1,2,3,4,5,6,7,8,9,10,11,12]  // mensual
  if (n >= 3)  return [3,6,9,12]                      // trimestral
  if (n === 2) return [6,12]                          // semestral
  if (n === 1) return [12]                            // anual
  return null                                         // historial insuficiente → fecha desconocida
}

export function buildCalendar(enriched) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, entries: [], total: 0 }))
  const upcoming = []

  enriched.forEach(pos => {
    if (!pos.annualIncomeEUR || pos.annualIncomeEUR <= 0) return
    const isFund = pos.isFund
    const payMonths = isFund ? inferFundMonths(pos) : inferPayMonths(pos)
    if (!payMonths) return  // fondo sin historial suficiente
    const amountPer = pos.annualIncomeEUR / payMonths.length
    const kind = pos.assetType || 'stock'

    payMonths.forEach(m => {
      const entry = { ticker: pos.ticker, name: pos.name, amount: Math.round(amountPer * 100) / 100, type: kind }
      months[m - 1].entries.push(entry)
      months[m - 1].total += amountPer

      const now  = new Date()
      const year = now.getMonth() + 1 > m ? now.getFullYear() + 1 : now.getFullYear()
      upcoming.push({ date: new Date(year, m - 1, 15), month: m, ...entry })
    })
  })

  months.forEach(m => { m.total = Math.round(m.total * 100) / 100 })
  upcoming.sort((a, b) => a.date - b.date)
  return { months, upcoming: upcoming.slice(0, 24) }
}
