import type { Archetype } from './archetypes'
import type { DayStats } from './deal'

/**
 * The dealership's good name, 0 to 100. It moves once a day, when the day is
 * settled: happy buyers spread the word, and customers who walk out unhappy,
 * give up waiting or can't find what they want do the opposite. A good name
 * brings more of the usual visitors, sends friends of past buyers in as
 * referrals and makes every ad work harder; a bad one does the reverse.
 */

export const START_REPUTATION = 50
export const MAX_REPUTATION = 100

/** Reputation points per customer, by how their visit went. */
export const REPUTATION_POINTS = {
  /** A buyer who drove off happy. */
  sale: 2,
  /** Walked out after turning down the car or the price (or finding nothing they liked). */
  refused: -1,
  /** Gave up waiting for someone to help them. */
  impatient: -2,
  /** Found none of the body types they wanted in stock. */
  missed: -1,
}

/** One day can't move reputation by more than this either way. */
export const MAX_DAILY_CHANGE = 8

/** How far the usual visitor count strays from normal per point away from the start: ±30% at the ends. */
const VISITOR_SLOPE = 0.006
/** How far ads' extra visitors stray per point away from the start: ±50% at the ends. */
const CAMPAIGN_SLOPE = 0.01
/** Referrals a day at the top; none at or below the start. */
export const MAX_REFERRALS = 2

/** Multipliers on the usual archetype weights for referrals: a friend sent them, ready to buy. */
export const REFERRAL_SKEW: Partial<Record<Archetype, number>> = {
  decisive: 2,
  regular: 1.5,
  'tire-kicker': 0.5,
}

/**
 * What the day has done to reputation so far, capped at `MAX_DAILY_CHANGE`
 * either way. Customers sent home at closing don't count.
 */
export function reputationChange(stats: DayStats): number {
  const missed = Object.values(stats.missed).reduce((sum, n) => sum + (n ?? 0), 0)
  const raw =
    stats.sales.length * REPUTATION_POINTS.sale +
    stats.refused * REPUTATION_POINTS.refused +
    stats.impatient * REPUTATION_POINTS.impatient +
    missed * REPUTATION_POINTS.missed
  return Math.max(-MAX_DAILY_CHANGE, Math.min(MAX_DAILY_CHANGE, raw))
}

/** `reputation` moved by `change`, kept between 0 and 100. */
export function applyChange(reputation: number, change: number): number {
  return Math.max(0, Math.min(MAX_REPUTATION, reputation + change))
}

/** Multiplier on the usual planned visitors: 0.7 at 0, 1 at the start, 1.3 at 100. */
export function visitorScale(reputation: number): number {
  return 1 + (reputation - START_REPUTATION) * VISITOR_SLOPE
}

/** Multiplier on the extra visitors ads bring: 0.5 at 0, 1 at the start, 1.5 at 100. */
export function campaignScale(reputation: number): number {
  return 1 + (reputation - START_REPUTATION) * CAMPAIGN_SLOPE
}

/** Referral visitors expected a day: none up to the start, rising to `MAX_REFERRALS` at 100. */
export function referralVisitors(reputation: number): number {
  const above = Math.max(0, reputation - START_REPUTATION)
  return (above / (MAX_REPUTATION - START_REPUTATION)) * MAX_REFERRALS
}

/** "Poor", "Fair", "Good", "Great" or "Excellent". */
export function reputationLabel(reputation: number): string {
  if (reputation < 25) return 'Poor'
  if (reputation < 45) return 'Fair'
  if (reputation < 65) return 'Good'
  if (reputation < 85) return 'Great'
  return 'Excellent'
}
