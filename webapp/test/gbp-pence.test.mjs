import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enrichPositions, normalizeGbp, penceToPounds } from '../lib/portfolio.js'

test('penceToPounds — solo tickers .L', () => {
  assert.equal(penceToPounds('FOUR.L'), true)
  assert.equal(penceToPounds('four.l'), true)
  assert.equal(penceToPounds('AAPL'), false)
  assert.equal(penceToPounds('OR.PA'), false)
})

test('normalizeGbp — .L en GBP pasa de peniques a libras (÷100)', () => {
  assert.ok(Math.abs(normalizeGbp(3740, 'FOUR.L', 'GBP') - 37.4) < 1e-9)
  assert.ok(Math.abs(normalizeGbp(377.1, 'FOUR.L', 'GBP') - 3.771) < 1e-9)
})

test('normalizeGbp — no toca otras divisas ni no-.L', () => {
  assert.equal(normalizeGbp(100, 'AAPL', 'USD'), 100)
  assert.equal(normalizeGbp(50, 'IBE.MC', 'EUR'), 50)
  assert.equal(normalizeGbp(null, 'FOUR.L', 'GBP'), null)
})

test('enrichPositions — 4imprint (.L): YoC y precio coherentes (peniques→libras)', () => {
  // Caso real reportado: precio/dps de Yahoo en peniques, avg_cost en libras.
  const pos = [{ ticker: 'FOUR.L', shares: 15, avg_cost: 36.5, currency: 'GBP', asset_type: 'stock' }]
  const fm = { 'FOUR.L': { current_price: 3740, dps: 377.1, sector: 'Consumer Cyclical', country: 'United Kingdom' } }
  const e = enrichPositions(pos, fm, {})[0]
  assert.ok(Math.abs(e.currentPrice - 37.4) < 1e-9, 'precio en libras')
  assert.ok(Math.abs(e.dps - 3.771) < 1e-9, 'dps en libras')
  // YoC = 3.771 / 36.5 * 100 ≈ 10.3% (antes salía ~1033%)
  assert.ok(e.yieldOnCost > 5 && e.yieldOnCost < 20, `YoC sano, fue ${e.yieldOnCost}`)
  // currentYield = 3.771 / 37.4 * 100 ≈ 10.1%
  assert.ok(e.currentYield > 5 && e.currentYield < 20, `yield sano, fue ${e.currentYield}`)
  // gain razonable (no +9900%)
  assert.ok(Math.abs(e.gainPct) < 50, `gain razonable, fue ${e.gainPct}`)
})

test('enrichPositions — acción US no se ve afectada', () => {
  const pos = [{ ticker: 'KO', shares: 10, avg_cost: 60, currency: 'USD', asset_type: 'stock' }]
  const fm = { 'KO': { current_price: 66, dps: 1.94, sector: 'Consumer Defensive', country: 'United States' } }
  const e = enrichPositions(pos, fm, {})[0]
  assert.equal(e.currentPrice, 66)
  assert.equal(e.dps, 1.94)
})
