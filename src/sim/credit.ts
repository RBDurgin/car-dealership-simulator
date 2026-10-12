import { ARCHETYPES, type Archetype } from './archetypes'
import type { Rng } from './rng'

/**
 * A buyer's credit: whether they pay cash or finance, how good their credit
 * is and what they bring as a down payment. Rolled for every shopper on its
 * own rng (`assignCredit`), so the rest of the day plays as before.
 */

/** A is the best credit, D the worst. */
export type CreditTier = 'A' | 'B' | 'C' | 'D'

export const CREDIT_TIERS: readonly CreditTier[] = ['A', 'B', 'C', 'D']

export interface Credit {
  tier: CreditTier
  /** True for a buyer who takes a loan; false for one paying cash. */
  finance: boolean
  /** The share of the price they bring as a down payment, 0 to `MAX_DOWN`. 0 for cash buyers. */
  down: number
}

/** An archetype's odds of each tier, and the share of them who finance. */
export interface CreditTraits {
  tiers: Record<CreditTier, number>
  finance: number
}

/** The most a financed buyer brings down on their own, as a share of the price. */
export const MAX_DOWN = 0.2

/**
 * How far `Tuning.creditMix` leans the tiers: each step better is
 * `exp(mix × MIX_STEP)` likelier, so a positive mix favours A and a
 * negative one D. 0 leaves the archetype's odds as they are.
 */
const MIX_STEP = 1

/** Each tier's odds for `traits`, leaned by `mix` (see `MIX_STEP`). */
export function tierWeights(traits: CreditTraits, mix = 0): Record<CreditTier, number> {
  const out = {} as Record<CreditTier, number>
  const mid = (CREDIT_TIERS.length - 1) / 2
  CREDIT_TIERS.forEach((t, i) => {
    out[t] = traits.tiers[t] * Math.exp(mix * MIX_STEP * (mid - i))
  })
  return out
}

/**
 * A buyer's credit, by their archetype's odds, with the tiers leaned by
 * `mix` (`Tuning.creditMix`). Always draws three numbers, so a change of
 * odds doesn't shift the rolls after it.
 */
export function rollCredit(archetype: Archetype, rng: Rng, mix = 0): Credit {
  const traits = ARCHETYPES[archetype].credit
  const finance = rng.next() < traits.finance
  const weights = tierWeights(traits, mix)
  let r = rng.next() * CREDIT_TIERS.reduce((sum, t) => sum + weights[t], 0)
  let tier: CreditTier = CREDIT_TIERS[CREDIT_TIERS.length - 1]
  for (const t of CREDIT_TIERS) {
    r -= weights[t]
    if (r < 0) {
      tier = t
      break
    }
  }
  const down = Math.round(rng.next() * MAX_DOWN * 100) / 100
  return { tier, finance, down: finance ? down : 0 }
}

/**
 * Gives each shopper in `arrived` their credit. Sellers and service clients
 * aren't buying, and keep none.
 */
export function assignCredit<
  C extends { archetype: Archetype; credit: Credit | null; selling: unknown; service: unknown },
>(arrived: readonly C[], rng: Rng, mix = 0): C[] {
  return arrived.map((c) =>
    c.selling || c.service ? c : { ...c, credit: rollCredit(c.archetype, rng, mix) },
  )
}

/** "Paying cash" or "Financing, tier B, 10% down", for the customer panel. */
export function creditLine(credit: Credit): string {
  if (!credit.finance) return 'Paying cash'
  const down = credit.down > 0 ? `, ${Math.round(credit.down * 100)}% down` : ''
  return `Financing, tier ${credit.tier}${down}`
}
