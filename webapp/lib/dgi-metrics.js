// 10-year sovereign bond reference rates (approx, updated periodically)
const BOND_RATES = {
  US: 0.045, ES: 0.032, DE: 0.025, FR: 0.031, GB: 0.042,
  CH: 0.007, NL: 0.026, SE: 0.025, DK: 0.026, FI: 0.028,
  NO: 0.038, BE: 0.030, PT: 0.030, AT: 0.027, IE: 0.029,
  GR: 0.034, PL: 0.055, CZ: 0.042, HU: 0.065,
  CA: 0.038, JP: 0.015, HK: 0.040, CN: 0.022,
  IN: 0.068, KR: 0.030, AU: 0.043, SG: 0.033,
  BR: 0.130, MX: 0.095, AR: 0.250, CL: 0.058, TR: 0.280,
}

// Country code from ticker suffix
function countryFromTicker(ticker) {
  if (!ticker.includes('.')) return 'US'
  const suffix = ticker.split('.').pop()
  const MAP = {
    MC: 'ES', DE: 'DE', PA: 'FR', L: 'GB', SW: 'CH',
    AS: 'NL', ST: 'SE', CO: 'DK', HE: 'FI', OL: 'NO',
    BR: 'BE', LS: 'PT', VI: 'AT', IR: 'IE', AT: 'GR',
    WA: 'PL', PR: 'CZ', BD: 'HU', TO: 'CA', T: 'JP',
    HK: 'HK', SS: 'CN', SZ: 'CN', NS: 'IN', KS: 'KR',
    AX: 'AU', SI: 'SG', SA: 'BR', MX: 'MX', BA: 'AR',
    SN: 'CL', IS: 'TR',
  }
  return MAP[suffix] || 'US'
}

function getBondRate(constituents) {
  if (!constituents.length) return 0.04
  const country = countryFromTicker(constituents[0].ticker)
  return BOND_RATES[country] ?? 0.04
}

// Health classification per company
// green = strong DGI candidate, yellow = neutral, red = avoid
function classifyHealth(f) {
  if (!f) return 'gray'
  const hasDividend = f.yield !== null && f.yield > 0
  const payout      = f.payout

  if (!hasDividend) return 'red'

  const yieldOk   = f.yield >= 0.015                          // ≥1.5%
  const payoutOk  = payout !== null && payout > 0 && payout < 0.75
  const payoutHigh = payout !== null && payout >= 0.75
  const peOk      = f.pe !== null && f.pe > 0 && f.pe < 30

  if (yieldOk && payoutOk && peOk) return 'green'
  if (payoutHigh || (f.pe !== null && f.pe > 40)) return 'red'
  return 'yellow'
}

// Score per company: 0–10 (exported for screener)
export function scoreCompany(f) {
  if (!f) return 0
  let score = 0

  // Dividend yield: 0–3 pts
  if (f.yield >= 0.04) score += 3
  else if (f.yield >= 0.025) score += 2
  else if (f.yield >= 0.015) score += 1

  // Payout sustainability: 0–3 pts
  if (f.payout !== null && f.payout > 0 && f.payout < 0.5) score += 3
  else if (f.payout !== null && f.payout < 0.75) score += 1.5

  // Valuation (PE): 0–2 pts
  if (f.pe !== null && f.pe > 0 && f.pe < 15) score += 2
  else if (f.pe !== null && f.pe < 22) score += 1

  // Earnings quality (positive EPS): 0–2 pts
  if (f.eps !== null && f.eps > 0) score += 2

  return Math.min(10, Math.round(score * 10) / 10)
}

export function computeDGIMetrics(indexSymbol, constituents, fundamentals) {
  const total = constituents.length
  if (total === 0) return null

  // Per-company health + score
  const companies = constituents.map(c => {
    const f = fundamentals[c.ticker] || null
    return {
      ...c,
      f,
      health: classifyHealth(f),
      score:  scoreCompany(f),
    }
  })

  // Termómetro DGI
  const withDividend = companies.filter(c => c.f?.yield > 0).length
  const withSustainablePayout = companies.filter(c =>
    c.f?.yield > 0 && c.f?.payout !== null && c.f.payout > 0 && c.f.payout < 0.75
  ).length
  const dgiInvestable = companies.filter(c =>
    c.f?.yield >= 0.015 && c.f?.payout !== null && c.f.payout > 0 &&
    c.f.payout < 0.75 && c.f.eps > 0
  ).length

  // Average yield (only companies paying dividend)
  const payers = companies.filter(c => c.f?.yield > 0)
  const avgYield = payers.length
    ? payers.reduce((s, c) => s + c.f.yield, 0) / payers.length
    : 0

  // Bond rate for this market
  const bondRate = getBondRate(constituents)

  // Health map
  const healthMap = {
    green:  companies.filter(c => c.health === 'green').length,
    yellow: companies.filter(c => c.health === 'yellow').length,
    red:    companies.filter(c => c.health === 'red').length,
    gray:   companies.filter(c => c.health === 'gray').length,
    companies: companies.map(c => ({ ticker: c.ticker, name: c.name, health: c.health, yield: c.f?.yield ?? null, payout: c.f?.payout ?? null })),
  }

  // Radar de oportunidades: top 5 by score among green companies
  const opportunities = companies
    .filter(c => c.health === 'green')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(c => ({
      ticker: c.ticker, name: c.name,
      yield: c.f?.yield ?? null, payout: c.f?.payout ?? null,
      pe: c.f?.pe ?? null, score: c.score,
    }))

  // DGI Score 0–10 (with per-component breakdown)
  const yieldSpread     = avgYield - bondRate
  const greenRatio      = healthMap.green / total
  const investableRatio = dgiInvestable / total

  const ptsSpread = yieldSpread >= 0.02 ? 3 : yieldSpread >= 0.01 ? 2 : yieldSpread >= 0 ? 1 : 0
  const ptsGreen  = Math.min(3, Math.round(greenRatio * 10))
  const ptsInvest = Math.min(2, Math.round(investableRatio * 6))
  const ptsYield  = avgYield >= 0.04 ? 2 : avgYield >= 0.025 ? 1 : 0

  const dgiScore = Math.min(10, Math.round((ptsSpread + ptsGreen + ptsInvest + ptsYield) * 10) / 10)

  const breakdown = [
    {
      key: 'yieldSpread',
      label: 'Spread yield vs bono',
      pts: ptsSpread, max: 3,
      detail: yieldSpread >= 0
        ? `+${(yieldSpread * 100).toFixed(2)}pp sobre el bono`
        : `${(yieldSpread * 100).toFixed(2)}pp bajo el bono`,
      positive: yieldSpread >= 0,
    },
    {
      key: 'greenRatio',
      label: '% empresas sólidas',
      pts: ptsGreen, max: 3,
      detail: `${Math.round(greenRatio * 100)}% del índice en verde`,
      positive: ptsGreen >= 2,
    },
    {
      key: 'investable',
      label: '% invertibles DGI',
      pts: ptsInvest, max: 2,
      detail: `${Math.round(investableRatio * 100)}% con dividendo sostenible`,
      positive: ptsInvest >= 1,
    },
    {
      key: 'avgYield',
      label: 'Yield absoluto',
      pts: ptsYield, max: 2,
      detail: `Yield medio del ${(avgYield * 100).toFixed(2)}%`,
      positive: ptsYield >= 1,
    },
  ]

  return {
    total,
    thermometer: { withDividend, withSustainablePayout, dgiInvestable, total },
    avgYield,
    bondRate,
    yieldSpread,
    healthMap,
    opportunities,
    dgiScore,
    breakdown,
  }
}
