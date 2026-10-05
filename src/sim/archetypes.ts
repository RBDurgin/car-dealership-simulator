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
  /** What the player learns about them on greeting. */
  hint: string
}

export const ARCHETYPES: Record<Archetype, ArchetypeTraits> = {
  regular: {
    weight: 40,
    browse: { min: 1, max: 3 },
    patience: 1,
    budget: { min: 0.85, max: 1.3 },
    accept: 0,
    linger: 1,
    hint: 'Shopping around',
  },
  'tire-kicker': {
    weight: 15,
    browse: { min: 3, max: 5 },
    patience: 1.25,
    budget: { min: 0.85, max: 1.3 },
    accept: -0.35,
    linger: 1.2,
    hint: 'Just looking',
  },
  decisive: {
    weight: 15,
    browse: { min: 1, max: 1 },
    patience: 0.5,
    budget: { min: 0.95, max: 1.3 },
    accept: 0.15,
    linger: 0.6,
    hint: 'Knows what they want',
  },
  bargain: {
    weight: 15,
    browse: { min: 1, max: 3 },
    patience: 1,
    budget: { min: 0.7, max: 0.95 },
    accept: 0,
    linger: 1,
    hint: 'Watching every dollar',
  },
  couple: {
    weight: 15,
    browse: { min: 2, max: 3 },
    patience: 1,
    budget: { min: 0.85, max: 1.3 },
    accept: 0,
    linger: 1.3,
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
