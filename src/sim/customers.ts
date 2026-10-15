import { ARCHETYPES, EXPECT_JITTER, pickArchetype, skewWeights, type Archetype } from './archetypes'
import { weekdayTraffic } from './calendar'
import { CUSTOMER_VARIANTS, type CustomerVariant } from './characters'
import { cleanlinessBonus, dingPenalty } from './cleanliness'
import type { Credit } from './credit'
import type { FiDeal } from './fi'
import type { Client } from './clients'
import type { Tuning } from './difficulty'
import type { Vehicle } from './driving'
import type { SaleEvent } from './events'
import { BASE_MSRP, type InventoryCar } from './inventory'
import { sourceWeights, type Source } from './marketing'
import { GUEST_CHAIR_ID, type CarModel } from './layout'
import type { Haggle } from './negotiation'
import { visitorScale } from './reputation'
import type { Rng } from './rng'
import type { RivalQuote } from './rival'
import type { Selling } from './sellers'
import type { ServiceVisit } from './serviceClients'
import { closePrompt, type Topic } from './talkingPoints'
import type { TalkingPoint, TestDrive } from './testDrive'
import type { TradeIn } from './tradeIns'
import { conditionBonus, marketValue, valueHeadroom, type Appraisal } from './usedCars'
import { WEATHER_EFFECTS, type Weather } from './weather'

/**
 * A customer's visit. The world (2d) moves them and reports progress as events;
 * whoever handles the sale (the player, or staff) drives it.
 *
 *   arriving ─arrive─► browsing ─browsed (last car)─► waiting ◄──────────────┐
 *                          │                            │                     │
 *                          └───────────greet────────────┤                  cancel
 *                                                       ▼                     │
 *            talking ─offer─► considering ─respond(accept)─► following ─seat─► signing ─menu─► menu
 *               ▲                  │  │                       │     ▲            │              │
 *               └─respond(counter)─┘  respond(walk)     handOff│     │call     signed   signed / declined
 *                                     ▼                       ▼     │            ▼              ▼
 *                            leaving(refused)                 queued    leaving(bought)  leaving(bought / declined)
 *
 *            talking ─testDrive─► talking (to the car) ─boarded─► driving ─droveBack─► talking
 *
 * An offer is haggled over (`sim/negotiation.ts`): a counter sends them back
 * to talking, with `haggle` keeping score, for the seller to ask again.
 * `greet` makes the greeter their handler; a salesperson `claim`s a browsing or
 * waiting customer first, on their way over, so nobody else takes them.
 * `handOff` passes a buyer to the finance manager, who `call`s them from the
 * lounge when the desk is free; a salesperson `lead`s theirs to their own desk
 * instead. The player's buyer goes from the paperwork to the F&I `menu`
 * (`sim/fi.ts`), signs from there, or leaves `declined` when no lender will
 * take them. A shopper may take the car for a test drive first
 * (`sim/testDrive.ts`): `testDrive` sets them off to the car, still talking,
 * `boarded` has them out on the road (`driving`, which drains no patience)
 * and `droveBack` brings them back to talking, once a visit; the player
 * may `sendWith` a salesperson instead, who takes over the drive and the sale. Waiting
 * customers lose patience on `tick` and leave impatient at zero, unless
 * someone is on their way to help. `close` sends everyone home except a
 * customer mid-signature or in staff hands (one out on a drive comes back at
 * once). `cancel` from any deal phase but a drive puts them back to
 * waiting, and drops a claim. Service clients take
 * their own way through (see `sim/serviceClients.ts`).
 */
export type CustomerPhase =
  | 'arriving'
  | 'browsing'
  | 'waiting'
  | 'talking'
  /** Out on a test drive (see `sim/testDrive.ts`): off the lot, in the car. */
  | 'driving'
  | 'considering'
  | 'following'
  | 'signing'
  /** The player's buyer, past the paperwork: at the F&I menu (see `sim/fi.ts`). */
  | 'menu'
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
 * quote down (or couldn't be fitted in), or a buyer no lender would take.
 * `visited`: a guest on client
 * appreciation day nobody got to, who ate, looked around and went home.
 */
export type LeaveReason =
  'bought' | 'sold' | 'refused' | 'impatient' | 'closing' | 'serviced' | 'declined' | 'visited'

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
  /** Their entry in the client book when they've been before (see `sim/clients.ts`), else null. */
  clientId: string | null
  /**
   * The loyalty discount a returning client is priced from: the sticker is
   * `msrp × (1 − loyaltyCut)` (see `stickerOf`). 0 for everyone else.
   */
  loyaltyCut: number
  /** The client from the book who sent them (see `sim/referrals.ts`), else null. */
  referredBy: string | null
  /** A guest on client appreciation day: one nobody greets leaves as `visited`. */
  guest: boolean
  /**
   * How they'd pay: cash or a loan, their credit tier and down payment
   * (`assignCredit`). Null for sellers and service clients.
   */
  credit: Credit | null
  /** The F&I menu so far, while they're in `menu`; null otherwise. */
  fi: FiDeal | null
  /** They'll ask to drive the car (`assignDriveAsk`). False for sellers and service clients. */
  wantsDrive: boolean
  /** Their test drive, from setting off to the car on; null until then (see `sim/testDrive.ts`). */
  drive: TestDrive | null
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
  'Reese',
  'Rowan',
  'Charlie',
  'Emery',
  'Finley',
  'Hayden',
  'Kai',
  'Logan',
  'Marley',
  'Parker',
  'Peyton',
  'Remy',
  'Sage',
  'Shawn',
  'Toni',
  'Blair',
]
const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTW'

const nameAt = (i: number) =>
  `${FIRST_NAMES[Math.floor(i / LAST_INITIALS.length)]} ${LAST_INITIALS[i % LAST_INITIALS.length]}.`

/**
 * A random first name and last initial, e.g. "Alex B.". One in `taken` (the
 * client book's) steps on to the next free name instead of re-rolling, so the
 * rng is drawn the same either way.
 */
export function randomName(rng: Rng, taken?: ReadonlySet<string>): string {
  const first = Math.floor(rng.next() * FIRST_NAMES.length)
  const last = Math.floor(rng.next() * LAST_INITIALS.length)
  const rolled = first * LAST_INITIALS.length + last
  const total = FIRST_NAMES.length * LAST_INITIALS.length
  if (!taken) return nameAt(rolled)
  for (let k = 0; k < total; k++) {
    const name = nameAt((rolled + k) % total)
    if (!taken.has(name)) return name
  }
  return nameAt(rolled)
}

export const CAR_MODELS = Object.keys(BASE_MSRP) as CarModel[]

/** Patience in game minutes, before the archetype's multiplier. */
export const PATIENCE_MINUTES = { min: 45, max: 120 }
/** Nobody waits less than this many game minutes, however impatient. */
export const MIN_PATIENCE = 15
/** × the budget of a client back to trade up the car we sold them. */
export const TRADE_UP_BUDGET = 1.15
/** Body types a client trades up through, smallest first. */
export const UPGRADE_PATH: readonly CarModel[] = ['hatchback-sports', 'sedan', 'suv', 'suv-luxury']
/** Chance a client trading up looks at the next model up `UPGRADE_PATH` as well as their old one. */
export const UPGRADE_CHANCE = 0.35
/** Share of the discount they hope for that a client at satisfaction 100 lets go. */
export const LOYAL_EXPECT_CUT = 0.3

/** The model after `model` up `UPGRADE_PATH`, or null at the top or off it. */
export function nextModelUp(model: CarModel): CarModel | null {
  const i = UPGRADE_PATH.indexOf(model)
  return i >= 0 && i < UPGRADE_PATH.length - 1 ? UPGRADE_PATH[i + 1] : null
}

/** Share of their hoped-for discount a client of `satisfaction` lets go: none at 50 or under. */
export function loyalExpectCut(satisfaction: number): number {
  return Math.min(1, Math.max(0, (satisfaction - 50) / 50)) * LOYAL_EXPECT_CUT
}

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
  /** Names in the client book, which a stranger's name steps past (see `randomName`). */
  taken?: ReadonlySet<string>
  /**
   * A client back from the book: their name, look, archetype and taste come
   * from the record, and they come as `'client'` unless `source` says otherwise.
   */
  client?: Client
  /**
   * The client is back to trade up the car we sold them: their budget is
   * `TRADE_UP_BUDGET` higher, and they shop that model (and, `UPGRADE_CHANCE`
   * of the time, the next one up).
   */
  tradeUp?: boolean
  /** A returning client's loyalty discount (`ClientPerks.loyaltyDiscount`). */
  loyaltyCut?: number
  /** The client who sent this stranger in. */
  referredBy?: string
  /** A client back as a guest on client appreciation day. */
  guest?: boolean
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
  const client = opts.client
  if (client) return returningCustomer(id, client, available, rng, opts)
  const source = opts.source ?? 'regular'
  const weights = sourceWeights(source)
  const archetype =
    opts.archetype ?? pickArchetype(rng, opts.skew ? skewWeights(opts.skew, weights) : weights)
  const traits = ARCHETYPES[archetype]
  const name = randomName(rng, opts.taken)
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
  return shopper(
    {
      id,
      name,
      variant,
      archetype,
      source,
      companion,
      budget,
      preferredModels,
      clientId: null,
      referredBy: opts.referredBy ?? null,
    },
    available,
    rng,
    opts,
  )
}

/**
 * A client back from the book, as they were last time. Trading up the car we
 * sold them, they shop its model (or the next one up), with the budget for
 * it. A client (not a prospect) is priced at the loyalty discount, and the
 * happier they are the less of a discount they hope for.
 */
function returningCustomer(
  id: string,
  client: Client,
  available: readonly InventoryCar[],
  rng: Rng,
  opts: CustomerOptions,
): Customer {
  const old = opts.tradeUp ? (client.car?.model ?? null) : null
  const up = old && nextModelUp(old)
  const models = !old
    ? client.preferredModels
    : up && rng.next() < UPGRADE_CHANCE
      ? [old, up]
      : [old]
  const raised = opts.tradeUp ? client.budget * TRADE_UP_BUDGET : client.budget
  // Looking a size up, they come able to afford its sticker. A prospect's
  // models are just the ones they liked, however many.
  const lookingUp = up && models.includes(up)
  const budget = Math.round(Math.max(raised, lookingUp ? BASE_MSRP[up] : 0) / 500) * 500
  const c = shopper(
    {
      id,
      name: client.name,
      variant: client.variant,
      archetype: client.archetype,
      source: opts.source ?? 'client',
      companion: client.companion,
      budget,
      preferredModels: [...models],
      clientId: client.id,
      referredBy: null,
    },
    available,
    rng,
    opts,
  )
  // A be-back comes back ready to deal: hoping for about their last counter.
  const deal = client.status === 'prospect' ? client.lastDeal : null
  if (deal?.counter) return { ...c, expect: beBackExpect(deal.model, deal.counter) }
  if (client.status !== 'client') return c
  const expect = Math.round(c.expect * (1 - loyalExpectCut(client.satisfaction)) * 1000) / 1000
  return { ...c, expect, loyaltyCut: opts.loyaltyCut ?? 0 }
}

/** Most a be-back hopes off the sticker, however low their last counter. */
export const MAX_BE_BACK_EXPECT = 0.25

/** The discount that puts a be-back's hope on a new `model` at their last `counter`. */
export function beBackExpect(model: CarModel, counter: number): number {
  const off = 1 - counter / BASE_MSRP[model]
  return Math.round(Math.min(MAX_BE_BACK_EXPECT, Math.max(0, off)) * 1000) / 1000
}

/** Who a customer is, before their patience, browse and hopes are rolled. */
type Identity = Pick<
  Customer,
  | 'id'
  | 'name'
  | 'variant'
  | 'archetype'
  | 'source'
  | 'companion'
  | 'budget'
  | 'preferredModels'
  | 'clientId'
  | 'referredBy'
>

/** `who`, arriving now: their patience, the cars they'll look at and the discount they hope for. */
function shopper(
  who: Identity,
  available: readonly InventoryCar[],
  rng: Rng,
  opts: CustomerOptions,
): Customer {
  const traits = ARCHETYPES[who.archetype]
  const rolled = rng.int(PATIENCE_MINUTES.min / 5, PATIENCE_MINUTES.max / 5) * 5
  const patience = Math.max(
    MIN_PATIENCE,
    Math.round((rolled * traits.patience * (opts.patienceFactor ?? 1)) / 5) * 5,
  )

  const customer: Customer = {
    ...who,
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
    loyaltyCut: 0,
    guest: !!opts.guest,
    credit: null,
    fi: null,
    wantsDrive: false,
    drive: null,
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
 * condition adds ±10% (`conditionBonus`). A dinged car is `DING_PENALTY` less.
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
    cleanlinessBonus(car.cleanliness) -
    dingPenalty(car) +
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
    case 'menu':
    case 'queued':
    case 'driving':
      return 'happy'
    case 'leaving':
      if (c.leaveReason === 'bought' || c.leaveReason === 'sold') return 'happy'
      if (c.leaveReason === 'serviced' || c.leaveReason === 'visited') return 'happy'
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
  | 'waiting'
  | 'client'
  | 'impatient'
  | 'considering'
  | 'counter'
  | 'helped'
  | 'bought'
  | 'upset'
  /** They'd like to drive the car and haven't yet. */
  | 'drive'

/** Wants a test drive and hasn't had one. */
const wantsKeys = (c: Customer) => c.wantsDrive && !c.drive

export function bubbleOf(c: Customer): Bubble | null {
  // They've named their price and wait for the seller's answer.
  if (c.phase === 'talking' && c.haggle) return 'counter'
  // A salesperson is on their way over, or talking with them.
  if (staffHandled(c) && ['browsing', 'waiting', 'talking'].includes(c.phase)) return 'helped'
  switch (c.phase) {
    case 'talking':
      return wantsKeys(c) ? 'drive' : null
    case 'waiting':
      if (moodOf(c) === 'impatient') return 'impatient'
      if (wantsKeys(c)) return 'drive'
      // Someone from the client book: a star, so they can be spotted.
      return c.clientId ? 'client' : 'waiting'
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
  /** `by` takes them for a test drive in car `carId`, `minutes` long: they head for the car. */
  | { type: 'testDrive'; id: string; carId: string; by: string; minutes: number }
  /** In the car: off on the drive. */
  | { type: 'boarded'; id: string }
  /** The player hands them to salesperson `to`, who takes them for their drive and the sale. */
  | { type: 'sendWith'; id: string; to: string }
  /** Head back: the drive is cut short. */
  | { type: 'cutDrive'; id: string }
  /** A talking-point prompt comes up on the drive (20b); one still open counts as unanswered. */
  | { type: 'topics'; id: string; topics: Topic[] }
  /** The rider pointed out one of the topics offered, and how it went down. */
  | { type: 'point'; id: string; point: TalkingPoint }
  /** Back in the space, out of the car and talking again: how it went, and the discount they now hope for. */
  | { type: 'droveBack'; id: string; drive: TestDrive; expect: number }
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
  /**
   * Sat down to sign: in the guest chair they were sent to, else `chairId`
   * (the desk the player closes at), else the office's.
   */
  | { type: 'seat'; id: string; chairId?: string }
  /**
   * Their handler passed them to the finance manager `to`. They wait in the
   * lounge. From a salesperson's desk too, when no lender would take them at
   * the buy rate: he may get them a loan with more down.
   */
  | { type: 'handOff'; id: string; to: string }
  /** Their salesperson sends them to sit at the desk with guest chair `chairId`. */
  | { type: 'lead'; id: string; chairId: string }
  /** Finance is free: up from the lounge and over to the desk. */
  | { type: 'call'; id: string }
  /** The player's paperwork is done: on to the F&I menu, opening at `deal`. */
  | { type: 'menu'; id: string; deal: FiDeal }
  /** The F&I menu moved on: a lender, a markup, a down payment or a product's answer. */
  | { type: 'fi'; id: string; deal: FiDeal }
  /**
   * No lender will take them, and they can't put more down: they leave. From
   * the menu, or from signing with staff.
   */
  | { type: 'declined'; id: string }
  /**
   * Paperwork signed (or, from the menu, the contracts): the sale goes
   * through. `traded`: we took their car, so they leave on foot. `deal`:
   * the loan and menu they signed, kept on them for the visit's score.
   */
  | { type: 'signed'; id: string; traded?: boolean; deal?: FiDeal | null }
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
  fi: null,
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
      // Not on the way to a test drive.
      if (c.phase !== 'talking' || (c.drive && !c.drive.back)) return c
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
    case 'testDrive':
      if (c.phase !== 'talking' || c.drive || c.offer || c.handlerId !== ev.by) return c
      return {
        ...c,
        drive: {
          carId: ev.carId,
          by: ev.by,
          minutes: ev.minutes,
          points: [],
          offered: null,
          cut: false,
          ding: false,
          back: false,
          score: 0,
        },
      }
    case 'boarded':
      if (c.phase !== 'talking' || !c.drive || c.drive.back) return c
      return { ...c, phase: 'driving' }
    case 'sendWith':
      if (c.phase !== 'talking' || c.handlerId !== PLAYER_ID || c.drive || c.offer) return c
      return { ...c, handlerId: ev.to, sellerId: ev.to }
    case 'topics':
      if (c.phase !== 'driving' || !c.drive) return c
      return { ...c, drive: { ...closePrompt(c.drive), offered: ev.topics } }
    case 'point':
      if (c.phase !== 'driving' || !c.drive?.offered) return c
      return { ...c, drive: { ...c.drive, points: [...c.drive.points, ev.point], offered: null } }
    case 'cutDrive':
      if (c.phase !== 'driving' || !c.drive || c.drive.cut) return c
      return { ...c, drive: { ...c.drive, cut: true } }
    case 'droveBack':
      if (c.phase !== 'driving') return c
      return { ...c, phase: 'talking', drive: ev.drive, expect: ev.expect }
    case 'seat':
      if (c.phase !== 'following') return c
      return { ...c, phase: 'signing', chairId: c.chairId ?? ev.chairId ?? GUEST_CHAIR_ID }
    case 'handOff':
      if (c.handlerId === null || c.handlerId === ev.to) return c
      // Up from a salesperson's desk, the paperwork stuck on the loan.
      if (c.phase === 'signing' && staffHandled(c)) {
        return { ...c, phase: 'queued', handlerId: ev.to, chairId: null }
      }
      // From the player or a salesperson, before they've been sent to a desk.
      if (c.phase !== 'following' || c.chairId !== null) return c
      return { ...c, phase: 'queued', handlerId: ev.to }
    case 'lead':
      if (c.phase !== 'following' || !staffHandled(c) || c.chairId !== null) return c
      return { ...c, chairId: ev.chairId }
    case 'call':
      if (c.phase !== 'queued') return c
      return { ...c, phase: 'following', chairId: GUEST_CHAIR_ID }
    case 'menu':
      if (c.phase !== 'signing' || staffHandled(c)) return c
      return { ...c, phase: 'menu', fi: ev.deal }
    case 'fi':
      return c.phase === 'menu' ? { ...c, fi: ev.deal } : c
    case 'declined':
      return c.phase === 'menu' || (c.phase === 'signing' && staffHandled(c))
        ? leave(c, 'declined')
        : c
    case 'signed':
      if (c.phase !== 'signing' && c.phase !== 'menu') return c
      // The deal they signed stays with them, for how the visit left them.
      return {
        ...leave(ev.traded ? { ...c, vehicle: null } : c, 'bought'),
        fi: ev.deal ?? c.fi,
      }
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
      if (!['talking', 'considering', 'following', 'signing', 'menu', 'queued'].includes(c.phase))
        return c
      return {
        ...c,
        phase: 'waiting',
        offer: null,
        haggle: null,
        handlerId: null,
        chairId: null,
        sellerId: null,
        fi: null,
        // A drive they hadn't set off on is off; one they've had stays had.
        drive: c.drive?.back ? c.drive : null,
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
      if (patienceLeft > 0) return { ...c, patienceLeft }
      // A guest nobody got to has still had lunch.
      return leave({ ...c, patienceLeft }, c.guest && !c.sellerId ? 'visited' : 'impatient')
    }
    case 'close':
      // Let a signature in progress (or the menu after it) finish, staff finish
      // the buyers they have in hand and service clients collect their cars;
      // everyone else heads out.
      if (['leaving', 'signing', 'menu', 'servicing'].includes(c.phase)) return c
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

/**
 * How many of the usual visitors come on `day`: more or fewer with
 * reputation, the weekday, the weather, any sale weekend and the level.
 * (The rival's share and a bust boost are applied on top, in `beginDay`.)
 */
export function arrivalScale(
  day: number,
  weather: Weather,
  event: Pick<SaleEvent, 'traffic'> | null,
  tuning: Pick<Tuning, 'traffic'>,
  reputation: number,
): number {
  return (
    visitorScale(reputation) *
    weekdayTraffic(day) *
    WEATHER_EFFECTS[weather].traffic *
    (event?.traffic ?? 1) *
    tuning.traffic
  )
}

/**
 * The patience waiting customers lose over `minutes` of the clock: less with
 * a receptionist keeping them company (`reception`, see `patienceFactor`)
 * and a comfy waiting area (`saved`, the improvements' `patienceSaved`).
 */
export function patienceDrain(minutes: number, reception: number, saved: number): number {
  return minutes * reception * (1 - saved)
}
