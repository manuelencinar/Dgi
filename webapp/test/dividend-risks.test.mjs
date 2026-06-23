import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcDividendRisks } from '../lib/portfolio.js'

const base = { annualIncomeEUR: 50 }

test('BDC — no se marca por FCF/deuda-EBITDA/FCF (no aplican)', () => {
  // Main Street Capital (BDC): payout FCF 124%, deuda 6×, FCF cayendo → NO debe saltar.
  const bdc = { ...base, type: 'bdc', sector: 'Financial Services', payoutFCF: 124, debtEbitda: 6, fcfCagr5: -20 }
  assert.equal(calcDividendRisks([bdc], 100).length, 0)
})

test('BDC — se evalúa por NII (prioritario sobre BPA)', () => {
  // MAIN real: payout_nii ~73% → cubierto, no salta (aunque el BPA dijera otra cosa).
  const ok = { ...base, type: 'bdc', sector: 'Financial Services', payoutNII: 73, payoutEPS: 130, payoutFCF: null }
  assert.equal(calcDividendRisks([ok], 100).length, 0)
  // NII por encima del 100% → no cubierto.
  const over = { ...base, type: 'bdc', sector: 'Financial Services', payoutNII: 130 }
  const r = calcDividendRisks([over], 100)
  assert.equal(r.length, 1)
  assert.equal(r[0].risks[0].label, 'Distribución por encima del NII')
  assert.equal(r[0].risks[0].level, 'alto')
})

test('BDC — sin NII cargado usa el BPA como respaldo', () => {
  const over = { ...base, type: 'bdc', sector: 'Financial Services', payoutEPS: 130 }
  const r = calcDividendRisks([over], 100)
  assert.equal(r.length, 1)
  assert.equal(r[0].risks[0].label, 'Distribución por encima del beneficio')
})

test('REIT — se evalúa por AFFO (no por BPA ni FCF)', () => {
  // BPA/FCF altísimos no importan; con AFFO cubierto (78%) NO salta.
  const ok = { ...base, type: 'reit', sector: 'Real Estate', payoutAffo: 78, payoutEPS: 180, payoutFCF: 150 }
  assert.equal(calcDividendRisks([ok], 100).length, 0)
  // AFFO por encima del 110% → alto.
  const over = { ...base, type: 'reit', sector: 'Real Estate', payoutAffo: 115 }
  const r = calcDividendRisks([over], 100)
  assert.equal(r.length, 1)
  assert.equal(r[0].risks[0].label, 'Payout AFFO elevado')
  assert.equal(r[0].risks[0].level, 'alto')
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
