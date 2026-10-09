import { DAYS_PER_MONTH } from './calendar'
import type { FranchiseTier } from './franchise'
import { START_REPUTATION } from './reputation'

/**
 * The manufacturer's monthly sales target. It's set on the 1st from the size
 * of the lot and the dealership's reputation, and at the end of the month the
 * manufacturer pays a holdback: a share of the month's sold MSRP, more for
 * beating the target, nothing for falling well short.
 */

/** The target is held between these. */
export const QUOTA_RANGE = { min: 40, max: 160 }
/** Cars a month per stock slot, before the season and reputation. */
const CARS_PER_SLOT = 3
/** Extra cars on the target per reputation point above the start (fewer below). */
const REPUTATION_SLOPE = 0.4
/** The season's pull on the target, by month (0 = January). */
export const MONTH_QUOTA = [0.9, 0.9, 1.0, 1.0, 1.1, 1.05, 1.0, 1.0, 1.0, 1.0, 1.05, 1.1]

/** Below this share of the target there's no holdback. */
export const HOLDBACK_FLOOR = 0.8
/** From the floor up to the target: this share of the month's sold MSRP. */
export const HOLDBACK_PARTIAL = 0.006
/** At the target: this share. */
export const HOLDBACK_RATE = 0.0125
/** From this share of the target: the stretch rate. */
export const HOLDBACK_STRETCH_AT = 1.2
export const HOLDBACK_STRETCH = 0.02

/** The month's sales so far: cars and their total MSRP. */
export interface MonthSales {
  count: number
  msrp: number
}

/** How the month measured up, recorded on its last day. */
export interface QuotaResult {
  quota: number
  sold: number
  payout: number
  /** The franchise tier the month was played at, and the one it earned. */
  tier: { from: FranchiseTier; to: FranchiseTier }
}

export type QuotaStatus = 'hit' | 'onTrack' | 'behind'

export const QUOTA_STATUS_LABELS: Record<QuotaStatus, string> = {
  hit: 'Hit',
  onTrack: 'On track',
  behind: 'Behind',
}

export function emptyMonthSales(): MonthSales {
  return { count: 0, msrp: 0 }
}

/**
 * `month`'s target: half a car per slot, nudged by the season and reputation,
 * then scaled by the difficulty level's `factor` (at least 1 car).
 */
export function monthlyQuota(month: number, slots: number, reputation: number, factor = 1): number {
  const base = slots * CARS_PER_SLOT * MONTH_QUOTA[month]
  const nudge = (reputation - START_REPUTATION) * REPUTATION_SLOPE
  const clamped = Math.max(QUOTA_RANGE.min, Math.min(QUOTA_RANGE.max, Math.round(base + nudge)))
  return Math.max(1, Math.round(clamped * factor))
}

/** The share of the month's sold `msrp` the manufacturer pays for `sold` cars against `quota`. */
export function holdbackRate(sold: number, quota: number): number {
  const share = sold / quota
  if (share >= HOLDBACK_STRETCH_AT) return HOLDBACK_STRETCH
  if (share >= 1) return HOLDBACK_RATE
  if (share >= HOLDBACK_FLOOR) return HOLDBACK_PARTIAL
  return 0
}

/** The holdback for the month, × the franchise tier's `factor`, rounded to $10. */
export function holdback(sold: number, quota: number, msrp: number, factor = 1): number {
  return Math.round((msrp * holdbackRate(sold, quota) * factor) / 10) * 10
}

/** `sales` with a car of `msrp` added. */
export function addSale(sales: MonthSales, msrp: number): MonthSales {
  return { count: sales.count + 1, msrp: sales.msrp + msrp }
}

/** Days of the month still to come after `dayOfMonth`. */
export function daysLeft(dayOfMonth: number): number {
  return DAYS_PER_MONTH - dayOfMonth
}

/**
 * How the month is going with `sold` cars and `left` days to go: hit, on track
 * (at least the pace that reaches the target), or behind.
 */
export function quotaStatus(sold: number, quota: number, left: number): QuotaStatus {
  if (sold >= quota) return 'hit'
  const elapsed = DAYS_PER_MONTH - left
  return sold >= Math.floor((quota * elapsed) / DAYS_PER_MONTH) ? 'onTrack' : 'behind'
}

/** "9 of 16 this month, 6 days left". */
export function quotaLine(sold: number, quota: number, left: number): string {
  const days = left === 0 ? 'last day' : `${left} day${left === 1 ? '' : 's'} left`
  return `${sold} of ${quota} this month, ${days}`
}
