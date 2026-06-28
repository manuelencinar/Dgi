import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMilestones, newlyReached, tierLabel, MILESTONE_GROUPS } from '../lib/milestones.js'

test('computeMilestones — nivel actual, siguiente y progreso', () => {
  const { groups, reachedIds } = computeMilestones({ value: 12000, income: 600, freedom: 30, companies: 8 })
  const val = groups.find(g => g.key === 'value')
  assert.equal(val.current, 10000)
  assert.equal(val.next, 25000)
  assert.equal(val.reachedCount, 3)                 // 1k, 5k, 10k
  assert.ok(Math.abs(val.progress - (2000 / 15000)) < 1e-9)
  assert.equal(val.remaining, 13000)
  assert.ok(reachedIds.includes('value:10000'))
  assert.ok(reachedIds.includes('income:500'))
  assert.ok(reachedIds.includes('freedom:25'))
  assert.ok(reachedIds.includes('companies:5'))
})

test('computeMilestones — cartera vacía no alcanza nada', () => {
  const { groups, reachedIds } = computeMilestones({ value: 0, income: 0, freedom: null, companies: 0 })
  assert.equal(reachedIds.length, 0)
  assert.equal(groups.find(g => g.key === 'value').current, null)
  assert.equal(groups.find(g => g.key === 'value').next, 1000)
})

test('newlyReached — celebra el hito nuevo más relevante', () => {
  const { reachedIds } = computeMilestones({ value: 12000, income: 600, freedom: 30, companies: 8 })
  // Visto todo menos los de 10k de patrimonio y 25% de libertad → gana patrimonio (peso mayor)
  const seen = reachedIds.filter(id => id !== 'value:10000' && id !== 'freedom:25')
  const fresh = newlyReached(reachedIds, seen)
  assert.equal(fresh.id, 'value:10000')
  assert.ok(/10.?000/.test(fresh.message))
})

test('newlyReached — sin novedad devuelve null', () => {
  const { reachedIds } = computeMilestones({ value: 3000, income: 0, freedom: null, companies: 0 })
  assert.equal(newlyReached(reachedIds, reachedIds), null)
})

test('tierLabel — formato por tipo', () => {
  const eur = MILESTONE_GROUPS.find(g => g.key === 'value')
  const pct = MILESTONE_GROUPS.find(g => g.key === 'freedom')
  assert.ok(tierLabel(eur, 10000).includes('€'))
  assert.equal(tierLabel(pct, 50), '50%')
})
