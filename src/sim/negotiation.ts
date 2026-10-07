import { ARCHETYPES } from './archetypes'
import { acceptChance, MAX_ACCEPT_CHANCE, type Customer } from './customers'
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

export type WalkReason = 'pass' | 'stubborn' | 'budget' | 'gone' | 'keep' | 'insulted' | 'lowball'

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

/** How a customer is likely to take an ask, for Easy's deal hint. */
export type Warmth = 'cold' | 'warm' | 'hot'

/** At or above these odds of a yes, an ask is hot (or at least warm). */
export const HOT_CHANCE = 0.6
export const WARM_CHANCE = 0.3

/**
 * How `c` would take `ask` for `car`, from the same numbers `respondToAsk`
 * uses, without rolling: hot when they'd likely say yes, warm when they'd
 * maybe say yes or will counter, cold when they'd likely walk. Over budget,
 * or holding at the last ask (they may walk off in a huff), is cold.
 */
export function dealWarmth(c: Customer, car: InventoryCar, ask: number, bonus = 0): Warmth {
  const odds = (factor: number): Warmth => {
    const chance = acceptChance(c, car, ask, bonus) * factor
    return chance >= HOT_CHANCE ? 'hot' : chance >= WARM_CHANCE ? 'warm' : 'cold'
  }
  if (ask <= hopePrice(c, car) || (c.haggle && ask <= c.haggle.counter)) return odds(1)
  if (ask > c.budget) return 'cold'
  if (c.haggle && ask >= c.haggle.lastAsk) return 'cold'
  if (roundOf(c) < ARCHETYPES[c.archetype].haggle.rounds) return 'warm'
  return odds(LAST_ROUND_FACTOR)
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

/** Below MSRP − this share, a salesperson under average skill opens. */
export const STAFF_OPEN_DISCOUNT = 0.02
/** A salesperson's least margin over the car's cost: they never ask less. */
export const STAFF_FLOOR_MARGIN = 300
/** A seasoned salesperson takes a counter that keeps at least this share of MSRP as gross. */
export const STAFF_ACCEPT_GROSS = 0.06

/** The share of the gap to the counter a salesperson of `skill` gives up each round: 60% at 1, 20% at 5. */
export function staffConcession(skill: number): number {
  return 0.7 - 0.1 * skill
}

/**
 * What a salesperson of `skill` asks for `car`, with the haggle as it stands
 * (null before the first counter). Average and better open at MSRP, newer
 * ones a little under. After a counter they come down a share of the gap
 * (less the better they are), or take the counter: seasoned ones (4+) when it
 * keeps a healthy gross, green ones (2 or less) whatever it is. Never under
 * cost + `STAFF_FLOOR_MARGIN`.
 */
export function staffAsk(skill: number, car: InventoryCar, haggle: Haggle | null): number {
  const floor = car.cost + STAFF_FLOOR_MARGIN
  if (!haggle) {
    const open = skill >= 3 ? car.msrp : roundPrice(car.msrp * (1 - STAFF_OPEN_DISCOUNT))
    return Math.min(car.msrp, Math.max(floor, open))
  }
  const { lastAsk, counter } = haggle
  const takes =
    counter >= floor &&
    (skill <= 2 || (skill >= 4 && counter - car.cost >= STAFF_ACCEPT_GROSS * car.msrp))
  if (takes) return counter
  const ask = roundPrice(lastAsk - staffConcession(skill) * (lastAsk - counter))
  // Within what can be asked now: their counter up to the last ask.
  return Math.min(lastAsk, Math.max(counter, floor, ask))
}

// Buying a seller's car: the same haggle the other way round. We offer, they
// accept, counter (down from a first counter over what they hope for) or walk.
// `Haggle.lastAsk` is our last offer and `counter` their latest price.

/** A seller's first counter comes in this fraction of their hope above it. */
export const SELLER_FIRST_RISE = 0.03
/** Under this share of their hope, an offer may insult a seller into leaving. */
export const LOWBALL_FRACTION = 0.7
export const LOWBALL_WALK = 0.5
/** A seller's odds of taking an offer they're happy with, before their archetype. */
export const SELL_CHANCE = 0.9
/** On their last round, the least a seller will consider, as a share of their hope. */
export const SELLER_RESERVE = 0.92
/** We open this fraction under our estimate of the car's value. */
export const BUY_OPEN_DISCOUNT = 0.15
/** To open, the most the stepper offers, as a multiple of our estimate. */
export const BUY_MAX_FACTOR = 1.5

const hopeOf = (c: Customer) => c.selling?.hope ?? 0

/** Odds a seller takes an offer they're happy with: 90%, plus half their archetype's `accept`. */
export function sellChance(c: Customer): number {
  return Math.max(
    0.5,
    Math.min(MAX_ACCEPT_CHANCE, SELL_CHANCE + ARCHETYPES[c.archetype].accept / 2),
  )
}

/** A seller's counter to `offer`: the first over what they hope for, later ones coming down. */
export function sellerCounter(c: Customer, offer: number): number {
  const counter = c.haggle
    ? roundPrice(c.haggle.counter - COUNTER_STEP * (c.haggle.counter - offer))
    : roundPrice(hopeOf(c) * (1 + SELLER_FIRST_RISE))
  // Never up from their last counter, or under the offer.
  return Math.max(offer, Math.min(c.haggle?.counter ?? Infinity, counter))
}

/** The offer is one they're happy with: at their hope, or at their own counter. */
const pleases = (c: Customer, offer: number) =>
  offer >= hopeOf(c) || (!!c.haggle && offer >= c.haggle.counter)

/**
 * Seller `c`'s answer to our `offer` for their car, mirroring `respondToAsk`:
 * at or over what they hope for (or their counter) they mostly take it; far
 * under it they may leave insulted; not coming up from our last offer they may
 * walk; otherwise they counter while they have rounds left, and on the last
 * round take a half-hearted roll at anything near their hope.
 */
export function respondToBuyOffer(c: Customer, offer: number, rng: Rng): AskResponse {
  const roll = (factor: number): AskResponse =>
    rng.next() < sellChance(c) * factor ? { answer: 'accept' } : { answer: 'walk', reason: 'keep' }
  if (pleases(c, offer)) return roll(1)
  if (offer < LOWBALL_FRACTION * hopeOf(c) && rng.next() < LOWBALL_WALK) {
    return { answer: 'walk', reason: 'insulted' }
  }
  if (c.haggle && offer <= c.haggle.lastAsk && rng.next() < STUBBORN_WALK) {
    return { answer: 'walk', reason: 'stubborn' }
  }
  if (roundOf(c) < ARCHETYPES[c.archetype].haggle.rounds) {
    return { answer: 'counter', counter: sellerCounter(c, offer) }
  }
  if (offer < SELLER_RESERVE * hopeOf(c)) return { answer: 'walk', reason: 'lowball' }
  return roll(LAST_ROUND_FACTOR)
}

/** How seller `c` would take `offer`, from the same numbers `respondToBuyOffer` uses. */
export function buyWarmth(c: Customer, offer: number): Warmth {
  const odds = (factor: number): Warmth => {
    const chance = sellChance(c) * factor
    return chance >= HOT_CHANCE ? 'hot' : chance >= WARM_CHANCE ? 'warm' : 'cold'
  }
  if (pleases(c, offer)) return odds(1)
  if (offer < LOWBALL_FRACTION * hopeOf(c)) return 'cold'
  if (c.haggle && offer <= c.haggle.lastAsk) return 'cold'
  if (roundOf(c) < ARCHETYPES[c.archetype].haggle.rounds) return 'warm'
  if (offer < SELLER_RESERVE * hopeOf(c)) return 'cold'
  return odds(LAST_ROUND_FACTOR)
}

/** What we can offer a seller now: up to half again our estimate at first, then between our last offer and their counter. */
export function buyRange(c: Customer): { min: number; max: number } {
  if (c.haggle) return { min: c.haggle.lastAsk, max: c.haggle.counter }
  const estimate = c.selling?.estimate.estimate ?? 0
  return { min: PRICE_STEP, max: Math.max(PRICE_STEP, roundPrice(estimate * BUY_MAX_FACTOR)) }
}

export function clampBuy(c: Customer, price: number): number {
  const { min, max } = buyRange(c)
  return Math.min(max, Math.max(min, Math.round(price)))
}

/** A sensible next offer: under our estimate to open, then splitting the difference. */
export function suggestedBuy(c: Customer): number {
  if (c.haggle) return clampBuy(c, roundPrice((c.haggle.lastAsk + c.haggle.counter) / 2))
  return clampBuy(c, roundPrice((c.selling?.estimate.estimate ?? 0) * (1 - BUY_OPEN_DISCOUNT)))
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
    case 'keep':
      return "On second thought, I'll keep it."
    case 'insulted':
      return "Is that a joke? I'm out."
    case 'lowball':
      return 'I can get more than that elsewhere.'
  }
}
