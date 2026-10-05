import { describe, expect, it } from 'vitest'
import { ARCHETYPES, pickArchetype, type Archetype } from './archetypes'
import { createRng } from './rng'

describe('pickArchetype', () => {
  it('picks each archetype about as often as its weight says', () => {
    const rng = createRng(1)
    const n = 5000
    const counts = new Map<Archetype, number>()
    for (let i = 0; i < n; i++) {
      const a = pickArchetype(rng)
      counts.set(a, (counts.get(a) ?? 0) + 1)
    }
    const total = Object.values(ARCHETYPES).reduce((sum, t) => sum + t.weight, 0)
    for (const [a, t] of Object.entries(ARCHETYPES)) {
      expect(counts.get(a as Archetype)! / n).toBeCloseTo(t.weight / total, 1)
    }
  })

  it('has sane traits', () => {
    for (const t of Object.values(ARCHETYPES)) {
      expect(t.browse.min).toBeGreaterThanOrEqual(1)
      expect(t.browse.max).toBeGreaterThanOrEqual(t.browse.min)
      expect(t.budget.max).toBeGreaterThan(t.budget.min)
      expect(t.patience).toBeGreaterThan(0)
      expect(t.linger).toBeGreaterThan(0)
      expect(t.hint).not.toBe('')
    }
    expect(ARCHETYPES['tire-kicker'].accept).toBeLessThan(0)
    expect(ARCHETYPES.decisive.accept).toBeGreaterThan(0)
    expect(ARCHETYPES.bargain.budget.max).toBeLessThan(ARCHETYPES.regular.budget.max)
  })
})
