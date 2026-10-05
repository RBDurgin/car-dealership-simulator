import type { Rng } from './rng'

/**
 * Kinds of customer. Each bends the traits `generateCustomer` rolls (how many
 * cars they look at, how long they'll wait, how much they'll spend) and how
 * readily they say yes, so a day's visitors don't all play the same.
 */
export type Archetype = 'regular' | 'tire-kicker' | 'decisive' | 'bargain' | 'couple'

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
    hint: 'Shopping together',
  },
}

const ALL = Object.keys(ARCHETYPES) as Archetype[]

/** A random archetype, weighted by `ARCHETYPES[a].weight`. */
export function pickArchetype(rng: Rng): Archetype {
  let r = rng.next() * ALL.reduce((sum, a) => sum + ARCHETYPES[a].weight, 0)
  for (const a of ALL) {
    r -= ARCHETYPES[a].weight
    if (r < 0) return a
  }
  return ALL[ALL.length - 1]
}
