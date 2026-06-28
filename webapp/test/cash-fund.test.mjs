import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balanceOf, monthlyRate, pendingInterest, estimateMonthInterest, estimateAnnualInterest, signOf } from '../lib/cash-fund.js'

test('signOf — entradas suman, salidas restan', () => {
  assert.equal(signOf('deposit'), 1)
  assert.equal(signOf('dividend'), 1)
  assert.equal(signOf('interest'), 1)
  assert.equal(signOf('withdraw'), -1)
  assert.equal(signOf('investment'), -1)
})

test('balanceOf — suma de importes con signo y corte por fecha', () => {
  const mv = [
    { date: '2026-01-10', amount: 1000 },
    { date: '2026-02-05', amount: -200 },
    { date: '2026-03-01', amount: 50 },
  ]
  assert.equal(balanceOf(mv), 850)
  assert.equal(balanceOf(mv, '2026-02-28'), 800)
  assert.equal(balanceOf(mv, '2026-01-01'), 0)
})

test('monthlyRate — TAE / 12', () => {
  assert.ok(Math.abs(monthlyRate(12) - 0.01) < 1e-12)
  assert.equal(monthlyRate(0), 0)
})

test('pendingInterest — devenga meses cerrados y capitaliza (compuesto)', () => {
  const mv = [{ date: '2026-01-10', amount: 1000, type: 'deposit' }]
  const out = pendingInterest(mv, 12, new Date('2026-04-15T12:00:00'))
  assert.equal(out.length, 3)                          // ene, feb, mar (abril aún abierto)
  assert.equal(out[0].date, '2026-01-31')
  assert.ok(Math.abs(out[0].amount - 10) < 1e-9)       // 1000 × 1%
  assert.ok(Math.abs(out[1].amount - 10.1) < 1e-9)     // (1000+10) × 1%
  assert.ok(Math.abs(out[2].amount - 10.2) < 1e-9)     // (1010.1+...) × 1%, redondeado
  out.forEach(m => assert.equal(m.type, 'interest'))
})

test('pendingInterest — sin tipo o sin movimientos no devenga nada', () => {
  assert.deepEqual(pendingInterest([{ date: '2026-01-10', amount: 1000 }], 0), [])
  assert.deepEqual(pendingInterest([], 5), [])
})

test('pendingInterest — no duplica el interés de un mes ya devengado', () => {
  const mv = [
    { date: '2026-01-10', amount: 1000, type: 'deposit' },
    { date: '2026-01-31', amount: 10, type: 'interest' },
  ]
  const out = pendingInterest(mv, 12, new Date('2026-03-15T12:00:00'))
  // enero ya tiene interés → solo se devenga febrero
  assert.equal(out.length, 1)
  assert.equal(out[0].date, '2026-02-28')
})

test('estimaciones — mes y año sobre el saldo actual', () => {
  assert.ok(Math.abs(estimateMonthInterest(1200, 12) - 12) < 1e-9)   // 1200 × 1%
  assert.ok(Math.abs(estimateAnnualInterest(1000, 2.5) - 25) < 1e-9) // 1000 × 2.5%
})
