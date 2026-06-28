import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcFiscal, toEUR } from '../lib/portfolio.js'
import { projectIncome } from '../lib/portfolio-calc.js'

// Construye una posición enriquecida coherente (annualIncomeEUR = toEUR(dps×shares)).
function pos({ ticker, country, dps, shares, currency, cagr = 5 }) {
  return {
    ticker, countryCode: country, companyCountry: country,
    dps, shares, currency, currentPrice: 100, avg_cost: 90, div_cagr5: cagr,
    annualIncomeEUR: toEUR(dps * shares, currency),
    isFund: false, type: 'general',
  }
}

test('unificación: el año 1 de projectIncome == renta neta de calcFiscal', () => {
  const enriched = [
    pos({ ticker: 'KO', country: 'US', dps: 2, shares: 100, currency: 'USD' }),
    pos({ ticker: 'IBE.MC', country: 'ES', dps: 1, shares: 50, currency: 'EUR' }),
    pos({ ticker: 'OR.PA', country: 'FR', dps: 6, shares: 10, currency: 'EUR' }),
  ]
  const fiscalNet = calcFiscal(enriched, null, 19).reduce((s, r) => s + r.net, 0)
  const proj = projectIncome(enriched, { horizon: 10, taxRate: 19 })
  // El primer año de la proyección NO crece todavía → coincide con el ritmo actual.
  assert.ok(Math.abs(proj.base[0].net - fiscalNet) < 0.5, `proj=${proj.base[0].net} fiscal=${fiscalNet}`)
})

test('projectIncome: el año 2 ya crece sobre el año 1', () => {
  const enriched = [pos({ ticker: 'KO', country: 'US', dps: 2, shares: 100, currency: 'USD', cagr: 8 })]
  const proj = projectIncome(enriched, { horizon: 10, taxRate: 19 })
  assert.ok(proj.base[1].net > proj.base[0].net, 'el año 2 debe ser mayor que el año 1')
})
