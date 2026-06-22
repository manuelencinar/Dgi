import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dividendTier, dividendTierInfo, dividendTrend } from '../lib/helpers.js'

test('dividendTier — umbrales Rey/Aristócrata/Aspirante', () => {
  assert.equal(dividendTier(60), 'rey')
  assert.equal(dividendTier(50), 'rey')        // límite inferior Rey
  assert.equal(dividendTier(49), 'aristocrata')
  assert.equal(dividendTier(25), 'aristocrata') // límite inferior Aristócrata
  assert.equal(dividendTier(24), 'aspirante')
  assert.equal(dividendTier(10), 'aspirante')   // límite inferior Aspirante
  assert.equal(dividendTier(9), null)
  assert.equal(dividendTier(undefined), null)
  assert.equal(dividendTier('abc'), null)
})

test('dividendTierInfo — devuelve el objeto del nivel', () => {
  assert.equal(dividendTierInfo(60).emoji, '👑')
  assert.equal(dividendTierInfo(30).id, 'aristocrata')
  assert.equal(dividendTierInfo(5), null)
})

test('dividendTrend — racha rota por recortes recientes', () => {
  const hist = [
    { year: 2018, growth: 4, isPartial: false },
    { year: 2019, growth: 5, isPartial: false },
    { year: 2020, growth: -3, isPartial: false },
    { year: 2021, growth: -1, isPartial: false },
  ]
  const t = dividendTrend(hist)
  assert.equal(t.pos, 0)
  assert.equal(t.down, 2)        // 2 años seguidos recortando
  assert.equal(t.noRaise, 2)
  assert.equal(t.cuts10, 2)
  assert.equal(t.lastYear, 2021)
  assert.equal(t.n, 4)
})

test('dividendTrend — dividendo congelado (growth 0)', () => {
  const t = dividendTrend([
    { year: 2019, growth: 3, isPartial: false },
    { year: 2020, growth: 0, isPartial: false },
    { year: 2021, growth: 0, isPartial: false },
  ])
  assert.equal(t.pos, 0)
  assert.equal(t.down, 0)        // congelado no es recorte
  assert.equal(t.noRaise, 2)     // 2 años sin subir
  assert.equal(t.cuts10, 0)
})

test('dividendTrend — sin histórico suficiente → null', () => {
  assert.equal(dividendTrend(null), null)
  assert.equal(dividendTrend([]), null)
  assert.equal(dividendTrend([{ year: 2021, growth: 5, isPartial: false }]), null)
  // las parciales no cuentan
  assert.equal(dividendTrend([
    { year: 2020, growth: 5, isPartial: false },
    { year: 2021, growth: 6, isPartial: true },
  ]), null)
})
