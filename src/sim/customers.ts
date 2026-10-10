import { ARCHETYPES, EXPECT_JITTER, pickArchetype, skewWeights, type Archetype } from './archetypes'
import { CUSTOMER_VARIANTS, type CustomerVariant } from './characters'
import { cleanlinessBonus } from './cleanliness'
import type { Vehicle } from './driving'
import { BASE_MSRP, type InventoryCar } from './inventory'
import { sourceWeights, type Source } from './marketing'
import { GUEST_CHAIR_ID, type CarModel } from './layout'
import type { Haggle } from './negotiation'
import type { Rng } from './rng'
import type { RivalQuote } from './rival'
import type { Selling } from './sellers'
import type { ServiceVisit } from './serviceClients'
import type { TradeIn } from './tradeIns'
import { conditionBonus, marketValue, valueHeadroom, type Appraisal } from './usedCars'

/**
 * A customer's visit. The world (2d) moves them and reports progress as events;
 * whoever handles the sale (the player, or staff) drives it.
 *
 *   arriving ─arrive─► browsing ─browsed (last car)─► waiting ◄──────────────┐
 *                          │                            │                     │
 *                          └───────────greet────────────┤                  cancel
 *                                                       ▼                     │
 *            talking ─offer─► considering ─respond(accept)─► following ─seat─► signing
 *               ▲                  │  │                       │     ▲            │
 *               └─respond(counter)─┘  respond(walk)     handOff│     │call     signed
 *                                     ▼                       ▼     │            ▼
 *                            leaving(refused)                 queued    leaving(bought)
 *
 * An offer is haggled over (`sim/negotiation.ts`): a counter sends them back
 * to talking, with `haggle` keeping score, for the seller to ask again.
 * `greet` makes the greeter their handler; a salesperson `claim`s a browsing or
 * waiting customer first, on their way over, so nobody else takes them.
 * `handOff` passes a buyer to the finance manager, who `call`s them from the
 * lounge when the desk is free; a salesperson `lead`s theirs to their own desk
 * instead. Waiting customers lose patience on `tick` and leave impatient at
 * zero, unless someone is on their way to help. `close` sends everyone home
 * except a customer mid-signature or in staff hands. `cancel` from any deal
 * phase puts them back to waiting, and drops a claim. Service clients take
 * their own way through (see `sim/serviceClients.ts`).
 */
export type CustomerPhase =
  | 'arriving'
  | 'browsing'
  | 'waiting'
  | 'talking'
  | 'considering'
  | 'following'
  | 'signing'
  /** Handed off to finance: sitting in the lounge until the desk is free. */
  | 'queued'
  /** A service client who took the quote: their car is in the shop (see `sim/serviceClients.ts`). */
  | 'servicing'
  | 'leaving'

/** The player's id as a customer's handler (and in the crowd). */
export const PLAYER_ID = 'player'

/**
 * `sold`: a seller who sold us their car, leaving on foot. `serviced`: a
 * service client who collected their car; `declined`: one who turned the
 * quote down (or couldn't be fitted in).
 */
export type LeaveReason =
  'bought' | 'sold' | 'refused' | 'impatient' | 'closing' | 'serviced' | 'declined'

export type { CustomerVariant }

export interface Offer {
  carId: string
  price: number
  /** What we allow for their trade-in, when it's part of the deal. */
  allowance?: number
}

export interface Customer {
  id: string
  name: string
  variant: CustomerVariant
  /** What kind of shopper they are (see `ARCHETYPES`). */
  archetype: Archetype
  /** What brought them in: an ad campaign, the sidewalk, or neither. */
  source: Source
  /**
   * A couple's other half, who walks along with them in the world and has no
   * state of their own. Null for anyone shopping alone.
   */
  companion: CustomerVariant | null
  /** Most they'll pay. */
  budget: number
  /** Body types they're shopping for. */
  preferredModels: CarModel[]
  /** Game minutes of waiting they'll put up with in total. */
  patience: number
  /** Game minutes of patience remaining. Only drops while waiting. */
  patienceLeft: number
  /** Cars to look at, in order. The last one is the car they want. */
  browseCarIds: string[]
  /** How many of `browseCarIds` they've finished looking at. */
  browsed: number
  /** The car they're interested in, revealed on greeting. */
  targetCarId: string | null
  /** The offer on the table, from `offer` until they counter, leave or the deal is cancelled. */
  offer: Offer | null
  /** Fraction off MSRP they hope to pay (see `hopePrice`). */
  expect: number
  /** The haggle so far, once they've countered. Null in the first round. */
  haggle: Haggle | null
  phase: CustomerPhase
  leaveReason: LeaveReason | null
  /**
   * Who is dealing with them: `PLAYER_ID` or an employee id, from greeting until
   * they leave or the deal is dropped. Null otherwise.
   */
  handlerId: string | null
  /**
   * The guest chair they're walking to, or sitting in, to sign: set when staff
   * send them to a desk, or when they sit down. Null otherwise.
   */
  chairId: string | null
  /** Who greeted them and made the sale, whoever ends up signing it. Null until greeted. */
  sellerId: string | null
  /**
   * The car they drove in, parked in customer parking, or null for anyone who
   * came on foot. They leave the way they came.
   */
  vehicle: Vehicle | null
  /**
   * A seller (they drove in to sell us their car, not to shop): what they
   * hope to get, and what the player makes of the car. Null for shoppers.
   */
  selling: Selling | null
  /**
   * A buyer who drove in with a car to trade: what they hope we'll allow for
   * it, and what the player makes of it. Null for anyone without one.
   */
  trade: TradeIn | null
  /**
   * The rival's price on a model they want, from his lot across the road
   * (`assignQuotes`). Null for anyone who hasn't been there.
   */
  rivalQuote: RivalQuote | null
  /**
   * A service client: the job they drove in for and how it's going. Null for
   * shoppers and sellers. Their car isn't a `vehicle`: it parks in a service space.
   */
  service: ServiceVisit | null
}

const FIRST_NAMES = [
  'Alex',
  'Sam',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Jamie',
  'Avery',
  'Quinn',
  'Drew',
  'Robin',
  'Jesse',
  'Dana',
  'Kim',
  'Pat',
]
const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTW'

/** A random first name and last initial, e.g. "Alex B.". */
export function randomName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick([...LAST_INITIALS])}.`
}

export const CAR_MODELS = Object.keys(BASE_MSRP) as CarModel[]

/** Patience in game minutes, before the archetype's multiplier. */
export const PATIENCE_MINUTES = { min: 45, max: 120 }
/** Nobody waits less than this many game minutes, however impatient. */
export const MIN_PATIENCE = 15

/** How much a customer likes a car: preferred body type first, then whether it's affordable. */
function carScore(c: Customer, car: InventoryCar): number {
  return (c.preferredModels.includes(car.model) ? 2 : 0) + (car.msrp <= c.budget ? 1 : 0)
}

/** The car they want most among `cars`, or null if there are none. Ties keep the earliest. */
function favourite(c: Customer, cars: readonly InventoryCar[]): InventoryCar | null {
  let best: InventoryCar | null = null
  for (const car of cars) if (!best || carScore(c, car) > carScore(c, best)) best = car
  return best
}

/** How likely `c` is to put `car` in their browse: preferred body types 4×, used cars by archetype. */
function browseWeight(c: Customer, car: InventoryCar): number {
  const used = car.used ? ARCHETYPES[c.archetype].usedWeight : 1
  return (c.preferredModels.includes(car.model) ? 4 : 1) * used
}

/**
 * Picks up to `count` distinct cars, weighted by `browseWeight`. Cars they'd
 * never look at (used ones, for most) are left out.
 */
function pickBrowseCars(
  c: Customer,
  available: readonly InventoryCar[],
  count: number,
  rng: Rng,
): InventoryCar[] {
  const pool = available.filter((car) => browseWeight(c, car) > 0)
  const picked: InventoryCar[] = []
  while (picked.length < count && pool.length > 0) {
    const weights = pool.map((car) => browseWeight(c, car))
    let r = rng.next() * weights.reduce((a, b) => a + b, 0)
    let i = 0
    while (r >= weights[i] && i < pool.length - 1) r -= weights[i++]
    picked.push(pool.splice(i, 1)[0])
  }
  return picked
}

export interface CustomerOptions {
  /** Their look, e.g. a passer-by's who walked in. Random otherwise. */
  variant?: CustomerVariant
  /** What kind of shopper they are. Random (weighted, skewed by `source`) otherwise. */
  archetype?: Archetype
  /** What brought them in. 'regular' by default. */
  source?: Source
  /** Share taken off the discount they hope for, from showroom improvements (`Effects.expectCut`). */
  expectCut?: number
  /** Added to the discount they hope for, on a sale weekend (`SaleEvent.extraDiscount`). */
  extraDiscount?: number
  /** Multipliers on the archetype odds, on a sale weekend (`SaleEvent.skew`). */
  skew?: Partial<Record<Archetype, number>>
  /** × their patience, from the difficulty level (`Tuning.patience`). */
  patienceFactor?: number
  /** Added to the discount they hope for, from the difficulty level (`Tuning.expect`). */
  expectShift?: number
}

/**
 * A new customer arriving now, planning to look at some of the `available`
 * cars (how many, and the rest of their traits, depend on their archetype).
 */
export function generateCustomer(
  id: string,
  available: readonly InventoryCar[],
  rng: Rng,
  opts: CustomerOptions = {},
): Customer {
  const source = opts.source ?? 'regular'
  const weights = sourceWeights(source)
  const archetype =
    opts.archetype ?? pickArchetype(rng, opts.skew ? skewWeights(opts.skew, weights) : weights)
  const traits = ARCHETYPES[archetype]
  const name = randomName(rng)
  const variant = opts.variant ?? rng.pick(CUSTOMER_VARIANTS)
  const companion =
    archetype === 'couple' ? rng.pick(CUSTOMER_VARIANTS.filter((v) => v !== variant)) : null

  const first = rng.pick(CAR_MODELS)
  const second = rng.pick(CAR_MODELS)
  // A used-car shopper is open to more body types than someone buying new.
  const preferredModels =
    traits.models > 2
      ? [
          ...new Set([
            first,
            second,
            ...Array.from({ length: traits.models - 2 }, () => rng.pick(CAR_MODELS)),
          ]),
        ]
      : rng.next() < 0.5 && second !== first
        ? [first, second]
        : [first]

  const top = Math.max(...preferredModels.map((m) => BASE_MSRP[m]))
  const factor = traits.budget.min + rng.next() * (traits.budget.max - traits.budget.min)
  const budget = Math.round((top * factor) / 500) * 500

  const rolled = rng.int(PATIENCE_MINUTES.min / 5, PATIENCE_MINUTES.max / 5) * 5
  const patience = Math.max(
    MIN_PATIENCE,
    Math.round((rolled * traits.patience * (opts.patienceFactor ?? 1)) / 5) * 5,
  )

  const customer: Customer = {
    id,
    name,
    variant,
    archetype,
    source,
    companion,
    budget,
    preferredModels,
    patience,
    patienceLeft: patience,
    browseCarIds: [],
    browsed: 0,
    targetCarId: null,
    offer: null,
    expect: traits.haggle.expect,
    haggle: null,
    phase: 'arriving',
    leaveReason: null,
    handlerId: null,
    chairId: null,
    sellerId: null,
    vehicle: null,
    selling: null,
    trade: null,
    rivalQuote: null,
    service: null,
  }

  // They end their browse at the car they like best, which becomes the target.
  const browse = pickBrowseCars(
    customer,
    available,
    rng.int(traits.browse.min, traits.browse.max),
    rng,
  )
  const target = favourite(customer, browse)
  const ordered = target ? [...browse.filter((car) => car !== target), target] : []
  const jitter = (rng.next() * 2 - 1) * EXPECT_JITTER
  const hoped = traits.haggle.expect + jitter + (opts.extraDiscount ?? 0) + (opts.expectShift ?? 0)
  return {
    ...customer,
    // Never above MSRP, however easy the level.
    expect: Math.round(Math.max(0, hoped) * (1 - (opts.expectCut ?? 0)) * 1000) / 1000,
    browseCarIds: ordered.map((car) => car.id),
    targetCarId: target?.id ?? null,
  }
}

/** The car they're browsing now, or null once they're done (or never started). */
export function currentBrowseCarId(c: Customer): string | null {
  return c.phase === 'browsing' ? (c.browseCarIds[c.browsed] ?? null) : null
}

/**
 * The car they'll ask about when greeted: their target if it's still for sale,
 * otherwise their favourite of what's left. Null when nothing is for sale.
 */
export function chooseTarget(c: Customer, available: readonly InventoryCar[]): string | null {
  if (available.some((car) => car.id === c.targetCarId)) return c.targetCarId
  return favourite(c, available)?.id ?? null
}

/** Best chance of a yes, for a preferred car well under budget. */
export const MAX_ACCEPT_CHANCE = 0.95
/** Headroom (fraction of budget left over) at which the price stops mattering. */
export const COMFORT_HEADROOM = 0.25

/** The player sells like a skill-4 salesperson. */
export const PLAYER_SKILL = 4
/** Accept chance bonus for the least and most skilled seller. */
export const SKILL_BONUS = { min: -0.1, max: 0.05 }

/** How much a seller of `skill` (1–5) adds to the accept chance: −10% to +5%. */
export function skillBonus(skill: number): number {
  return SKILL_BONUS.min + ((skill - 1) / 4) * (SKILL_BONUS.max - SKILL_BONUS.min)
}

/**
 * Chance they say yes to `car` at `price` on `day`. Zero over budget. Otherwise
 * 35% for a car of the wrong body type right at their limit, rising with
 * preference (+35%) and headroom (up to +30% at 25% under budget), plus how
 * clean the car is (±8%, see `cleanlinessBonus`), their archetype (a
 * tire-kicker rarely says yes, a decisive buyer usually does) and the seller's
 * `bonus` (see `skillBonus`), capped at 95%. A used car's headroom is also
 * judged against what it's worth on `day` (`valueHeadroom`), and its
 * condition adds ±10% (`conditionBonus`).
 */
export function acceptChance(
  c: Customer,
  car: InventoryCar,
  price: number,
  bonus = 0,
  day = car.arrivedDay,
): number {
  if (price > c.budget) return 0
  const preferred = c.preferredModels.includes(car.model) ? 1 : 0
  const room = Math.min(1, (c.budget - price) / c.budget / COMFORT_HEADROOM)
  const headroom = car.used
    ? Math.min(room, valueHeadroom(price, marketValue(car.model, car.used, day)))
    : room
  const chance =
    0.35 +
    0.35 * preferred +
    0.3 * headroom +
    (car.used ? conditionBonus(car.used.condition) : 0) +
    cleanlinessBonus(car.cleanliness) +
    ARCHETYPES[c.archetype].accept +
    bonus
  return Math.max(0, Math.min(MAX_ACCEPT_CHANCE, chance))
}

export type Mood = 'neutral' | 'impatient' | 'happy' | 'unhappy'

/** Patience fraction below which a waiting customer shows they're getting impatient. */
export const IMPATIENT_FRACTION = 1 / 3

export function moodOf(c: Customer): Mood {
  switch (c.phase) {
    case 'following':
    case 'signing':
    case 'queued':
      return 'happy'
    case 'leaving':
      if (c.leaveReason === 'bought' || c.leaveReason === 'sold') return 'happy'
      if (c.leaveReason === 'serviced') return 'happy'
      if (c.leaveReason === 'closing' || c.leaveReason === 'declined') return 'neutral'
      return 'unhappy'
    case 'waiting':
      return c.patienceLeft < c.patience * IMPATIENT_FRACTION ? 'impatient' : 'neutral'
    default:
      return 'neutral'
  }
}

/** The icon above a customer's head, if any. */
export type Bubble =
  'waiting' | 'impatient' | 'considering' | 'counter' | 'helped' | 'bought' | 'upset'

export function bubbleOf(c: Customer): Bubble | null {
  // They've named their price and wait for the seller's answer.
  if (c.phase === 'talking' && c.haggle) return 'counter'
  // A salesperson is on their way over, or talking with them.
  if (staffHandled(c) && ['browsing', 'waiting', 'talking'].includes(c.phase)) return 'helped'
  switch (c.phase) {
    case 'waiting':
      return moodOf(c) === 'impatient' ? 'impatient' : 'waiting'
    case 'considering':
      return 'considering'
    case 'leaving':
      if (c.leaveReason === 'bought' || c.leaveReason === 'sold') return 'bought'
      if (c.leaveReason === 'serviced') return 'bought'
      return moodOf(c) === 'unhappy' ? 'upset' : null
    default:
      return null
  }
}

/** Walking speed in the world, units per second (the walk clip's natural pace). */
export const CUSTOMER_SPEED = 1.6
/** Game minutes spent looking at each car while browsing. */
export const LINGER_MINUTES = { min: 8, max: 20 }

export type CustomerEvent =
  /** Reached the lot on foot. */
  | { type: 'arrive'; id: string }
  /** Drove in, parked and got out: on the lot, like `arrive`. */
  | { type: 'parked'; id: string }
  /** Finished looking at the current browse car. */
  | { type: 'browsed'; id: string }
  /** Salesperson `by` is on their way over to help: nobody else takes them. */
  | { type: 'claim'; id: string; by: string }
  /** `by` greeted them. `carId` is what they ask about (see `chooseTarget`). */
  | { type: 'greet'; id: string; carId: string | null; by: string }
  | { type: 'offer'; id: string; carId: string; price: number; allowance?: number }
  /**
   * Their answer to the offer (see `respondToAsk`, or `respondToBuyOffer` for
   * a seller), with their price if they counter. A seller who accepts has sold
   * us their car: it stays, and they leave on foot.
   */
  | {
      type: 'respond'
      id: string
      answer: 'accept' | 'counter' | 'walk'
      counter?: number
      /** Our trade allowance offended them: the counter costs them an extra round. */
      insulted?: boolean
    }
  /** Sat down to sign: in the guest chair they were sent to, else the office's (the player's buyer). */
  | { type: 'seat'; id: string }
  /** Their handler passed them to the finance manager `to`. They wait in the lounge. */
  | { type: 'handOff'; id: string; to: string }
  /** Their salesperson sends them to sit at the desk with guest chair `chairId`. */
  | { type: 'lead'; id: string; chairId: string }
  /** Finance is free: up from the lounge and over to the desk. */
  | { type: 'call'; id: string }
  /** Paperwork signed: the sale goes through. `traded`: we took their car, so they leave on foot. */
  | { type: 'signed'; id: string; traded?: boolean }
  /** The player looked a seller's (or a trade-in's) car over properly: a closer estimate of its value. */
  | { type: 'appraised'; id: string; estimate: Appraisal }
  /** Their handler walked away mid-conversation or mid-deal. */
  | { type: 'cancel'; id: string }
  /**
   * A service client took the quote: job `jobId`, promised for `promisedMinute`.
   * `dropOff`: they leave the car and come back for it.
   */
  | { type: 'booked'; id: string; jobId: string; promisedMinute: number; dropOff: boolean }
  /** A service client paid for the job and gets back in their car. */
  | { type: 'collect'; id: string }
  /** A service client took extra work: their car is ready later, at `promisedMinute`. */
  | { type: 'repromise'; id: string; promisedMinute: number }
  /** A drop-off walked off the map. Removes them until they come back (the store keeps them). */
  | { type: 'wentAway'; id: string }
  /** Walked off the map. Removes them. */
  | { type: 'despawn'; id: string }
  /** Got back in their car to drive off. Removes them; the car leaves in the world. */
  | { type: 'droveOff'; id: string }
  /**
   * Game time passed. Applies to everyone except `except`, the customer the
   * player is on their way to help, who doesn't give up while being greeted.
   * Those in `outside` lose patience `outsideFactor` times as fast (rain, heat).
   */
  | {
      type: 'tick'
      minutes: number
      except?: string
      outside?: ReadonlySet<string>
      outsideFactor?: number
    }
  /** Closing time. Applies to everyone. */
  | { type: 'close' }

const leave = (c: Customer, reason: LeaveReason): Customer => ({
  ...c,
  phase: 'leaving',
  leaveReason: reason,
  handlerId: null,
  chairId: null,
})

/** Being looked after by an employee rather than the player. */
export function staffHandled(c: Customer): boolean {
  return c.handlerId !== null && c.handlerId !== PLAYER_ID
}

/**
 * One customer's next state, or null once they've despawned. Events that don't
 * fit the current phase (stale ones from the world or the player) return `c`
 * unchanged.
 */
export function reduceCustomer(c: Customer, ev: CustomerEvent): Customer | null {
  if ('id' in ev && ev.id !== c.id) return c
  switch (ev.type) {
    case 'arrive':
      // A driver arrives by parking.
      if (c.phase !== 'arriving' || c.vehicle || c.service) return c
      return { ...c, phase: c.browseCarIds.length > 0 ? 'browsing' : 'waiting' }
    case 'parked':
      // A service client heads for the counter.
      if (c.phase === 'arriving' && c.service && !c.service.parked) {
        return { ...c, phase: 'waiting', service: { ...c.service, parked: true } }
      }
      if (c.phase !== 'arriving' || !c.vehicle || c.vehicle.parked) return c
      return {
        ...c,
        phase: c.browseCarIds.length > 0 ? 'browsing' : 'waiting',
        vehicle: { ...c.vehicle, parked: true },
      }
    case 'browsed': {
      if (c.phase !== 'browsing') return c
      const browsed = c.browsed + 1
      return { ...c, browsed, phase: browsed >= c.browseCarIds.length ? 'waiting' : 'browsing' }
    }
    case 'claim':
      if (c.phase !== 'browsing' && c.phase !== 'waiting') return c
      if (c.handlerId !== null) return c
      return { ...c, handlerId: ev.by }
    case 'greet':
      if (c.phase !== 'browsing' && c.phase !== 'waiting') return c
      // Someone else has claimed them.
      if (c.handlerId !== null && c.handlerId !== ev.by) return c
      // Nothing left they could want. A seller or a service client isn't shopping.
      if (ev.carId === null && !c.selling && !c.service) return leave(c, 'refused')
      return { ...c, phase: 'talking', targetCarId: ev.carId, handlerId: ev.by, sellerId: ev.by }
    case 'offer':
      if (c.phase !== 'talking') return c
      return {
        ...c,
        phase: 'considering',
        offer: {
          carId: ev.carId,
          price: ev.price,
          ...(ev.allowance !== undefined && { allowance: ev.allowance }),
        },
      }
    case 'respond':
      if (c.phase !== 'considering' || !c.offer) return c
      if (ev.answer === 'accept' && c.selling) {
        return leave({ ...c, offer: null, vehicle: null }, 'sold')
      }
      // A service client takes the quote through `booked`.
      if (c.service && ev.answer !== 'accept') return leave({ ...c, offer: null }, 'declined')
      if (c.service) return c
      if (ev.answer === 'accept') return { ...c, phase: 'following' }
      if (ev.answer === 'walk' || ev.counter === undefined) {
        return leave({ ...c, offer: null }, 'refused')
      }
      // With a trade in the deal, the haggle is over what they pay after it.
      const { price, allowance } = c.offer
      return {
        ...c,
        phase: 'talking',
        offer: null,
        haggle: {
          round: (c.haggle?.round ?? 1) + (ev.insulted ? 2 : 1),
          lastAsk: price - (allowance ?? 0),
          counter: ev.counter,
          ...(allowance !== undefined && { allowance }),
        },
      }
    case 'seat':
      if (c.phase !== 'following') return c
      return { ...c, phase: 'signing', chairId: c.chairId ?? GUEST_CHAIR_ID }
    case 'handOff':
      // From the player or a salesperson, before they've been sent to a desk.
      if (c.phase !== 'following' || c.handlerId === null || c.handlerId === ev.to) return c
      if (c.chairId !== null) return c
      return { ...c, phase: 'queued', handlerId: ev.to }
    case 'lead':
      if (c.phase !== 'following' || !staffHandled(c) || c.chairId !== null) return c
      return { ...c, chairId: ev.chairId }
    case 'call':
      if (c.phase !== 'queued') return c
      return { ...c, phase: 'following', chairId: GUEST_CHAIR_ID }
    case 'signed':
      if (c.phase !== 'signing') return c
      return leave(ev.traded ? { ...c, vehicle: null } : c, 'bought')
    case 'appraised': {
      if (c.phase === 'leaving') return c
      const looked = { estimate: ev.estimate, appraised: true }
      if (c.selling) return { ...c, selling: { ...c.selling, ...looked } }
      if (c.trade) return { ...c, trade: { ...c.trade, ...looked } }
      return c
    }
    case 'cancel':
      // A salesperson who claimed them gives up: they carry on as they were.
      if ((c.phase === 'browsing' || c.phase === 'waiting') && c.handlerId !== null) {
        return { ...c, handlerId: null }
      }
      if (!['talking', 'considering', 'following', 'signing', 'queued'].includes(c.phase)) return c
      return {
        ...c,
        phase: 'waiting',
        offer: null,
        haggle: null,
        handlerId: null,
        chairId: null,
        sellerId: null,
      }
    case 'booked':
      if (c.phase !== 'considering' || !c.service) return c
      return {
        ...c,
        phase: 'servicing',
        offer: null,
        handlerId: null,
        chairId: null,
        service: {
          ...c.service,
          jobId: ev.jobId,
          promisedMinute: ev.promisedMinute,
          dropOff: ev.dropOff,
        },
      }
    case 'collect':
      return c.phase === 'servicing' ? leave(c, 'serviced') : c
    case 'repromise':
      if (c.phase !== 'servicing' || !c.service) return c
      return { ...c, service: { ...c.service, promisedMinute: ev.promisedMinute } }
    case 'wentAway':
      return c.phase === 'servicing' && c.service?.dropOff && !c.service.returned ? null : c
    case 'despawn':
      return c.phase === 'leaving' ? null : c
    case 'droveOff':
      return c.phase === 'leaving' && (c.vehicle || c.service) ? null : c
    case 'tick': {
      // Nobody gives up while someone is on their way to help them.
      if (c.phase !== 'waiting' || ev.minutes <= 0 || ev.except === c.id) return c
      if (c.handlerId !== null) return c
      const factor = ev.outside?.has(c.id) ? (ev.outsideFactor ?? 1) : 1
      const patienceLeft = Math.max(0, c.patienceLeft - ev.minutes * factor)
      return patienceLeft === 0
        ? leave({ ...c, patienceLeft }, 'impatient')
        : { ...c, patienceLeft }
    }
    case 'close':
      // Let a signature in progress finish, staff finish the buyers they have
      // in hand and service clients collect their cars; everyone else heads out.
      if (c.phase === 'leaving' || c.phase === 'signing' || c.phase === 'servicing') return c
      if (staffHandled(c) && (c.phase === 'queued' || c.phase === 'following')) return c
      return leave({ ...c, offer: null }, 'closing')
  }
}

/**
 * Applies an event to everyone it concerns. Returns the same array when nothing
 * changed, so callers can skip store updates.
 */
export function reduceCustomers(customers: Customer[], ev: CustomerEvent): Customer[] {
  let changed = false
  const next: Customer[] = []
  for (const c of customers) {
    const n = reduceCustomer(c, ev)
    if (n !== c) changed = true
    if (n) next.push(n)
  }
  return changed ? next : customers
}
