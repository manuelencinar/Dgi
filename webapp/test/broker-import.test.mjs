import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeDividend } from '../lib/broker-import.js'

// m: movimiento con shares, priceOrig (=dps), totalEur (=neto recibido)
const mov = (shares, dps, net) => ({ type: 'dividend', shares, priceOrig: dps, totalEur: net })

test('dividendo extranjero: la retención en ORIGEN es la estatutaria del país, no el resto', () => {
  // Munich Re (DE, 26,375%): bruto 48, neto 28,63 → retención total 19,37
  const r = computeDividend(mov(1, 48, 28.63), 'EUR', 'DE', null)
  assert.equal(r.divGross, 48)
  assert.ok(Math.abs(r.whOriginPct - 26.375) < 0.1, `origen ${r.whOriginPct} debe ~26,375%`)
  // destino = resto de la retención (parte española)
  assert.ok(Math.abs(r.whOrigin + r.whDest - 19.37) < 0.02)
})

test('override del usuario por bróker (FR 25%) manda sobre el default 12,8%', () => {
  // Sanofi con override FR=25: bruto 41,20, neto 25,04
  const r = computeDividend(mov(1, 41.2, 25.04), 'EUR', 'FR', { FR: 25 })
  assert.ok(Math.abs(r.whOriginPct - 25) < 0.1, `origen ${r.whOriginPct} debe 25% con override`)
})

test('acción nacional (ES): origen 0, toda la retención es española (destino)', () => {
  // Aena: bruto 32,70, neto 26,49 → retención 6,21 toda al destino
  const r = computeDividend(mov(1, 32.7, 26.49), 'EUR', 'ES', null)
  assert.equal(r.whOrigin, 0)
  assert.ok(Math.abs(r.whDest - 6.21) < 0.02)
})

test('origen se capa a la retención total observada (no la excede)', () => {
  // Si el bróker retuvo MENOS que el estatutario, origen no puede pasar del total
  const r = computeDividend(mov(1, 100, 90), 'EUR', 'DE', null)  // total 10 < 26,375
  assert.ok(r.whOrigin <= 10.01)
  assert.ok(r.whDest >= 0)
})
