import { test } from 'node:test'
import assert from 'node:assert/strict'
import { businessGrowth } from '../lib/valuation.js'

// Sin estados anuales en el objeto → adjustedCagr cae a los CAGR precalculados (revenue_cagr5/
// fcf_cagr5), que es justo lo que queremos ejercitar aquí.

test('businessGrowth — suelo: ingresos crecen y FCF CAGR negativo NO da crecimiento negativo (Apple)', () => {
  const g = businessGrowth({ revenue_cagr5: 1.81, fcf_cagr5: -3.95 })
  assert.ok(g.gPct >= 0, `esperado >=0, fue ${g.gPct}`)   // antes: media −1,07% → colapso del DCF
})

test('businessGrowth — momentum reciente eleva el crecimiento (mezcla 50%)', () => {
  const g = businessGrowth({ revenue_cagr5: 1.81, fcf_cagr5: -3.95, _recentRevYoY: 16.6 })
  // media (floored 0) 0.5 + min(16.6,15) 0.5 ... la media base es −1,07 antes del suelo:
  // (-1.07*0.5 + 15*0.5) = 6.965, luego suelo no aplica (ya positivo)
  assert.ok(Math.abs(g.gPct - 6.965) < 0.05, `fue ${g.gPct}`)
  assert.ok(g.source.includes('+reciente'))
})

test('businessGrowth — recorta el momentum reciente a ±15%', () => {
  const g = businessGrowth({ revenue_cagr5: 5, fcf_cagr5: 5, _recentRevYoY: 40 })
  // (5*0.5 + 15*0.5) = 10 (no 22.5)
  assert.ok(Math.abs(g.gPct - 10) < 0.05, `fue ${g.gPct}`)
})

test('businessGrowth — divergencia fuerte FCF↔ingresos sigue usando ingresos (KO)', () => {
  const g = businessGrowth({ revenue_cagr5: 3.7, fcf_cagr5: -17.8 })
  assert.equal(g.source, 'revenue_cagr5_divergencia_fcf')
  assert.ok(g.gPct >= 0)
})

test('businessGrowth — empresa en declive real (ingresos negativos) puede quedar negativa', () => {
  const g = businessGrowth({ revenue_cagr5: -4, fcf_cagr5: -6 })
  assert.ok(g.gPct < 0)   // sin señal de crecimiento no se aplica el suelo
})
