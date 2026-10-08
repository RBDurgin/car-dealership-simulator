import { describe, expect, it } from 'vitest'
import {
  ARCHETYPES,
  combineSkews,
  NO_USED_STOCK_SKEW,
  pickArchetype,
  usedStockSkew,
  type Archetype,
} from './archetypes'
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

describe('used stock skew', () => {
  it('thins out used-car shoppers only while no used car is for sale', () => {
    expect(usedStockSkew([{ used: null }])).toEqual({ 'used-shopper': NO_USED_STOCK_SKEW })
    expect(usedStockSkew([])).toEqual({ 'used-shopper': NO_USED_STOCK_SKEW })
    expect(usedStockSkew([{ used: null }, { used: {} }])).toEqual({})
  })

  it('multiplies two skews together', () => {
    expect(combineSkews({ bargain: 2, regular: 1.5 }, { bargain: 3, 'used-shopper': 0.2 })).toEqual(
      {
        bargain: 6,
        regular: 1.5,
        'used-shopper': 0.2,
      },
    )
    expect(combineSkews({}, {})).toEqual({})
  })
})
