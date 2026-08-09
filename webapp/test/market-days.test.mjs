import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expectedCloseDate, isPriceFresh, shouldReplacePrice } from '../lib/market-days.js'

const at = iso => new Date(iso)

test('durante la sesión, el cierre vigente es el del día hábil anterior', () => {
  // Miércoles 12:00 UTC → el cierre de hoy aún no existe.
  assert.equal(expectedCloseDate(at('2026-08-12T12:00:00Z')), '2026-08-11')
  // Miércoles 21:00 UTC: el mercado americano no ha cerrado todavía.
  assert.equal(expectedCloseDate(at('2026-08-12T21:00:00Z')), '2026-08-11')
})

test('tras el cierre americano (22:00 UTC) ya se espera el cierre de hoy', () => {
  assert.equal(expectedCloseDate(at('2026-08-12T22:00:00Z')), '2026-08-12')
  assert.equal(expectedCloseDate(at('2026-08-12T23:30:00Z')), '2026-08-12')
})

test('fines de semana: se retrocede al viernes', () => {
  assert.equal(expectedCloseDate(at('2026-08-08T12:00:00Z')), '2026-08-07')  // sábado
  assert.equal(expectedCloseDate(at('2026-08-09T12:00:00Z')), '2026-08-07')  // domingo
  assert.equal(expectedCloseDate(at('2026-08-10T12:00:00Z')), '2026-08-07')  // lunes de día
  assert.equal(expectedCloseDate(at('2026-08-09T23:00:00Z')), '2026-08-07')  // domingo noche
})

test('isPriceFresh: el precio del lunes ya NO vale el miércoles', () => {
  const mier = at('2026-08-12T12:00:00Z')          // espera cierre del 11 (martes)
  assert.equal(isPriceFresh('2026-08-11', mier), true)
  assert.equal(isPriceFresh('2026-08-10', mier), false)   // antes se daba por bueno
  assert.equal(isPriceFresh(null, mier), false)
})

test('shouldReplacePrice: un cierre viejo no pisa un precio más nuevo', () => {
  const viejo = { price: 10, date: '2026-07-29', fresh: false }
  // El scrape semanal es del 9 de agosto → gana el nuestro.
  assert.equal(shouldReplacePrice(viejo, '2026-08-09T08:50:00Z'), false)
  // Si lo que teníamos es más antiguo que el cierre, sí se sustituye.
  assert.equal(shouldReplacePrice(viejo, '2026-07-20T08:50:00Z'), true)
})

test('shouldReplacePrice: el cierre al día siempre gana', () => {
  const fresco = { price: 11, date: '2026-08-07', fresh: true }
  assert.equal(shouldReplacePrice(fresco, '2026-08-09T08:50:00Z'), true)
})

test('shouldReplacePrice: sin precio no se toca nada', () => {
  assert.equal(shouldReplacePrice(null, '2026-08-09'), false)
  assert.equal(shouldReplacePrice({ price: null, date: '2026-08-07' }, '2026-08-09'), false)
})
