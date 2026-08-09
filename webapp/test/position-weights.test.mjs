import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcPositionWeights } from '../lib/portfolio.js'

const p = (ticker, valueEUR, name = ticker) => ({ ticker, name, valueEUR })

test('reparte el 100% entre las posiciones, de mayor a menor', () => {
  const w = calcPositionWeights([p('A', 50), p('B', 30), p('C', 20)])
  assert.deepEqual(w.rows.map(r => r.ticker), ['A', 'B', 'C'])
  assert.equal(w.rows.reduce((s, r) => s + r.value, 0), 100)
  assert.equal(w.top1, 50)
  assert.equal(w.count, 3)
  assert.ok(Math.abs(w.equalWeight - 100 / 3) < 1e-9)
})

test('top5 suma las cinco mayores', () => {
  const w = calcPositionWeights([p('A', 30), p('B', 20), p('C', 15), p('D', 15), p('E', 10), p('F', 10)])
  assert.equal(w.top5, 90)
})

test('agrupa la cola en "Resto" sin perder porcentaje', () => {
  const positions = Array.from({ length: 20 }, (_, i) => p(`T${i}`, 20 - i))
  const w = calcPositionWeights(positions)
  assert.equal(w.rows.length, 12)                    // 11 individuales + Resto
  assert.equal(w.count, 20)                          // el conteo real no cambia
  assert.match(w.rows[11].name, /^Resto \(9 posiciones\)$/)
  assert.ok(Math.abs(w.rows.reduce((s, r) => s + r.value, 0) - 100) < 1e-9)
})

test('cartera vacía o sin valor → sin filas, sin dividir por cero', () => {
  assert.deepEqual(calcPositionWeights([]).rows, [])
  const sinPrecio = calcPositionWeights([{ ticker: 'A', name: 'A', valueEUR: null }])
  assert.deepEqual(sinPrecio.rows, [])
  assert.equal(sinPrecio.equalWeight, 0)
})

test('ignora las posiciones sin valor calculado', () => {
  const w = calcPositionWeights([p('A', 75), { ticker: 'B', name: 'B', valueEUR: null }, p('C', 25)])
  assert.deepEqual(w.rows.map(r => r.ticker), ['A', 'C'])
  assert.equal(w.count, 2)
})
