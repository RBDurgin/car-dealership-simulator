import { ARCHETYPES } from './archetypes'
import { acceptChance, MAX_ACCEPT_CHANCE, type Customer } from './customers'
import type { InventoryCar } from './inventory'
import type { Rng } from './rng'
import { insultingAllowance, TRADE_MAX_FACTOR, TRADE_OPEN_FACTOR, tradeBonus } from './tradeIns'
import { fairPrice } from './usedCars'

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
 *
 * With a trade-in in the deal there are two numbers, the price and what we
 * allow for their car, and the customer judges the net: what they'd pay after
 * the trade, against what they hoped to pay less what they hoped to be
 * allowed. The haggle's numbers (`Haggle.lastAsk`, `counter`) are then nets.
 *
 * A used car is judged on the `day` of the ask: what they hope to pay starts
 * from what it's worth that day (`fairPrice`), not its sticker, so a used car
 * that sits gets harder to sell at the same price. `day` defaults to the day
 * the car came in.
 *
 * A shopper who's been to Nazma's lot across the road carries his price on
 * one model (`Customer.rivalQuote`). On a new car of that model, an ask well
 * over it (`QUOTE_TOLERANCE`) may send them to him, and an ask at or under it
 * is one they're happy with, a little more likely to get a yes. With a trade
 * in the deal, the price before the allowance is what's compared.
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
  /** What we allowed for their trade-in on the ask they countered, if it was in the deal. */
  allowance?: number
}

export type WalkReason =
  'pass' | 'stubborn' | 'budget' | 'gone' | 'keep' | 'insulted' | 'lowball' | 'rival' | 'think'

/** An ask more than this share over the rival's quote risks a walk to him. */
export const QUOTE_TOLERANCE = 0.03
/** Odds that an ask over the quote's tolerance sends them to the rival. */
export const QUOTE_WALK = 0.35
/** Added to the odds of a yes on an ask at or under the rival's quote. */
export const MATCH_BONUS = 0.1

/** The rival's quote that `car` is weighed against: their quote's model, new. Null otherwise. */
export function quoteFor(
  c: Pick<Customer, 'rivalQuote'>,
  car: Pick<InventoryCar, 'model' | 'used'>,
): number | null {
  const q = c.rivalQuote
  return q && !car.used && car.model === q.model ? q.price : null
}

/** Whether `price` is far enough over `quote` that they think of going to the rival. */
export function overQuote(quote: number, price: number): boolean {
  return price > quote * (1 + QUOTE_TOLERANCE)
}

export type AskResponse =
  | { answer: 'accept' }
  /** `insulted`: our trade allowance offended them, which costs a round. */
  | { answer: 'counter'; counter: number; insulted?: boolean }
  | { answer: 'walk'; reason: WalkReason }

const roundPrice = (price: number) => Math.round(price / PRICE_STEP) * PRICE_STEP

/** The round the next ask is in: 1 until they've countered. */
export function roundOf(c: Customer): number {
  return c.haggle?.round ?? 1
}

/**
 * What they hope to pay for `car` on `day`: MSRP (for a used car, what it's
 * worth that day, `fairPrice`) less their `expect`, within budget.
 */
export function hopePrice(c: Customer, car: InventoryCar, day = car.arrivedDay): number {
  return Math.min(c.budget, roundPrice(fairPrice(car, day) * (1 - c.expect)))
}

/**
 * What an ask is weighed in. With their trade in the deal (`allowance` given)
 * it's the net, and their hope and budget are net of the allowance they hoped
 * for: `offset` turns a net back into the price it's worth to them.
 */
function termsOf(c: Customer, car: InventoryCar, allowance: number | undefined, day: number) {
  const offset = c.trade && allowance !== undefined ? c.trade.hope : 0
  return { offset, hope: hopePrice(c, car, day) - offset, budget: c.budget - offset }
}

/** What they'd pay for `ask` after `allowance` for their trade (just `ask` without one). */
export function netOf(c: Customer, ask: number, allowance?: number): number {
  return c.trade && allowance !== undefined ? ask - allowance : ask
}

/**
 * Their counter to `ask` (with `allowance` for their trade, a net): the first
 * one under what they hope for, later ones creeping up.
 */
export function counterPrice(
  c: Customer,
  car: InventoryCar,
  ask: number,
  allowance?: number,
  day = car.arrivedDay,
): number {
  const { hope, budget } = termsOf(c, car, allowance, day)
  const net = netOf(c, ask, allowance)
  const counter = c.haggle
    ? roundPrice(c.haggle.counter + COUNTER_STEP * (net - c.haggle.counter))
    : roundPrice(hope - FIRST_COUNTER_DROP * car.msrp)
  // Never down from their last counter, over budget, or over the ask.
  return Math.min(budget, net, Math.max(c.haggle?.counter ?? 0, counter))
}

/**
 * Their answer to `ask` for `car`, with `allowance` for their trade-in if it's
 * part of the deal. `bonus` is the seller's skill bonus (see `skillBonus`).
 * An allowance far under what they hoped for (`TRADE_INSULT`) gets a counter
 * that costs them a round, or on their last round sends them off. An ask well
 * over the rival's quote may send them to him; one at or under it gets the
 * yes/no roll with `MATCH_BONUS`. Otherwise the net is weighed like a price.
 * Deterministic for a given rng state.
 */
export function respondToAsk(
  c: Customer,
  car: InventoryCar,
  ask: number,
  rng: Rng,
  bonus = 0,
  allowance?: number,
  day = car.arrivedDay,
): AskResponse {
  const { offset, hope, budget } = termsOf(c, car, allowance, day)
  const net = netOf(c, ask, allowance)
  const quote = quoteFor(c, car)
  const matched = quote !== null && ask <= quote
  const extra = tradeBonus(c, allowance) + (matched ? MATCH_BONUS : 0)
  const chance = acceptChance(c, car, net + offset, bonus + extra, day)
  // Turning down a match of the rival's price, they leave to think, not to go to him.
  const roll = (factor: number): AskResponse =>
    rng.next() < chance * factor
      ? { answer: 'accept' }
      : { answer: 'walk', reason: net > budget ? 'budget' : matched ? 'think' : 'pass' }
  const rounds = ARCHETYPES[c.archetype].haggle.rounds

  if (insultingAllowance(c, allowance)) {
    if (roundOf(c) + 1 < rounds) {
      return {
        answer: 'counter',
        counter: counterPrice(c, car, ask, allowance, day),
        insulted: true,
      }
    }
    return { answer: 'walk', reason: 'insulted' }
  }
  if (quote !== null && overQuote(quote, ask) && rng.next() < QUOTE_WALK) {
    return { answer: 'walk', reason: 'rival' }
  }
  if (matched || net <= hope || (c.haggle && net <= c.haggle.counter)) return roll(1)
  if (c.haggle && net >= c.haggle.lastAsk && rng.next() < STUBBORN_WALK) {
    return { answer: 'walk', reason: 'stubborn' }
  }
  if (roundOf(c) < rounds) {
    return { answer: 'counter', counter: counterPrice(c, car, ask, allowance, day) }
  }
  if (net > budget) return { answer: 'walk', reason: 'budget' }
  return roll(LAST_ROUND_FACTOR)
}

/** How a customer is likely to take an ask, for Easy's deal hint. */
export type Warmth = 'cold' | 'warm' | 'hot'

/** At or above these odds of a yes, an ask is hot (or at least warm). */
export const HOT_CHANCE = 0.6
export const WARM_CHANCE = 0.3

/**
 * How `c` would take `ask` for `car` (with `allowance` for their trade), from
 * the same numbers `respondToAsk` uses, without rolling: hot when they'd
 * likely say yes, warm when they'd maybe say yes or will counter, cold when
 * they'd likely walk. Over budget, holding at the last ask (they may walk off
 * in a huff) or an allowance that offends them is cold. Well over the rival's
 * quote is a step cooler; at or under it counts like their hoped-for price.
 */
export function dealWarmth(
  c: Customer,
  car: InventoryCar,
  ask: number,
  bonus = 0,
  allowance?: number,
  day = car.arrivedDay,
): Warmth {
  const { offset, hope, budget } = termsOf(c, car, allowance, day)
  const net = netOf(c, ask, allowance)
  const quote = quoteFor(c, car)
  const matched = quote !== null && ask <= quote
  const extra = tradeBonus(c, allowance) + (matched ? MATCH_BONUS : 0)
  const odds = (factor: number): Warmth => {
    const chance = acceptChance(c, car, net + offset, bonus + extra, day) * factor
    return chance >= HOT_CHANCE ? 'hot' : chance >= WARM_CHANCE ? 'warm' : 'cold'
  }
  const warmth = (): Warmth => {
    if (insultingAllowance(c, allowance)) return 'cold'
    if (matched || net <= hope || (c.haggle && net <= c.haggle.counter)) return odds(1)
    if (net > budget) return 'cold'
    if (c.haggle && net >= c.haggle.lastAsk) return 'cold'
    if (roundOf(c) < ARCHETYPES[c.archetype].haggle.rounds) return 'warm'
    return odds(LAST_ROUND_FACTOR)
  }
  const w = warmth()
  if (quote === null || !overQuote(quote, ask)) return w
  return w === 'hot' ? 'warm' : 'cold'
}

/**
 * The prices a seller can ask now, with `allowance` for the customer's trade:
 * up to MSRP at first, then between their counter and the last ask (nets,
 * with a trade, so the allowance is added back).
 */
export function askRange(
  c: Customer,
  car: InventoryCar,
  allowance?: number,
): { min: number; max: number } {
  if (!c.haggle) return { min: PRICE_STEP, max: car.msrp }
  const add = c.trade && allowance !== undefined ? allowance : 0
  const max = Math.min(car.msrp, c.haggle.lastAsk + add)
  return { min: Math.min(max, c.haggle.counter + add), max }
}

export function clampAsk(c: Customer, car: InventoryCar, price: number, allowance?: number) {
  const { min, max } = askRange(c, car, allowance)
  return Math.min(max, Math.max(min, Math.round(price)))
}

/** The ask that matches the rival's quote on `car`, within `askRange`, or null without one. */
export function matchAsk(c: Customer, car: InventoryCar, allowance?: number): number | null {
  const quote = quoteFor(c, car)
  return quote === null ? null : clampAsk(c, car, quote, allowance)
}

/**
 * A sensible next ask, with `allowance` for their trade: MSRP to open, then
 * splitting the difference with their counter.
 */
export function suggestedAsk(c: Customer, car: InventoryCar, allowance?: number): number {
  if (!c.haggle) return car.msrp
  const add = c.trade && allowance !== undefined ? allowance : 0
  return clampAsk(c, car, roundPrice((c.haggle.lastAsk + c.haggle.counter) / 2) + add, allowance)
}

/** What we can allow for a buyer's trade: up to half again our estimate of it. */
export function allowanceRange(c: Customer): { min: number; max: number } {
  const estimate = c.trade?.estimate.estimate ?? 0
  return { min: 0, max: Math.max(PRICE_STEP, roundPrice(estimate * TRADE_MAX_FACTOR)) }
}

export function clampAllowance(c: Customer, allowance: number): number {
  const { min, max } = allowanceRange(c)
  return Math.min(max, Math.max(min, Math.round(allowance)))
}

/** A sensible allowance: what we allowed last round, else a little under our estimate. */
export function suggestedAllowance(c: Customer): number {
  if (c.haggle?.allowance !== undefined) return clampAllowance(c, c.haggle.allowance)
  return clampAllowance(c, roundPrice((c.trade?.estimate.estimate ?? 0) * TRADE_OPEN_FACTOR))
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
 * cost + `STAFF_FLOOR_MARGIN`. With a trade in the deal, `allowance` is what
 * they allow for it this round (see `staffAllowance`).
 *
 * Against the rival's `quote` (see `quoteFor`) they come down to it when they
 * would ask more: average and better ones (3+) only when it keeps cost +
 * `STAFF_FLOOR_MARGIN`, green ones whenever it's over cost.
 */
export function staffAsk(
  skill: number,
  car: InventoryCar,
  haggle: Haggle | null,
  allowance = 0,
  quote: number | null = null,
): number {
  const floor = car.cost + STAFF_FLOOR_MARGIN
  // With a trade, the haggle's nets are prices once this round's allowance is added back.
  const lastAsk = haggle ? Math.min(car.msrp, haggle.lastAsk + allowance) : car.msrp
  const counter = haggle ? Math.min(lastAsk, haggle.counter + allowance) : 0
  const ask = (() => {
    if (!haggle) {
      const open = skill >= 3 ? car.msrp : roundPrice(car.msrp * (1 - STAFF_OPEN_DISCOUNT))
      return Math.min(car.msrp, Math.max(floor, open))
    }
    const takes =
      counter >= floor &&
      (skill <= 2 || (skill >= 4 && counter - car.cost >= STAFF_ACCEPT_GROSS * car.msrp))
    if (takes) return counter
    const ask = roundPrice(lastAsk - staffConcession(skill) * (lastAsk - counter))
    // Within what can be asked now: their counter up to the last ask.
    return Math.min(lastAsk, Math.max(counter, floor, ask))
  })()
  if (quote === null || ask <= quote) return ask
  const matches = skill <= 2 ? quote > car.cost : quote >= floor
  // Never under their own counter, which is a better price than the quote.
  return matches ? Math.max(counter, quote) : ask
}

/** A seasoned salesperson opens this share under their appraisal of a trade, per skill over 2. */
export const STAFF_TRADE_ANCHOR = 0.03
/** Each round they come this share of the way from their opening allowance up to the appraisal. */
export const STAFF_TRADE_STEP = 0.5

/**
 * What a salesperson of `skill` allows for a buyer's trade, in the haggle's
 * round `round` (1 to open), given their `appraisal` of it and the buyer's
 * `hope`. A green one (2 or less) just gives them what they hope for, which
 * is usually more than it's worth; a seasoned one anchors under the
 * appraisal (more the better they are) and comes up toward it, never past it.
 */
export function staffAllowance(skill: number, appraisal: number, hope: number, round = 1): number {
  if (skill <= 2) return roundPrice(hope)
  const open = appraisal * (1 - STAFF_TRADE_ANCHOR * (skill - 2))
  const step = Math.min(1, (round - 1) * STAFF_TRADE_STEP)
  return roundPrice(Math.min(appraisal, open + step * (appraisal - open)))
}

/** A salesperson's first offer to a seller is this share under their appraisal, less with skill. */
export const STAFF_BUY_OPEN = { worst: 0.05, best: 0.15 }
/** A seasoned salesperson takes a seller's price that leaves this share of the appraisal. */
export const STAFF_BUY_MARGIN = 0.05

/**
 * What a salesperson of `skill` offers a seller for their car, with the haggle
 * as it stands (null to open), given their `appraisal` of it. They open under
 * it, further the better they are, then come up a share of the gap
 * (`staffConcession`) or take the seller's price: a green one (2 or less)
 * whenever it's within the appraisal, a seasoned one (4+) when it leaves
 * `STAFF_BUY_MARGIN`. Never over the appraisal.
 */
export function staffBuyOffer(skill: number, appraisal: number, haggle: Haggle | null): number {
  const cap = roundPrice(appraisal)
  if (!haggle) {
    const under =
      STAFF_BUY_OPEN.worst + ((skill - 1) / 4) * (STAFF_BUY_OPEN.best - STAFF_BUY_OPEN.worst)
    return Math.max(PRICE_STEP, roundPrice(appraisal * (1 - under)))
  }
  const { lastAsk, counter } = haggle
  const takes =
    counter <= cap && (skill <= 2 || (skill >= 4 && counter <= appraisal * (1 - STAFF_BUY_MARGIN)))
  if (takes) return counter
  const offer = roundPrice(lastAsk + staffConcession(skill) * (counter - lastAsk))
  // Within what can be offered now: our last offer up to their price, and never over the cap.
  return Math.max(lastAsk, Math.min(counter, cap, offer))
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
    case 'rival':
      return "Nazma's across the road is cheaper. I'll go there."
    case 'think':
      return "That's a fair price. I'll think about it."
  }
}
