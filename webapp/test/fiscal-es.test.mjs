import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  spanishSavingsTaxDue, spanishMarginalRate, spanishAvgRate,
  exemptionThreshold, childMinimum, resolveDestWHT, isExemptUser, PERSONAL_EXEMPTION,
} from '../lib/fiscal-es.js'

test('spanishSavingsTaxDue — escala progresiva del ahorro', () => {
  assert.equal(spanishSavingsTaxDue(0), 0)
  assert.equal(spanishSavingsTaxDue(6000), 1140)            // 6000·19%
  assert.equal(spanishSavingsTaxDue(10000), 1980)           // 6000·19% + 4000·21%
  assert.equal(spanishSavingsTaxDue(50000), 10380)          // 1140 + 44000·21%
})

test('spanishMarginalRate — tipo marginal por tramo', () => {
  assert.equal(spanishMarginalRate(5000), 19)
  assert.equal(spanishMarginalRate(6000), 19)
  assert.equal(spanishMarginalRate(6001), 21)
  assert.equal(spanishMarginalRate(60000), 23)
  assert.equal(spanishMarginalRate(500000), 30)
})

test('spanishAvgRate — tipo medio efectivo', () => {
  assert.equal(spanishAvgRate(0), 19)                       // base 0 → primer tramo
  assert.equal(spanishAvgRate(6000), 19)                    // 1140/6000
  assert.ok(Math.abs(spanishAvgRate(10000) - 19.8) < 1e-9)  // 1980/10000
})

test('childMinimum y exemptionThreshold', () => {
  assert.equal(childMinimum(0), 0)
  assert.equal(childMinimum(1), 2400)
  assert.equal(childMinimum(2), 5100)                       // 2400 + 2700
  assert.equal(childMinimum(3), 9100)                       // + 4000
  assert.equal(childMinimum(4), 13600)                      // + 4500
  assert.equal(exemptionThreshold(), PERSONAL_EXEMPTION)    // 17094
  assert.equal(exemptionThreshold({ children: 2 }), 17094 + 5100)
  assert.equal(exemptionThreshold({ children: 1, childrenUnder3: 1 }), 17094 + 2400 + 2800)
  // menores de 3 acotados al nº de hijos
  assert.equal(exemptionThreshold({ children: 0, childrenUnder3: 2 }), 17094)
})

test('resolveDestWHT — modo fijo', () => {
  assert.equal(resolveDestWHT(null), 19)                    // sin settings
  assert.equal(resolveDestWHT({ tax_mode: 'fixed', dest_wht: 15 }), 15)
  assert.equal(resolveDestWHT({ tax_mode: 'fixed', dest_wht: 99 }), 19)  // fuera de rango → 19
  assert.equal(resolveDestWHT({ tax_mode: 'fixed', dest_wht: 0 }), 0)
})

test('resolveDestWHT — modo por ingresos', () => {
  // ingresos por debajo del umbral → exento (0%)
  assert.equal(resolveDestWHT({ tax_mode: 'income', annual_income: 10000, children: 0 }), 0)
  // por encima del umbral → tipo medio del ahorro sobre la base de dividendos
  assert.equal(resolveDestWHT({ tax_mode: 'income', annual_income: 60000 }, 6000), 19)
})

test('isExemptUser', () => {
  assert.equal(isExemptUser({ tax_mode: 'income', annual_income: 10000 }), true)
  assert.equal(isExemptUser({ tax_mode: 'income', annual_income: 50000 }), false)
  assert.equal(isExemptUser({ tax_mode: 'fixed', dest_wht: 19 }), false)
  assert.equal(isExemptUser(null), false)
})
