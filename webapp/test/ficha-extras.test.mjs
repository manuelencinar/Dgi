import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBuyPrice, MOS_TARGET } from '../lib/buy-price.js'
import { percentileRank, buildSectorPositioning } from '../lib/sector-percentiles.js'
import { dividendResilience } from '../lib/dividend-resilience.js'

// ── Precio de compra ──────────────────────────────────────────────────────
test('computeBuyPrice — precio de entrada = intrínseco × (1 − MoS) y distancia', () => {
  const r = computeBuyPrice({ intrinsic: 100, price: 90, score: 8 })
  assert.equal(r.available, true)
  assert.equal(r.quality, true)
  assert.equal(r.buyPrice, 100 * (1 - MOS_TARGET))   // 80
  assert.equal(Math.round(r.distancePct), Math.round((90 - 80) / 90 * 100))  // ~11%
  assert.equal(r.inZone, false)
})

test('computeBuyPrice — ya en zona cuando el precio ≤ objetivo', () => {
  const r = computeBuyPrice({ intrinsic: 100, price: 75, score: 7 })
  assert.equal(r.inZone, true)
  assert.ok(r.distancePct < 0)
})

test('computeBuyPrice — calidad baja o sin valoración se señalan', () => {
  assert.equal(computeBuyPrice({ intrinsic: 100, price: 90, score: 5 }).reason, 'calidad_baja')
  assert.equal(computeBuyPrice({ intrinsic: null, price: 90, score: 8 }).reason, 'sin_valoracion')
})

test('computeBuyPrice — precio objetivo por yield medio histórico', () => {
  const r = computeBuyPrice({ intrinsic: 100, price: 90, score: 8, yieldAvg: 3, dps: 3 })
  assert.equal(r.yieldTargetPrice, 3 / 0.03)   // 100
})

// ── Percentiles de sector ─────────────────────────────────────────────────
test('percentileRank — mayor es mejor / menor es mejor', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  assert.equal(percentileRank(9, arr, true), 85)     // supera a 8 de 10 (+medio empate)
  assert.equal(percentileRank(2, arr, false), 85)    // menor es mejor: bate a los mayores
})

test('percentileRank — muestra insuficiente → null', () => {
  assert.equal(percentileRank(5, [1, 2, 3], true), null)
})

test('buildSectorPositioning — solo métricas con dato y percentil', () => {
  const peers = Array.from({ length: 10 }, (_, i) => ({ roic: i + 1, payout: 100 - i * 5 }))
  const pos = buildSectorPositioning({ roic: 9, payout: 55, yield: null }, peers, 'Tecnología')
  const roic = pos.metrics.find(m => m.key === 'roic')
  assert.ok(roic && roic.percentile >= 80)
  assert.equal(roic.top, 100 - roic.percentile)
  assert.ok(!pos.metrics.find(m => m.key === 'yield'))   // sin dato → no aparece
})

// ── Resiliencia del dividendo ─────────────────────────────────────────────
const koLike = [
  { year: 2006, dps: 1.24 }, { year: 2007, dps: 1.36 }, { year: 2008, dps: 1.52 },
  { year: 2009, dps: 1.64 }, { year: 2010, dps: 1.76 },
  { year: 2019, dps: 1.60 }, { year: 2020, dps: 1.64 }, { year: 2021, dps: 1.68 },
]
test('dividendResilience — aristócrata que sube en 2008 y 2020 → raised', () => {
  const r = dividendResilience(koLike)
  assert.ok(r.available)
  const c08 = r.crises.find(c => c.key === '2008')
  assert.equal(c08.outcome, 'raised')
  const c20 = r.crises.find(c => c.key === '2020')
  assert.equal(c20.outcome, 'raised')
  assert.equal(r.survived, r.total)
})

test('dividendResilience — recorte en la ventana → cut', () => {
  const cut = [{ year: 2019, dps: 2.0 }, { year: 2020, dps: 1.0 }, { year: 2021, dps: 1.0 }]
  const c = dividendResilience(cut).crises.find(x => x.key === '2020')
  assert.equal(c.outcome, 'cut')
})

test('dividendResilience — sin dividendo antes de la crisis se omite', () => {
  const r = dividendResilience([{ year: 2015, dps: 0.5 }, { year: 2020, dps: 0.6 }, { year: 2021, dps: 0.7 }])
  assert.ok(!r.crises.find(c => c.key === '2008'))   // no existía dividendo en 2007
})
