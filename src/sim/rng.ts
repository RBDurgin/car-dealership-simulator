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

/** FNV-1a hash of a string, for seeding an rng from an id. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}
