import { CUSTOMER_VARIANTS, type CharacterVariant } from './characters'
import { BASE_MSRP, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import type { Rng } from './rng'

/**
 * A customer's visit. The world (2d) moves them and reports progress as events;
 * the player's actions (2e) drive the sale.
 *
 *   arriving ─arrive─► browsing ─browsed (last car)─► waiting ◄──────────────┐
 *                          │                            │                     │
 *                          └───────────greet────────────┤                  cancel
 *                                                       ▼                     │
 *            talking ─offer─► considering ─respond(yes)─► following ─seat─► signing
 *                                  │                                          │
 *                            respond(no)                                   signed
 *                                  ▼                                          ▼
 *                         leaving(refused)                           leaving(bought)
 *
 * Waiting customers lose patience on `tick` and leave impatient at zero.
 * `close` sends everyone except a customer mid-signature home. `cancel` from
 * talking, considering, following or signing puts them back to waiting.
 */
export type CustomerPhase =
  | 'arriving'
  | 'browsing'
  | 'waiting'
  | 'talking'
  | 'considering'
  | 'following'
  | 'signing'
  | 'leaving'

export type LeaveReason = 'bought' | 'refused' | 'impatient' | 'closing'

export type CustomerVariant = Exclude<CharacterVariant, 'salesperson'>

export interface Offer {
  carId: string
  price: number
}

export interface Customer {
  id: string
  name: string
  variant: CustomerVariant
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
  /** The offer on the table, from `offer` until they leave or the deal is cancelled. */
  offer: Offer | null
  phase: CustomerPhase
  leaveReason: LeaveReason | null
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

export const CAR_MODELS = Object.keys(BASE_MSRP) as CarModel[]

/** Budget is the priciest preferred model's base price times a factor in this range. */
export const BUDGET_FACTOR = { min: 0.85, max: 1.3 }
/** Patience in game minutes. */
export const PATIENCE_MINUTES = { min: 45, max: 120 }

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

/** Picks up to `count` distinct cars, preferred body types several times likelier. */
function pickBrowseCars(
  c: Customer,
  available: readonly InventoryCar[],
  count: number,
  rng: Rng,
): InventoryCar[] {
  const pool = [...available]
  const picked: InventoryCar[] = []
  while (picked.length < count && pool.length > 0) {
    const weights = pool.map((car) => (c.preferredModels.includes(car.model) ? 4 : 1))
    let r = rng.next() * weights.reduce((a, b) => a + b, 0)
    let i = 0
    while (r >= weights[i] && i < pool.length - 1) r -= weights[i++]
    picked.push(pool.splice(i, 1)[0])
  }
  return picked
}

/** A new customer arriving now, planning to look at 1–3 of the `available` cars. */
export function generateCustomer(
  id: string,
  available: readonly InventoryCar[],
  rng: Rng,
): Customer {
  const name = `${rng.pick(FIRST_NAMES)} ${rng.pick([...LAST_INITIALS])}.`
  const variant = rng.pick(CUSTOMER_VARIANTS)

  const first = rng.pick(CAR_MODELS)
  const second = rng.pick(CAR_MODELS)
  const preferredModels = rng.next() < 0.5 && second !== first ? [first, second] : [first]

  const top = Math.max(...preferredModels.map((m) => BASE_MSRP[m]))
  const factor = BUDGET_FACTOR.min + rng.next() * (BUDGET_FACTOR.max - BUDGET_FACTOR.min)
  const budget = Math.round((top * factor) / 500) * 500

  const patience = rng.int(PATIENCE_MINUTES.min / 5, PATIENCE_MINUTES.max / 5) * 5

  const customer: Customer = {
    id,
    name,
    variant,
    budget,
    preferredModels,
    patience,
    patienceLeft: patience,
    browseCarIds: [],
    browsed: 0,
    targetCarId: null,
    offer: null,
    phase: 'arriving',
    leaveReason: null,
  }

  // They end their browse at the car they like best, which becomes the target.
  const browse = pickBrowseCars(customer, available, rng.int(1, 3), rng)
  const target = favourite(customer, browse)
  const ordered = target ? [...browse.filter((car) => car !== target), target] : []
  return {
    ...customer,
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

/**
 * Chance they say yes to `car` at `price`. Zero over budget. Otherwise 35% for
 * a car of the wrong body type right at their limit, rising with preference
 * (+35%) and headroom (up to +30% at 25% under budget), capped at 95%.
 */
export function acceptChance(c: Customer, car: InventoryCar, price: number): number {
  if (price > c.budget) return 0
  const preferred = c.preferredModels.includes(car.model) ? 1 : 0
  const headroom = Math.min(1, (c.budget - price) / c.budget / COMFORT_HEADROOM)
  return Math.min(MAX_ACCEPT_CHANCE, 0.35 + 0.35 * preferred + 0.3 * headroom)
}

/** Whether they accept the offer. Deterministic for a given rng state. */
export function decide(c: Customer, car: InventoryCar, price: number, rng: Rng): boolean {
  const chance = acceptChance(c, car, price)
  return chance > 0 && rng.next() < chance
}

export type Mood = 'neutral' | 'impatient' | 'happy' | 'unhappy'

/** Patience fraction below which a waiting customer shows they're getting impatient. */
export const IMPATIENT_FRACTION = 1 / 3

export function moodOf(c: Customer): Mood {
  switch (c.phase) {
    case 'following':
    case 'signing':
      return 'happy'
    case 'leaving':
      if (c.leaveReason === 'bought') return 'happy'
      if (c.leaveReason === 'closing') return 'neutral'
      return 'unhappy'
    case 'waiting':
      return c.patienceLeft < c.patience * IMPATIENT_FRACTION ? 'impatient' : 'neutral'
    default:
      return 'neutral'
  }
}

/** The icon above a customer's head, if any. */
export type Bubble = 'waiting' | 'impatient' | 'considering' | 'bought' | 'upset'

export function bubbleOf(c: Customer): Bubble | null {
  switch (c.phase) {
    case 'waiting':
      return moodOf(c) === 'impatient' ? 'impatient' : 'waiting'
    case 'considering':
      return 'considering'
    case 'leaving':
      if (c.leaveReason === 'bought') return 'bought'
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
  /** Reached the lot. */
  | { type: 'arrive'; id: string }
  /** Finished looking at the current browse car. */
  | { type: 'browsed'; id: string }
  /** The player greeted them. `carId` is what they ask about (see `chooseTarget`). */
  | { type: 'greet'; id: string; carId: string | null }
  | { type: 'offer'; id: string; carId: string; price: number }
  /** Their answer to the offer (see `decide`). */
  | { type: 'respond'; id: string; accepted: boolean }
  /** Sat down at the office desk. */
  | { type: 'seat'; id: string }
  /** Paperwork signed: the sale goes through. */
  | { type: 'signed'; id: string }
  /** The player walked away mid-conversation or mid-deal. */
  | { type: 'cancel'; id: string }
  /** Walked off the map. Removes them. */
  | { type: 'despawn'; id: string }
  /** Game time passed. Applies to everyone. */
  | { type: 'tick'; minutes: number }
  /** Closing time. Applies to everyone. */
  | { type: 'close' }

const leave = (c: Customer, reason: LeaveReason): Customer => ({
  ...c,
  phase: 'leaving',
  leaveReason: reason,
})

/**
 * One customer's next state, or null once they've despawned. Events that don't
 * fit the current phase (stale ones from the world or the player) return `c`
 * unchanged.
 */
export function reduceCustomer(c: Customer, ev: CustomerEvent): Customer | null {
  if ('id' in ev && ev.id !== c.id) return c
  switch (ev.type) {
    case 'arrive':
      if (c.phase !== 'arriving') return c
      return { ...c, phase: c.browseCarIds.length > 0 ? 'browsing' : 'waiting' }
    case 'browsed': {
      if (c.phase !== 'browsing') return c
      const browsed = c.browsed + 1
      return { ...c, browsed, phase: browsed >= c.browseCarIds.length ? 'waiting' : 'browsing' }
    }
    case 'greet':
      if (c.phase !== 'browsing' && c.phase !== 'waiting') return c
      // Nothing left they could want.
      if (ev.carId === null) return leave(c, 'refused')
      return { ...c, phase: 'talking', targetCarId: ev.carId }
    case 'offer':
      if (c.phase !== 'talking') return c
      return { ...c, phase: 'considering', offer: { carId: ev.carId, price: ev.price } }
    case 'respond':
      if (c.phase !== 'considering') return c
      return ev.accepted ? { ...c, phase: 'following' } : leave({ ...c, offer: null }, 'refused')
    case 'seat':
      if (c.phase !== 'following') return c
      return { ...c, phase: 'signing' }
    case 'signed':
      if (c.phase !== 'signing') return c
      return leave(c, 'bought')
    case 'cancel':
      if (!['talking', 'considering', 'following', 'signing'].includes(c.phase)) return c
      return { ...c, phase: 'waiting', offer: null }
    case 'despawn':
      return c.phase === 'leaving' ? null : c
    case 'tick': {
      if (c.phase !== 'waiting' || ev.minutes <= 0) return c
      const patienceLeft = Math.max(0, c.patienceLeft - ev.minutes)
      return patienceLeft === 0
        ? leave({ ...c, patienceLeft }, 'impatient')
        : { ...c, patienceLeft }
    }
    case 'close':
      // Let a signature in progress finish; everyone else heads out.
      if (c.phase === 'leaving' || c.phase === 'signing') return c
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
