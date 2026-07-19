import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestByYear, extendStatement, extendStatements } from '../lib/financial-history-merge.js'

test('bestByYear escoge la fuente de mayor prioridad (yfinance>sec_edgar>stockanalysis)', () => {
  const rows = [
    { fiscal_year: 2015, source: 'stockanalysis', revenue: 100 },
    { fiscal_year: 2015, source: 'sec_edgar', revenue: 110 },
    { fiscal_year: 2010, source: 'macrotrends', revenue: 50 },
  ]
  const by = bestByYear(rows)
  assert.equal(by[2015].revenue, 110)   // sec_edgar gana a stockanalysis
  assert.equal(by[2010].revenue, 50)
})

test('extendStatement añade años antiguos y NO pisa los de yfinance', () => {
  const yf = { columns: ['2024-12-31', '2023-12-31'], data: { 'Total Revenue': [200, 190] } }
  const by = {
    2023: { fiscal_year: 2023, revenue: 999 },   // solapa con yfinance → NO se usa
    2020: { fiscal_year: 2020, revenue: 150 },
    2019: { fiscal_year: 2019, revenue: 140 },
  }
  const out = extendStatement(yf, by, { revenue: 'Total Revenue' })
  assert.deepEqual(out.columns, ['2024-12-31', '2023-12-31', '2020-12-31', '2019-12-31'])
  assert.deepEqual(out.data['Total Revenue'], [200, 190, 150, 140])   // yfinance 190 intacto en 2023
})

test('extendStatement alinea todas las filas (rellena null donde no hay dato)', () => {
  const yf = { columns: ['2024-12-31'], data: { 'Total Revenue': [200], 'EBITDA': [80] } }
  const out = extendStatement(yf, { 2018: { fiscal_year: 2018, revenue: 120 } }, { revenue: 'Total Revenue' })
  assert.equal(out.data['Total Revenue'].length, out.columns.length)
  assert.equal(out.data['EBITDA'].length, out.columns.length)
  assert.equal(out.data['EBITDA'][1], null)   // 2018 sin EBITDA
})

test('sin historial devuelve los estados de yfinance intactos', () => {
  const detail = { income_statement_annual: { columns: ['2024-12-31'], data: { 'Total Revenue': [1] } } }
  const r = extendStatements(detail, [])
  assert.equal(r.extraYears, 0)
  assert.equal(r.income, detail.income_statement_annual)
})
