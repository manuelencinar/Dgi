import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromHistoryRows, buildQuarterlyModel, labelOf } from '../lib/quarterly.js'

// 8 trimestres (2 años), ingresos crecen 10% YoY, cadencia regular.
const rows = [
  { period: '2024-03-31', revenue: 100, net_income: 10, operating_income: 20, eps_diluted: 1.0, operating_cash_flow: 15, capex: -5 },
  { period: '2024-06-30', revenue: 110, net_income: 11, operating_income: 22, eps_diluted: 1.1, operating_cash_flow: 16, capex: -5 },
  { period: '2024-09-30', revenue: 120, net_income: 12, operating_income: 24, eps_diluted: 1.2, operating_cash_flow: 17, capex: -5 },
  { period: '2024-12-31', revenue: 130, net_income: 13, operating_income: 26, eps_diluted: 1.3, operating_cash_flow: 18, capex: -5 },
  { period: '2025-03-31', revenue: 110, net_income: 12, operating_income: 24, eps_diluted: 1.1, operating_cash_flow: 17, capex: -5 },
  { period: '2025-06-30', revenue: 121, net_income: 13, operating_income: 26, eps_diluted: 1.21, operating_cash_flow: 18, capex: -5 },
  { period: '2025-09-30', revenue: 132, net_income: 14, operating_income: 28, eps_diluted: 1.32, operating_cash_flow: 19, capex: -5 },
  { period: '2025-12-31', revenue: 143, net_income: 15, operating_income: 30, eps_diluted: 1.43, operating_cash_flow: 20, capex: -5 },
]

test('fromHistoryRows — normaliza, ordena ascendente y calcula FCF de respaldo', () => {
  const qs = fromHistoryRows(rows)
  assert.equal(qs.length, 8)
  assert.equal(qs[0].period, '2024-03-31')
  assert.equal(qs[7].period, '2025-12-31')
  assert.equal(qs[0].fcf, 10)   // 15 − |−5|
})

test('buildQuarterlyModel — YoY empareja el mismo trimestre del año anterior', () => {
  const m = buildQuarterlyModel(fromHistoryRows(rows))
  assert.ok(m.available)
  const q1_2025 = m.quarters.find(q => q.period === '2025-03-31')
  assert.equal(Math.round(q1_2025.revenueYoY), 10)   // 110 vs 100
  const q4_2025 = m.quarters.find(q => q.period === '2025-12-31')
  assert.equal(Math.round(q4_2025.revenueYoY), 10)   // 143 vs 130
})

test('buildQuarterlyModel — TTM suma los últimos 4 y compara con los 4 previos', () => {
  const m = buildQuarterlyModel(fromHistoryRows(rows))
  assert.equal(m.ttm.revenue, 110 + 121 + 132 + 143)   // 506
  assert.equal(m.ttm.netIncome, 12 + 13 + 14 + 15)      // 54
  // TTM previo = 100+110+120+130 = 460 → YoY = (506−460)/460 = 10%
  assert.equal(Math.round(m.ttm.revenueYoY), 10)
})

test('buildQuarterlyModel — márgenes y resumen del último trimestre', () => {
  const m = buildQuarterlyModel(fromHistoryRows(rows))
  const last = m.latest
  assert.equal(last.period, '2025-12-31')
  assert.equal(Math.round(last.revenueYoY), 10)
  const q = m.quarters[m.quarters.length - 1]
  assert.equal(Math.round(q.netMargin), Math.round(15 / 143 * 100))
})

test('buildQuarterlyModel — serie corta no disponible', () => {
  assert.equal(buildQuarterlyModel(fromHistoryRows(rows.slice(0, 1))).available, false)
})

test('labelOf — fecha de cierre → Qn\'aa', () => {
  assert.equal(labelOf('2025-12-31'), "Q4'25")
  assert.equal(labelOf('2026-03-31'), "Q1'26")
})
