import type { Archetype } from './archetypes'
import type { Customer } from './customers'
import { roundTo100 } from './inventory'
import type { CarModel } from './layout'
import type { Rng } from './rng'
import { estimateValue, GLANCE_NOISE, marketValue, type Appraisal } from './usedCars'

/**
 * Trade-ins: some buyers who drive in want to trade their car toward the one
 * they buy. The haggle then has two numbers, the price and what we allow for
 * their car (`sim/negotiation.ts`), and the buyer judges what they'd pay after
 * the trade. A traded car is bought at its allowance and goes on the lot at
 * closing, like one bought from a seller (`sim/sellers.ts`).
 */

/** A buyer's trade-in: what they hope we'll allow for it, and what the player makes of it. */
export interface TradeIn {
  /** The allowance they hope for. */
  hope: number
  /** The player's idea of its value: a quick look at first, closer once appraised. */
  estimate: Appraisal
  /** The player has looked the car over properly (`appraise`). */
  appraised: boolean
}

/** Share of drivers who come to shop (not to sell) with a car to trade. */
export const TRADE_CHANCE = 0.35
/** A buyer hopes to be allowed this fraction over their car's value. */
export const TRADE_HOPE = { min: 0.05, max: 0.15 }
/** An allowance under this share of what they hope for offends them, and costs a haggle round. */
export const TRADE_INSULT = 0.8
/** Off the odds of a yes when there's no lot space for their trade, so we can't take it. */
export const NO_TRADE_PENALTY = 0.15
/**
 * Added to the odds of a yes when we allow at least what they hoped for their
 * car: proud owners (regulars, couples) care most, bargain hunters only about
 * the bottom line.
 */
export const TRADE_PRIDE: Record<Archetype, number> = {
  regular: 0.08,
  couple: 0.1,
  decisive: 0.03,
  'tire-kicker': 0,
  bargain: 0,
  'used-shopper': 0.03,
}
/** The allowance we open with, as a share of our estimate of their car. */
export const TRADE_OPEN_FACTOR = 0.95
/** The most the allowance stepper goes to, as a multiple of our estimate. */
export const TRADE_MAX_FACTOR = 1.5

/** What a buyer hopes we'll allow for a car worth `value`, × the level's `factor`. */
export function tradeHope(value: number, rng: Rng, factor = 1): number {
  const over = TRADE_HOPE.min + rng.next() * (TRADE_HOPE.max - TRADE_HOPE.min)
  return roundTo100(value * (1 + over) * factor)
}

/** The level's levers on trade-ins (`Tuning.tradeHope`, `Tuning.appraisalNoise`). */
export interface TradeOpts {
  hope?: number
  noise?: number
}

/** Driver `c` on `day`, with their car to trade, which the player has only glanced at. */
export function toTrader(c: Customer, rng: Rng, day: number, opts: TradeOpts = {}): Customer {
  const car = c.vehicle!.car
  const value = marketValue(car.model, car, day)
  return {
    ...c,
    trade: {
      hope: tradeHope(value, rng, opts.hope),
      estimate: estimateValue(car.model, car, day, GLANCE_NOISE * (opts.noise ?? 1), rng),
      appraised: false,
    },
  }
}

/** Gives `TRADE_CHANCE` of the drivers among `arrived` who came to shop a car to trade. */
export function assignTrades(
  arrived: readonly Customer[],
  rng: Rng,
  day: number,
  opts: TradeOpts = {},
): Customer[] {
  return arrived.map((c) =>
    c.vehicle && !c.selling && rng.next() < TRADE_CHANCE ? toTrader(c, rng, day, opts) : c,
  )
}

/**
 * What a trade adds to the odds `c` says yes, with `allowance` for their car
 * (undefined when it isn't part of the deal): less with no trade when they
 * wanted one, more by their archetype's `TRADE_PRIDE` at or over their hope.
 */
export function tradeBonus(c: Customer, allowance?: number): number {
  if (!c.trade) return 0
  if (allowance === undefined) return -NO_TRADE_PENALTY
  return allowance >= c.trade.hope ? TRADE_PRIDE[c.archetype] : 0
}

/** An allowance that offends them: well under what they hoped for. */
export function insultingAllowance(c: Customer, allowance?: number): boolean {
  return !!c.trade && allowance !== undefined && allowance < TRADE_INSULT * c.trade.hope
}

/** A trade taken in a sale: the car, what we allowed and what it was really worth. */
export interface TradeRecord {
  model: CarModel
  allowance: number
  value: number
}

/** Customer `c`'s car taken in trade for `allowance` on `day`, for the sale's record. */
export function tradeRecord(c: Customer, allowance: number, day: number): TradeRecord | null {
  const car = c.vehicle?.car
  return car ? { model: car.model, allowance, value: marketValue(car.model, car, day) } : null
}

/** How much over (or, negative, under) its value we allowed for a trade. */
export function tradeOver(t: TradeRecord): number {
  return t.allowance - t.value
}
