import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQuarterlyNews, daysSince, splitFeatured } from '../lib/novedades.js'

test('parseQuarterlyNews — YoY contra el mismo trimestre del año anterior', () => {
  const q = {
    columns: ['2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31'],
    data: {
      'Total Revenue': [110, 105, 100, 98, 100],   // 110 vs 100 hace un año → +10%
      'Net Income': [22, 20, 18, 17, 20],           // 22 vs 20 → +10%
    },
  }
  const r = parseQuarterlyNews(q)
  assert.equal(r.latestDate, '2026-03-31')
  assert.ok(Math.abs(r.revYoY - 10) < 1e-9)
  assert.ok(Math.abs(r.incYoY - 10) < 1e-9)
  assert.equal(r.revSeries.length, 5)
  assert.equal(r.revSeries[r.revSeries.length - 1].val, 110)  // último = más reciente (reordenado asc)
})

test('parseQuarterlyNews — sin 4 trimestres previos → YoY null', () => {
  const r = parseQuarterlyNews({ columns: ['2026-03-31', '2025-12-31'], data: { 'Ingresos': [110, 105] } })
  assert.equal(r.revYoY, null)
})

test('parseQuarterlyNews — datos vacíos → null', () => {
  assert.equal(parseQuarterlyNews(null), null)
  assert.equal(parseQuarterlyNews({ columns: [] }), null)
})

test('daysSince', () => {
  assert.equal(daysSince(null), null)
  const d = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
  assert.ok(Math.abs(daysSince(d) - 10) <= 1)
})

test('splitFeatured — mitad EE.UU. / mitad país del usuario', () => {
  const items = [
    { t: 'AAPL', cc: 'US' }, { t: 'MSFT', cc: 'US' }, { t: 'JNJ', cc: 'US' }, { t: 'KO', cc: 'US' },
    { t: 'ITX.MC', cc: 'ES' }, { t: 'IBE.MC', cc: 'ES' }, { t: 'SAN.MC', cc: 'ES' },
    { t: 'MC.PA', cc: 'FR' },
  ]
  const r = splitFeatured(items, 'ES', 6)
  assert.equal(r.length, 6)
  assert.equal(r.filter(x => x.cc === 'US').length, 3)   // mitad EE.UU.
  assert.ok(r.filter(x => x.cc === 'ES').length >= 3)     // resto del país del usuario
})

test('splitFeatured — usuario de EE.UU. → solo top por capitalización', () => {
  const items = [{ t: 'AAPL', cc: 'US' }, { t: 'MSFT', cc: 'US' }, { t: 'ITX.MC', cc: 'ES' }]
  const r = splitFeatured(items, 'US', 2)
  assert.deepEqual(r.map(x => x.t), ['AAPL', 'MSFT'])
})
