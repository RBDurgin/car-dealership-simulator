import { createRng, type Rng } from '../sim/rng'

/**
 * The store's runtime randomness and id counters, kept apart from the state
 * so a game can be reset to a known start (`resetRng`): `newGame` does, and
 * so does the test setup before each test, so store tests don't depend on
 * the order they run in.
 */

export const INVENTORY_SEED = 2026
const CUSTOMER_SEED = 7_000
const DEAL_SEED = 9_000
const STAFF_SEED = 11_000
export const OWNER_SEED = 12_000
const WALK_IN_SEED = 14_000
export const DELIVERY_SEED = 16_000
const DRIVE_SEED = 18_000
export const RIVAL_SEED = 21_000
const QUOTE_SEED = 22_000
const SERVICE_SEED = 23_000
const CLIENT_SEED = 24_000
const CREDIT_SEED = 25_000
const FI_SEED = 26_000

/** The rng streams, seeded per day, so a day plays out the same given the same choices. */
export interface DayRngs {
  /** Arrivals and new customers. */
  customer: Rng
  /** Customers' answers to offers. */
  deal: Rng
  /** Job applicants. */
  staff: Rng
  /** Passers-by who walk in. Apart from `customer`, as they turn up on frames, not clock steps. */
  walkIn: Rng
  /** Which arrivals come by car, and what they drive. Apart, so the rest of the day plays as before. */
  drive: Rng
  /** Which shoppers have been to the rival's lot first. Apart, so the rest of the day plays as before. */
  quote: Rng
  /** Service clients and their quotes. Apart, so a day without a garage plays as before. */
  service: Rng
  /** Everything about the client book. Apart, so a game with an empty book plays as before. */
  client: Rng
  /** Shoppers' credit. Apart, so the rest of the day plays as before. */
  credit: Rng
  /** Buyers' answers at the F&I menu. Apart, so the rest of the day plays as before. */
  fi: Rng
}

function dayRngs(day: number): DayRngs {
  return {
    customer: createRng(CUSTOMER_SEED + day),
    deal: createRng(DEAL_SEED + day),
    staff: createRng(STAFF_SEED + day),
    walkIn: createRng(WALK_IN_SEED + day),
    drive: createRng(DRIVE_SEED + day),
    quote: createRng(QUOTE_SEED + day),
    service: createRng(SERVICE_SEED + day),
    client: createRng(CLIENT_SEED + day),
    credit: createRng(CREDIT_SEED + day),
    fi: createRng(FI_SEED + day),
  }
}

/** Today's rng streams; replaced each morning by `seedDay`. */
export const rng: DayRngs = dayRngs(1)

/** Starts every stream afresh for `day`. */
export function seedDay(day: number): void {
  Object.assign(rng, dayRngs(day))
}

let customerId = 1
let actionId = 1
let orderId = 1
let noticeId = 1

/** "customer-12": customers' ids also seed their voices, so they restart with a game. */
export function nextCustomerId(): string {
  return `customer-${customerId++}`
}

/** Ids of the player's actions, move orders and notices only need to differ. */
export const nextActionId = () => actionId++
export const nextOrderId = () => orderId++
export const nextNoticeId = () => noticeId++

/**
 * Back to a game's start: day 1's streams and the first customer id. The
 * action, move-order and notice ids keep counting, since timers in the scene
 * and the HUD may still hold an old one.
 */
export function resetRng(): void {
  seedDay(1)
  customerId = 1
}
