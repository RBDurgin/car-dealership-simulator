/** Seeded PRNG so generated content (prices, customers, decisions) is reproducible in tests. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

/** mulberry32: tiny, fast and good enough for gameplay randomness. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  }
}
