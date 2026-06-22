import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveDivTax, FOREIGN_CREDIT_CAP } from '../lib/screener.js'

// Doble imposición (ley española): el crédito por retención en origen se acredita
// solo hasta el 15% del bruto; el exceso no es deducible.
test('effectiveDivTax — acción extranjera con crédito acotado al 15%', () => {
  assert.equal(FOREIGN_CREDIT_CAP, 15)
  // origen 15, destino 19 → crédito 15 → total 19
  assert.equal(effectiveDivTax(15, 19), 19)
  // origen 25, destino 19 → crédito min(25,15,19)=15 → total 25+19-15 = 29
  assert.equal(effectiveDivTax(25, 19), 29)
  // origen 35 → crédito 15 → total 39 (el exceso sobre 15 NO se acredita)
  assert.equal(effectiveDivTax(35, 19), 39)
  // origen 10 (<15) → crédito 10 → total 19
  assert.equal(effectiveDivTax(10, 19), 19)
})

test('effectiveDivTax — sin retención en origen', () => {
  assert.equal(effectiveDivTax(0, 19), 19)
})

test('effectiveDivTax — acción nacional: solo impuesto de destino', () => {
  // isDomestic → se ignora el origen (no hay doble imposición)
  assert.equal(effectiveDivTax(15, 19, true), 19)
  assert.equal(effectiveDivTax(30, 21, true), 21)
})

test('effectiveDivTax — robustez ante negativos/null y tope 100', () => {
  assert.equal(effectiveDivTax(null, 19), 19)
  assert.equal(effectiveDivTax(-5, 19), 19)        // origen negativo → 0
  assert.equal(effectiveDivTax(90, 30), 100)       // tope al 100%
})
