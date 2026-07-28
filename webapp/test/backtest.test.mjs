import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBacktest } from '../lib/backtest.js'

// Serie de 5 años, precio que se duplica (100 → 200), sin dividendos.
const DAY = 86400
const t0 = Math.floor(Date.UTC(2021, 0, 1) / 1000)
const timestamps = [t0, t0 + Math.floor(365.25 * 5 * DAY)]
const closes = [100, 200]

test('computeBacktest — solo precio: 1.000 → 2.000 y CAGR coherente', () => {
  const b = computeBacktest({ timestamps, closes, divHistory: [], initial: 1000 })
  assert.ok(b.available)
  assert.equal(Math.round(b.endValue), 2000)
  assert.equal(Math.round(b.priceReturn), 100)
  assert.ok(Math.abs(b.totalCagr - 14.87) < 0.5)   // 2^(1/5)-1 ≈ 14.87%
})

test('computeBacktest — con dividendos, el total return supera al de solo precio', () => {
  const div = [{ year: 2021, dps: 5 }, { year: 2022, dps: 5 }, { year: 2023, dps: 5 }, { year: 2024, dps: 5 }, { year: 2025, dps: 5 }]
  const b = computeBacktest({ timestamps: [t0, t0 + Math.floor(365.25 * 5 * DAY)], closes: [100, 200], divHistory: div, initial: 1000 })
  assert.ok(b.totalReturn > b.priceReturn)
  assert.ok(b.dividendsCollected > 0)
})

test('computeBacktest — ventana demasiado corta → no disponible', () => {
  const b = computeBacktest({ timestamps: [t0, t0 + 10 * DAY], closes: [100, 101], divHistory: [] })
  assert.equal(b.available, false)
})

test('computeBacktest — datos inconsistentes → no disponible', () => {
  assert.equal(computeBacktest({ timestamps: [t0], closes: [], divHistory: [] }).available, false)
  assert.equal(computeBacktest({ timestamps: [t0, t0 + DAY], closes: [0, 100], divHistory: [] }).available, false)
})
