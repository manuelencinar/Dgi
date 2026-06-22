import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dividendSafety, safetyGrade } from '../lib/dividend-safety.js'

const raises = years => years.map((g, i) => ({ year: 2021 + i, growth: g, isPartial: false }))

test('dividendSafety — aristócrata sólido puntúa alto', () => {
  const r = dividendSafety({
    payout_fcf: 45, net_debt_ebitda: 1.0, interest_coverage: 15,
    div_streak: 30, div_history: raises([5, 6, 7]),
  }, 'general')
  assert.equal(r.available, true)
  assert.ok(r.score >= 85, `score ${r.score}`)
  assert.equal(r.grade, 'Muy seguro')
  assert.equal(r.factors.length, 4)
})

test('dividendSafety — payout insostenible + deuda + recortes puntúa bajo', () => {
  const r = dividendSafety({
    payout_fcf: 110, net_debt_ebitda: 6, interest_coverage: 2,
    div_streak: 0, div_history: [
      { year: 2023, growth: -5, isPartial: false },
      { year: 2024, growth: -3, isPartial: false },
    ],
  }, 'general')
  assert.equal(r.available, true)
  assert.ok(r.score < 40, `score ${r.score}`)
  assert.ok(['En riesgo', 'Peligro'].includes(r.grade))
})

test('dividendSafety — REIT tolera payout alto (banda por sector)', () => {
  const data = { payout_fcf: 80, net_debt_ebitda: 5, interest_coverage: 4, div_streak: 12, div_history: raises([3, 3, 4]) }
  const reit = dividendSafety(data, 'reit').score
  const general = dividendSafety(data, 'general').score
  assert.ok(reit > general, `reit ${reit} debería superar a general ${general}`)
})

test('dividendSafety — sin datos suficientes → no disponible', () => {
  assert.equal(dividendSafety({}).available, false)
  assert.equal(dividendSafety(null).available, false)
})

test('safetyGrade — umbrales', () => {
  assert.equal(safetyGrade(90).grade, 'Muy seguro')
  assert.equal(safetyGrade(75).grade, 'Seguro')
  assert.equal(safetyGrade(55).grade, 'Vigilar')
  assert.equal(safetyGrade(35).grade, 'En riesgo')
  assert.equal(safetyGrade(20).grade, 'Peligro')
})
