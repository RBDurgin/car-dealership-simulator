import { carName } from './interactables'
import type { CarModel } from './layout'
import { HOLDBACK_FLOOR, type QuotaResult } from './quota'

/**
 * The manufacturer's franchise tier. Every game starts at Bronze. A month
 * that meets the quota moves the dealership up a tier, and one that falls
 * under the holdback floor drops it a tier. A higher tier pays less for stock,
 * earns a bigger holdback and may order the manufacturer's top models.
 */

export type FranchiseTier = 'bronze' | 'silver' | 'gold'

/** From the bottom up. */
export const TIERS: readonly FranchiseTier[] = ['bronze', 'silver', 'gold']

export const START_TIER: FranchiseTier = 'bronze'

export interface TierPerks {
  name: string
  /** × each car's invoice. */
  invoice: number
  /** × the month-end holdback. */
  holdback: number
}

export const TIER_PERKS: Record<FranchiseTier, TierPerks> = {
  bronze: { name: 'Bronze', invoice: 1, holdback: 1 },
  silver: { name: 'Silver', invoice: 0.98, holdback: 1.25 },
  gold: { name: 'Gold', invoice: 0.96, holdback: 1.5 },
}

/** Models only a dealer at this tier or above may order. Any other model is open to all. */
export const MODEL_TIER: Partial<Record<CarModel, FranchiseTier>> = {
  'sedan-sports': 'silver',
  'suv-luxury': 'gold',
}

export function isFranchiseTier(v: unknown): v is FranchiseTier {
  return (TIERS as readonly unknown[]).includes(v)
}

export function tierName(tier: FranchiseTier): string {
  return TIER_PERKS[tier].name
}

const rank = (tier: FranchiseTier) => TIERS.indexOf(tier)

/** The tier needed to order `model`. */
export function modelTier(model: CarModel): FranchiseTier {
  return MODEL_TIER[model] ?? START_TIER
}

/** Whether a dealer at `tier` may order `model`. */
export function orderable(model: CarModel, tier: FranchiseTier): boolean {
  return rank(tier) >= rank(modelTier(model))
}

/** Why `model` can't be ordered at `tier`, or null if it can. */
export function lockedReason(model: CarModel, tier: FranchiseTier): string | null {
  return orderable(model, tier) ? null : `${tierName(modelTier(model))} dealers only.`
}

/**
 * The tier after a month that ended with `result`: up one for meeting the
 * target, down one for selling under the holdback floor, otherwise the same.
 * `slack` (the level's `franchiseSlack`) lowers the share a month must fall
 * under before the tier drops.
 */
export function nextTier(
  tier: FranchiseTier,
  result: Pick<QuotaResult, 'quota' | 'sold'>,
  slack = 0,
): FranchiseTier {
  const share = result.sold / result.quota
  const i = rank(tier)
  if (share >= 1) return TIERS[Math.min(i + 1, TIERS.length - 1)]
  if (share < HOLDBACK_FLOOR - slack) return TIERS[Math.max(i - 1, 0)]
  return tier
}

/** The morning's word on a tier change, or null if it didn't change. */
export function tierNotice(from: FranchiseTier, to: FranchiseTier): string | null {
  if (from === to) return null
  if (rank(to) < rank(from))
    return `You fell well short of the quota and dropped to ${tierName(to)}.`
  const models = Object.entries(MODEL_TIER)
    .filter(([, t]) => t === to)
    .map(([m]) => `the ${carName(m as CarModel)}`)
  const perks = ['cheaper stock', 'a bigger holdback', ...models.map((m) => `${m} to order`)]
  const list = `${perks.slice(0, -1).join(', ')} and ${perks[perks.length - 1]}`
  return `The manufacturer made you a ${tierName(to)} dealer: ${list}.`
}
