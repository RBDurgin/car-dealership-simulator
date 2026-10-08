import type { Rng } from './rng'

/**
 * Kinds of customer. Each bends the traits `generateCustomer` rolls (how many
 * cars they look at, how long they'll wait, how much they'll spend) and how
 * readily they say yes, so a day's visitors don't all play the same.
 */
export type Archetype =
  | 'regular'
  | 'tire-kicker'
  | 'decisive'
  | 'bargain'
  | 'couple'
  /** After a used car: a smaller budget and a wider taste in models. */
  | 'used-shopper'

export interface ArchetypeTraits {
  /** Relative odds of a new customer being this kind. */
  weight: number
  /** How many cars they plan to look at (fewer if there aren't that many for sale). */
  browse: { min: number; max: number }
  /** Multiplier on their patience. */
  patience: number
  /** Budget is the priciest preferred model's base price times a factor in this range. */
  budget: { min: number; max: number }
  /** Added to their chance of accepting an offer. */
  accept: number
  /** Multiplier on how long they look each car over. */
  linger: number
  /**
   * How they haggle: the fraction off MSRP they hope to pay, and how many asks
   * they'll hear (they counter all but the last; see `respondToAsk`).
   */
  haggle: { expect: number; rounds: number }
  /**
   * × a used car's odds of being in their browse, against a new one's 1. Zero
   * and they never browse used cars.
   */
  usedWeight: number
  /** How many body types they're shopping for, at most. */
  models: number
  /** What the player learns about them on greeting. */
  hint: string
}

/** How far a customer's haggle `expect` strays either side of their archetype's. */
export const EXPECT_JITTER = 0.02

export const ARCHETYPES: Record<Archetype, ArchetypeTraits> = {
  regular: {
    weight: 40,
    browse: { min: 1, max: 3 },
    patience: 1,
    budget: { min: 0.85, max: 1.3 },
    accept: 0,
    linger: 1,
    haggle: { expect: 0.04, rounds: 3 },
    usedWeight: 0.5,
    models: 2,
    hint: 'Shopping around',
  },
  'tire-kicker': {
    weight: 15,
    browse: { min: 3, max: 5 },
    patience: 1.25,
    budget: { min: 0.85, max: 1.3 },
    accept: -0.35,
    linger: 1.2,
    haggle: { expect: 0.06, rounds: 2 },
    usedWeight: 0,
    models: 2,
    hint: 'Just looking',
  },
  decisive: {
    weight: 15,
    browse: { min: 1, max: 1 },
    patience: 0.5,
    budget: { min: 0.95, max: 1.3 },
    accept: 0.15,
    linger: 0.6,
    haggle: { expect: 0.02, rounds: 2 },
    usedWeight: 0,
    models: 2,
    hint: 'Knows what they want',
  },
  bargain: {
    weight: 15,
    browse: { min: 1, max: 3 },
    patience: 1,
    budget: { min: 0.7, max: 0.95 },
    accept: 0,
    linger: 1,
    haggle: { expect: 0.08, rounds: 4 },
    usedWeight: 1,
    models: 2,
    hint: 'Watching every dollar',
  },
  couple: {
    weight: 15,
    browse: { min: 2, max: 3 },
    patience: 1,
    budget: { min: 0.85, max: 1.3 },
    accept: 0,
    linger: 1.3,
    haggle: { expect: 0.05, rounds: 3 },
    usedWeight: 0,
    models: 2,
    hint: 'Shopping together',
  },
  'used-shopper': {
    weight: 25,
    browse: { min: 2, max: 4 },
    patience: 1,
    budget: { min: 0.45, max: 0.6 },
    accept: 0,
    linger: 1,
    haggle: { expect: 0.06, rounds: 4 },
    usedWeight: 4,
    models: 3,
    hint: 'After a good used car',
  },
}

const ALL = Object.keys(ARCHETYPES) as Archetype[]

/**
 * With no used car for sale, used-car shoppers come this many times as often
 * (`usedStockSkew`): a few still look in, but most stay away until there's
 * used stock.
 */
export const NO_USED_STOCK_SKEW = 0.2

/** The archetype skew from what's for sale: fewer used-car shoppers with no used stock. */
export function usedStockSkew(
  available: readonly { used: unknown }[],
): Partial<Record<Archetype, number>> {
  return available.some((c) => c.used) ? {} : { 'used-shopper': NO_USED_STOCK_SKEW }
}

/** Two skews in one: each archetype's multipliers multiplied together. */
export function combineSkews(
  a: Partial<Record<Archetype, number>>,
  b: Partial<Record<Archetype, number>>,
): Partial<Record<Archetype, number>> {
  const out = { ...a }
  for (const k of Object.keys(b) as Archetype[]) out[k] = (out[k] ?? 1) * b[k]!
  return out
}

/**
 * A random archetype, weighted by `weights` (an ad's skew, see
 * `sourceWeights`) or by default `ARCHETYPES[a].weight`.
 */
export function pickArchetype(rng: Rng, weights?: Record<Archetype, number>): Archetype {
  const weight = (a: Archetype) => weights?.[a] ?? ARCHETYPES[a].weight
  let r = rng.next() * ALL.reduce((sum, a) => sum + weight(a), 0)
  for (const a of ALL) {
    r -= weight(a)
    if (r < 0) return a
  }
  return ALL[ALL.length - 1]
}

/**
 * `weights` (or the usual odds) with each archetype's multiplied by `skew`,
 * e.g. a sale weekend's lean toward bargain hunters.
 */
export function skewWeights(
  skew: Partial<Record<Archetype, number>>,
  weights?: Record<Archetype, number>,
): Record<Archetype, number> {
  const out = {} as Record<Archetype, number>
  for (const a of ALL) out[a] = (weights?.[a] ?? ARCHETYPES[a].weight) * (skew[a] ?? 1)
  return out
}
