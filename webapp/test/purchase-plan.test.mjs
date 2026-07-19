import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  entryMidPrice, entryShares, entryCostEUR, buildHypotheticalPositions,
  entriesWithinHorizon, monthsSinceNewPosition, positionWeights, equalWeightFit,
} from '../lib/purchase-plan.js'

test('entryMidPrice: punto medio del rango', () => {
  assert.equal(entryMidPrice({ price_min: 20, price_max: 22 }), 21)
  assert.equal(entryMidPrice({ price_min: 20 }), 20)
  assert.equal(entryMidPrice({}), null)
})

test('entryShares: directo o derivado del importe (EUR ÷ precio medio en EUR)', () => {
  assert.equal(entryShares({ shares: 10 }), 10)
  // 210€ / 21€ (EUR) = 10 acciones
  assert.equal(entryShares({ amount_eur: 210, price_min: 20, price_max: 22, currency: 'EUR' }), 10)
})

test('buildHypotheticalPositions: fusiona por ticker con precio medio ponderado', () => {
  const positions = [{ ticker: 'IBE.MC', shares: 100, avg_cost: 18, currency: 'EUR', asset_type: 'stock' }]
  const entries = [{ ticker: 'IBE.MC', shares: 100, price_min: 20, price_max: 22, currency: 'EUR', status: 'pending' }]
  const out = buildHypotheticalPositions(positions, entries)
  const ibe = out.find(p => p.ticker === 'IBE.MC')
  assert.equal(ibe.shares, 200)
  assert.equal(ibe.avg_cost, 19.5)   // (100×18 + 100×21)/200
})

test('buildHypotheticalPositions: abre posición nueva si el ticker no existe', () => {
  const out = buildHypotheticalPositions([], [{ ticker: 'ENG.MC', amount_eur: 200, price_min: 20, price_max: 20, currency: 'EUR', status: 'pending' }])
  const eng = out.find(p => p.ticker === 'ENG.MC')
  assert.equal(eng.shares, 10)       // 200/20
  assert.equal(eng.avg_cost, 20)
})

test('entriesWithinHorizon: filtra pendientes por fecha y ordena', () => {
  const today = new Date('2026-01-01')
  const entries = [
    { ticker: 'A', target_date: '2026-03-01', status: 'pending' },
    { ticker: 'B', target_date: '2026-11-01', status: 'pending' },   // fuera de 6m
    { ticker: 'C', target_date: '2026-02-01', status: 'executed' },  // no pendiente
  ]
  const r = entriesWithinHorizon(entries, 6, today)
  assert.deepEqual(r.map(e => e.ticker), ['A'])
})

test('monthsSinceNewPosition: meses desde la última primera-compra', () => {
  const today = new Date('2026-07-01')
  const txs = [
    { ticker: 'A', type: 'buy', date: '2026-01-01' },
    { ticker: 'A', type: 'buy', date: '2026-06-01' },   // no es nueva posición
    { ticker: 'B', type: 'buy', date: '2026-03-01' },   // última nueva
  ]
  assert.equal(monthsSinceNewPosition(txs, today), 4)   // marzo → julio ≈ 4 meses
})

test('equalWeightFit: bandas 4-6%', () => {
  assert.equal(equalWeightFit(3), 'under')
  assert.equal(equalWeightFit(5), 'ok')
  assert.equal(equalWeightFit(9), 'over')
})

test('positionWeights: % por posición ordenado', () => {
  const w = positionWeights([{ ticker: 'A', valueEUR: 300 }, { ticker: 'B', valueEUR: 100 }])
  assert.equal(w[0].ticker, 'A')
  assert.equal(w[0].pct, 75)
})
