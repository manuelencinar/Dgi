import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pAffoRelativeValue, peRelativeValue } from '../lib/valuation-methods.js'

test('pAffoRelativeValue: valor = (dps/payout_affo) × mediana P/AFFO', () => {
  // dps 3, payout_affo 75% → AFFO/acc = 3/0.75 = 4; mediana 16× → valor 64
  const r = pAffoRelativeValue(3, 75, 16, 50)
  assert.ok(Math.abs(r.value - 64) < 0.01)
  assert.ok(Math.abs(r.mos - (64 - 50) / 50) < 1e-9)
})

test('pAffoRelativeValue: null si faltan datos (evita valores absurdos en REITs sin AFFO)', () => {
  assert.equal(pAffoRelativeValue(0, 75, 16, 50), null)
  assert.equal(pAffoRelativeValue(3, 0, 16, 50), null)
  assert.equal(pAffoRelativeValue(3, 75, 0, 50), null)
})

test('peRelativeValue sigue intacto (no-REITs)', () => {
  // PER actual 20, mediana 15 → valor = precio × 15/20 = 0,75 × precio
  const r = peRelativeValue(20, 15, 100)
  assert.ok(Math.abs(r.value - 75) < 0.01)
})
