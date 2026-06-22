import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateROIC } from '../lib/metrics.js'

// La rama "precalculado" (la que usa la app): roic_display = el MÁS BAJO de
// reported/tangible (decisión explícita del proyecto).
test('calculateROIC — adopta el ROIC más bajo (reported vs tangible)', () => {
  const r = calculateROIC({ roic_reported: 20, roic_tangible: 15 })
  assert.equal(r.roic_display, 15)
  assert.equal(r.roic_method, 'Precalculado')
  assert.equal(r.roic_not_applicable, false)
})

test('calculateROIC — normaliza roic_warning (nunca "false")', () => {
  // "false"/false → sin warning (arregla el bug "⚠ false")
  assert.equal(calculateROIC({ roic_reported: 80, roic_tangible: 80, roic_warning: 'false' }).roic_warning, null)
  assert.equal(calculateROIC({ roic_reported: 80, roic_tangible: 80, roic_warning: false }).roic_warning, null)
  // true → mensaje string
  const w = calculateROIC({ roic_reported: 80, roic_tangible: 80, roic_warning: true }).roic_warning
  assert.equal(typeof w, 'string')
  assert.ok(w.length > 10)
})

test('calculateROIC — banca/seguros no aplica → alternativa ROE', () => {
  const r = calculateROIC({ sector: 'Financial Services', industry: 'Banks - Diversified', roe: 12 })
  if (r.roic_not_applicable) {
    assert.equal(r.alternative_label, 'ROE')
    assert.equal(r.alternative_value, 12)
  }
})

test('calculateROIC — sin datos → no rompe', () => {
  assert.equal(calculateROIC(null).roic_display, null)
})
