import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcDividendRisks } from '../lib/portfolio.js'

const base = { annualIncomeEUR: 50 }

test('BDC — no se marca por FCF/deuda-EBITDA/FCF (no aplican)', () => {
  // Main Street Capital (BDC): payout FCF 124%, deuda 6×, FCF cayendo → NO debe saltar.
  const bdc = { ...base, type: 'bdc', sector: 'Financial Services', payoutFCF: 124, debtEbitda: 6, fcfCagr5: -20 }
  assert.equal(calcDividendRisks([bdc], 100).length, 0)
})

test('BDC — se evalúa por payout sobre beneficio (≈NII), no por FCF', () => {
  // MAIN real: payout_eps ~90% → cubierto, no salta.
  const ok = { ...base, type: 'bdc', sector: 'Financial Services', payoutEPS: 90, payoutFCF: null }
  assert.equal(calcDividendRisks([ok], 100).length, 0)
  // Distribución muy por encima del beneficio → sí salta.
  const over = { ...base, type: 'bdc', sector: 'Financial Services', payoutEPS: 130 }
  const r = calcDividendRisks([over], 100)
  assert.equal(r.length, 1)
  assert.equal(r[0].risks[0].label, 'Distribución por encima del beneficio')
  assert.equal(r[0].risks[0].level, 'alto')
})

test('REIT — payout no se evalúa por BPA (necesita AFFO) → no falso positivo', () => {
  const reit = { ...base, type: 'reit', sector: 'Real Estate', payoutEPS: 180, payoutFCF: 150 }
  assert.equal(calcDividendRisks([reit], 100).length, 0)
})

test('Banca — FCF/deuda/cobertura no aplican → no se marca', () => {
  const bank = { ...base, type: 'banco', sector: 'Financial Services', payoutFCF: 120, debtEbitda: 6, interestCoverage: 1 }
  assert.equal(calcDividendRisks([bank], 100).length, 0)
})

test('General — payout FCF alto SÍ se marca', () => {
  const gen = { ...base, type: 'general', sector: 'Technology', payoutFCF: 124 }
  const r = calcDividendRisks([gen], 100)
  assert.equal(r.length, 1)
  assert.equal(r[0].risks.length, 1)
  assert.equal(r[0].risks[0].label, 'Payout FCF elevado')
  assert.equal(r[0].risks[0].value, '124%')
  assert.equal(r[0].risks[0].level, 'alto')
})

test('Utilities — umbral de deuda más alto (regulada)', () => {
  const u5 = { ...base, type: 'utilities', sector: 'Utilities', debtEbitda: 5 }
  const u7 = { ...base, type: 'utilities', sector: 'Utilities', debtEbitda: 7 }
  assert.equal(calcDividendRisks([u5], 100).length, 0)   // 5× es normal en utilities
  assert.equal(calcDividendRisks([u7], 100).length, 1)   // 7× sí preocupa
})

test('Energía — FCF en descenso solo si es severo (ciclo)', () => {
  const mild = { ...base, type: 'general', sector: 'Energy', fcfCagr5: -10 }
  const severe = { ...base, type: 'general', sector: 'Energy', fcfCagr5: -30 }
  assert.equal(calcDividendRisks([mild], 100).length, 0)
  assert.equal(calcDividendRisks([severe], 100).length, 1)
})
