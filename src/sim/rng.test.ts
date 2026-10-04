import { describe, expect, it } from 'vitest'
import { createRng, hashSeed } from './rng'

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRng(123)
    const b = createRng(123)
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next())
    expect(createRng(124).next()).not.toBe(createRng(123).next())
  })

  it('stays in range', () => {
    const rng = createRng(9)
    for (let i = 0; i < 1000; i++) {
      const f = rng.next()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      const n = rng.int(3, 5)
      expect([3, 4, 5]).toContain(n)
    }
  })

  it('picks every item eventually', () => {
    const rng = createRng(1)
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(rng.pick(['a', 'b', 'c']))
    expect(seen).toEqual(new Set(['a', 'b', 'c']))
  })
})

describe('hashSeed', () => {
  it('is stable and spreads similar strings apart', () => {
    expect(hashSeed('customer-1')).toBe(hashSeed('customer-1'))
    expect(hashSeed('customer-1')).not.toBe(hashSeed('customer-2'))
    expect(Number.isInteger(hashSeed(''))).toBe(true)
    expect(hashSeed('abc')).toBeGreaterThanOrEqual(0)
  })
})
