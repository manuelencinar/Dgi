import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeAutoDividends } from '../lib/dividends.js'

const TODAY = new Date('2026-01-15T12:00:00')

test('computeAutoDividends — genera importes con la posición actual aunque NO haya transacciones (fix "todo a 0")', () => {
  const out = computeAutoDividends({
    positions: [{ ticker: 'KO', shares: 100, avg_cost: 50, currency: 'USD', asset_type: 'stock' }],
    transactions: [],                          // sin histórico de operaciones
    fundamentals: { KO: { dps: 2.0, country: 'United States' } },
    config: { KO: { frequency: 4, months: [3, 6, 9, 12] } },
    destWHT: 19, today: TODAY,
  })
  assert.equal(out.length, 4)                  // 4 pagos trimestrales en 2026
  for (const r of out) {
    assert.equal(r.shares, 100)                // respaldo a la posición actual
    // 100 × (2.0/4) USD × 0.92 (FX estático de la cartera) = 46.00 €
    assert.ok(Math.abs(r.amount - 46) < 1e-9, `amount=${r.amount}`)
    assert.ok(r.amount > 0)                     // nunca 0
  }
})

test('computeAutoDividends — neto con doble imposición (crédito 15%), igual que la cartera', () => {
  const [r] = computeAutoDividends({
    positions: [{ ticker: 'KO', shares: 100, avg_cost: 50, currency: 'USD', asset_type: 'stock' }],
    transactions: [],
    fundamentals: { KO: { dps: 2.0, country: 'United States' } },
    config: { KO: { frequency: 4, months: [3, 6, 9, 12] } },
    destWHT: 19, today: TODAY,
  })
  assert.equal(r.withholding_origin_pct, 15)   // retención EE.UU.
  assert.equal(r.withholding_dest_pct, 4)      // 19% España − 15% acreditado = 4%
  // total efectivo 19% → neto 81% de 46 = 37.26
  assert.ok(Math.abs(r.amount_net - 37.26) < 1e-9, `net=${r.amount_net}`)
})

test('computeAutoDividends — acción española: solo impuesto español, sin destino adicional', () => {
  const [r] = computeAutoDividends({
    positions: [{ ticker: 'IBE.MC', shares: 200, avg_cost: 10, currency: 'EUR', asset_type: 'stock' }],
    transactions: [],
    fundamentals: { 'IBE.MC': { dps: 0.5, country: 'Spain' } },
    config: { 'IBE.MC': { frequency: 1, months: [6] } },
    destWHT: 19, today: TODAY,
  })
  assert.equal(r.withholding_origin_pct, 19)   // origen = impuesto español
  assert.equal(r.withholding_dest_pct, 0)      // sin destino adicional
  // 200 × 0.5 € = 100 bruto, neto 81 €
  assert.ok(Math.abs(r.amount - 100) < 1e-9, `amount=${r.amount}`)
  assert.ok(Math.abs(r.amount_net - 81) < 1e-9, `net=${r.amount_net}`)
})

test('computeAutoDividends — .L: el dividendo en peniques se pasa a libras y a EUR', () => {
  const [r] = computeAutoDividends({
    positions: [{ ticker: 'FOUR.L', shares: 10, avg_cost: 36, currency: 'GBP', asset_type: 'stock' }],
    transactions: [],
    fundamentals: { 'FOUR.L': { dps: 100, country: 'United Kingdom' } },  // 100 peniques/año
    config: { 'FOUR.L': { frequency: 1, months: [6] } },
    destWHT: 19, today: TODAY,
  })
  // 100 peniques → 1.00 £ → ×1.17 = 1.17 € por acción · 10 acciones = 11.70 €
  assert.ok(Math.abs(r.amount - 11.7) < 1e-9, `amount=${r.amount}`)
})
