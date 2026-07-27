import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVerdict, buildSingleVerdict } from '../lib/infografia-data.js'

const co = (name, score, mos, yvsavg, safety) => ({
  name, _score: score, _mos: mos, _yieldVsAvg: yvsavg, _safety: safety,
})

test('buildVerdict — gana la de mayor puntuación DGI y cita valoración/seguridad (solo datos)', () => {
  const v = buildVerdict([co('Coca-Cola', 7.3, 12, 8, 82), co('PepsiCo', 6.8, 4, -3, 74)])
  assert.equal(v.winner, 'Coca-Cola')
  assert.ok(v.lines[0].includes('7.3/10') && v.lines[0].includes('6.8/10'))
  assert.ok(v.lines.some(l => l.includes('12%') && l.includes('Coca-Cola')))   // más barata por MoS
  assert.ok(v.lines.some(l => l.includes('82/100') && l.includes('74/100')))   // seguridad
})

test('buildVerdict — null con menos de dos empresas con score', () => {
  assert.equal(buildVerdict([co('A', 7, 5, 1, 80)]), null)
  assert.equal(buildVerdict([co('A', null, 5, 1, 80), co('B', 6, 5, 1, 80)]), null)
})

test('buildVerdict — empate en score se declara empate', () => {
  const v = buildVerdict([co('A', 7, 2, 1, 70), co('B', 7, 8, 5, 90)])
  assert.ok(v.lines[0].toLowerCase().includes('empatan'))
})

test('buildSingleVerdict — banda de calidad + valoración vs intrínseco y media', () => {
  const v = buildSingleVerdict(co('Coca-Cola', 8.2, 15, 10, 85))
  assert.ok(v.lines[0].includes('8.2/10') && v.lines[0].includes('excelente'))
  assert.ok(v.lines.some(l => l.includes('15%') && l.includes('por debajo')))
  assert.ok(v.lines.some(l => l.includes('10%') && l.includes('por encima de su media')))
})

test('buildSingleVerdict — sobrevalorada: margen negativo se describe como por encima del valor', () => {
  const v = buildSingleVerdict(co('X', 5.5, -20, -5, 60))
  assert.ok(v.lines.some(l => l.includes('20%') && l.includes('por encima de su valor')))
})
