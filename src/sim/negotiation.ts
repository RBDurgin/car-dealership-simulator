import { ARCHETYPES } from './archetypes'
import { acceptChance, type Customer } from './customers'
import type { InventoryCar } from './inventory'
import type { Rng } from './rng'

/**
 * Haggling over a car's price. The seller asks a price; the customer accepts,
 * counters or walks. Pure: the store asks, and applies the answer as a
 * `respond` event.
 *
 * A customer hopes to pay a little under MSRP (their `expect`, set by their
 * archetype) and will haggle for a few rounds (`ARCHETYPES[a].haggle.rounds`).
 * An ask at or below what they hope for, or at or below their own counter,
 * goes to the usual yes/no roll (`acceptChance`), so a tire-kicker still
 * mostly passes. Above it they counter while they have rounds left, and on
 * the last round take a half-hearted roll at anything within budget.
 */

/** Prices are named in round hundreds. */
export const PRICE_STEP = 100
/** A first counter comes in this fraction of MSRP below what they hope to pay. */
export const FIRST_COUNTER_DROP = 0.03
/** Each later counter moves this fraction of the way from their last counter to the ask. */
export const COUNTER_STEP = 0.4
/** Chance they walk when the seller didn't come down from their last ask. */
export const STUBBORN_WALK = 0.25
/** On their last round, an ask over what they hoped for gets this share of the usual chance. */
export const LAST_ROUND_FACTOR = 0.5
/** The player's − / + step on the price stepper. */
export const ASK_STEP = 250

/** How a haggle stands, once the customer has countered at least once. */
export interface Haggle {
  /** The round the next ask is in: 2 after the first counter. */
  round: number
  /** The seller's ask they countered. */
  lastAsk: number
  /** Their latest counter. */
  counter: number
}

export type WalkReason = 'pass' | 'stubborn' | 'budget' | 'gone'

export type AskResponse =
  | { answer: 'accept' }
  | { answer: 'counter'; counter: number }
  | { answer: 'walk'; reason: WalkReason }

const roundPrice = (price: number) => Math.round(price / PRICE_STEP) * PRICE_STEP

/** The round the next ask is in: 1 until they've countered. */
export function roundOf(c: Customer): number {
  return c.haggle?.round ?? 1
}

/** What they hope to pay for `car`: MSRP less their `expect`, within budget. */
export function hopePrice(c: Customer, car: InventoryCar): number {
  return Math.min(c.budget, roundPrice(car.msrp * (1 - c.expect)))
}

/** Their counter to `ask`: the first one under what they hope for, later ones creeping up. */
export function counterPrice(c: Customer, car: InventoryCar, ask: number): number {
  const counter = c.haggle
    ? roundPrice(c.haggle.counter + COUNTER_STEP * (ask - c.haggle.counter))
    : roundPrice(hopePrice(c, car) - FIRST_COUNTER_DROP * car.msrp)
  // Never down from their last counter, over budget, or over the ask.
  return Math.min(c.budget, ask, Math.max(c.haggle?.counter ?? 0, counter))
}

/**
 * Their answer to `ask` for `car`. `bonus` is the seller's skill bonus (see
 * `skillBonus`). Deterministic for a given rng state.
 */
export function respondToAsk(
  c: Customer,
  car: InventoryCar,
  ask: number,
  rng: Rng,
  bonus = 0,
): AskResponse {
  const roll = (factor: number): AskResponse =>
    rng.next() < acceptChance(c, car, ask, bonus) * factor
      ? { answer: 'accept' }
      : { answer: 'walk', reason: ask > c.budget ? 'budget' : 'pass' }

  if (ask <= hopePrice(c, car) || (c.haggle && ask <= c.haggle.counter)) return roll(1)
  if (c.haggle && ask >= c.haggle.lastAsk && rng.next() < STUBBORN_WALK) {
    return { answer: 'walk', reason: 'stubborn' }
  }
  if (roundOf(c) < ARCHETYPES[c.archetype].haggle.rounds) {
    return { answer: 'counter', counter: counterPrice(c, car, ask) }
  }
  if (ask > c.budget) return { answer: 'walk', reason: 'budget' }
  return roll(LAST_ROUND_FACTOR)
}

/** The prices a seller can ask now: up to MSRP at first, then between their counter and the last ask. */
export function askRange(c: Customer, car: InventoryCar): { min: number; max: number } {
  if (!c.haggle) return { min: PRICE_STEP, max: car.msrp }
  return { min: c.haggle.counter, max: c.haggle.lastAsk }
}

export function clampAsk(c: Customer, car: InventoryCar, price: number): number {
  const { min, max } = askRange(c, car)
  return Math.min(max, Math.max(min, Math.round(price)))
}

/** A sensible next ask: MSRP to open, then splitting the difference with their counter. */
export function suggestedAsk(c: Customer, car: InventoryCar): number {
  if (!c.haggle) return car.msrp
  return clampAsk(c, car, roundPrice((c.haggle.lastAsk + c.haggle.counter) / 2))
}

/** What they say when they walk. */
export function walkLine(reason: WalkReason): string {
  switch (reason) {
    case 'pass':
      return "I'll pass, thanks."
    case 'stubborn':
      return "You're not moving at all. I'm out."
    case 'budget':
      return "That's more than I can spend."
    case 'gone':
      return 'Oh, it sold? Never mind.'
  }
}
