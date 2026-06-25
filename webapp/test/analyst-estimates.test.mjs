import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toFmpSymbol, extractRealHistory, buildEstimateSeries } from '../lib/analyst-estimates.js'

test('toFmpSymbol — acción US sin sufijo pasa tal cual', () => {
  assert.equal(toFmpSymbol('AAPL'), 'AAPL')
  assert.equal(toFmpSymbol('aapl'), 'AAPL')
})

test('toFmpSymbol — sufijos europeos coincidentes se mantienen', () => {
  assert.equal(toFmpSymbol('MUV2.DE'), 'MUV2.DE')
  assert.equal(toFmpSymbol('OR.PA'), 'OR.PA')
  assert.equal(toFmpSymbol('ULVR.L'), 'ULVR.L')
})

test('toFmpSymbol — vacío → null', () => {
  assert.equal(toFmpSymbol(''), null)
  assert.equal(toFmpSymbol(null), null)
})

test('extractRealHistory — lee ingresos y BPA (claves español/inglés)', () => {
  const isa = {
    columns: ['2025-12-31', '2024-12-31', '2023-12-31'],
    data: {
      'Total Revenue': [120, 110, 100],
      'BPA Diluido': [5.2, 4.8, 4.0],
    },
  }
  const rows = extractRealHistory(isa)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], { year: 2025, revenue: 120, eps: 5.2 })
  assert.deepEqual(rows[2], { year: 2023, revenue: 100, eps: 4.0 })
})

test('extractRealHistory — datos ausentes → []', () => {
  assert.deepEqual(extractRealHistory(null), [])
  assert.deepEqual(extractRealHistory({ columns: [] }), [])
})

test('buildEstimateSeries — continuo real→estimado con YoY de ingresos', () => {
  const real = [
    { year: 2022, revenue: 100, eps: 4.0 },
    { year: 2023, revenue: 110, eps: 4.4 },
    { year: 2024, revenue: 120, eps: 4.8 },
  ]
  const est = [
    { year: 2024, revenue: 119, eps: 4.7 },   // año ya cerrado → se descarta
    { year: 2025, revenue: 132, eps: 5.3 },
    { year: 2026, revenue: 145, eps: 5.9 },
  ]
  const series = buildEstimateSeries(real, est)
  // 3 reales + 2 estimados (2024 estimado descartado por no ser posterior al último real)
  assert.equal(series.length, 5)
  assert.equal(series[0].year, 2022)
  assert.equal(series[0].actual, true)
  assert.equal(series[3].year, 2025)
  assert.equal(series[3].actual, false)
  assert.equal(series[4].year, 2026)
  // YoY del primer estimado: 132 vs 120 (último real) = +10%
  assert.ok(Math.abs(series[3].revenueGrowth - 0.10) < 1e-9)
  // YoY del primer año mostrado (2022) no tiene anterior → null
  assert.equal(series[0].revenueGrowth, null)
  // YoY 2023 = 110/100 - 1 = +10%
  assert.ok(Math.abs(series[1].revenueGrowth - 0.10) < 1e-9)
})

test('buildEstimateSeries — recorta histórico a histYears manteniendo estimados', () => {
  const real = Array.from({ length: 8 }, (_, i) => ({ year: 2017 + i, revenue: 100 + i, eps: 1 + i }))
  const est = [{ year: 2025, revenue: 200, eps: 9 }, { year: 2026, revenue: 210, eps: 10 }]
  const series = buildEstimateSeries(real, est, { histYears: 4, estYears: 5 })
  const actuals = series.filter(r => r.actual)
  const ests = series.filter(r => !r.actual)
  assert.equal(actuals.length, 4)
  assert.equal(ests.length, 2)
  assert.equal(actuals[0].year, 2021)   // últimos 4 reales: 2021..2024
  assert.equal(actuals[3].year, 2024)
})

test('buildEstimateSeries — sin estimados devuelve solo reales', () => {
  const real = [{ year: 2023, revenue: 100, eps: 4 }, { year: 2024, revenue: 110, eps: 4.4 }]
  const series = buildEstimateSeries(real, null)
  assert.equal(series.length, 2)
  assert.ok(series.every(r => r.actual))
})
