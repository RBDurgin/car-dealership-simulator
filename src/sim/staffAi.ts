import { dirtiestCar, SPOTLESS } from './cleanliness'
import type { Customer } from './customers'
import { financeBusy } from './deal'
import type { InventoryCar } from './inventory'
import { SALES_DESKS } from './layout'
import { financeOnDuty, salesDeskOf, type Employee } from './staff'

/**
 * Salespeople this skilled greet browsing customers as soon as they're on the
 * lot; less skilled ones wait until the customer is standing at a car.
 */
export const EARLY_GREET_SKILL = 4

/**
 * What staff decide to do next, from the state of the world. Pure: the scene
 * (scene/Staff) carries the decisions out and reports progress to the store.
 */

/**
 * A salesperson's next step with a customer:
 * - greet: they've claimed someone; walk over and greet them
 * - offer: talk up the car, make the offer, and wait for the answer
 * - lead: the customer said yes; hand them to finance or send them to the desk
 * - sign: sit at the desk the buyer was sent to and do the paperwork
 * - idle: nobody to help; wait at their desk
 */
export type SalesTask =
  | { kind: 'idle' }
  | { kind: 'greet'; customerId: string }
  | { kind: 'offer'; customerId: string }
  | { kind: 'lead'; customerId: string }
  | { kind: 'sign'; customerId: string; chairId: string }

/** What the salesperson needs to know beyond the customers. */
export interface SalesContext {
  roster: readonly Employee[]
  /** The customer the player is on their way to, whom staff leave alone. */
  playerTargetId: string | null
  /** Customers this salesperson has given up on (e.g. couldn't reach). */
  exclude?: ReadonlySet<string>
  /** Browsing customers who are standing at a car, looking it over. */
  atCar?: ReadonlySet<string>
}

const IDLE: SalesTask = { kind: 'idle' }

/**
 * The customer a salesperson should go to: the one nobody is helping who has
 * the least patience left (waiting customers before browsing ones, who don't
 * lose patience), earliest on the lot on a tie. Skips anyone in `exclude`, and
 * browsing customers that `canGreetBrowsing` rules out.
 */
export function pickSalesCustomer(
  customers: readonly Customer[],
  exclude: ReadonlySet<string> = new Set(),
  canGreetBrowsing: (c: Customer) => boolean = () => true,
): Customer | null {
  let best: Customer | null = null
  for (const c of customers) {
    if (c.phase !== 'browsing' && c.phase !== 'waiting') continue
    if (c.handlerId !== null || exclude.has(c.id)) continue
    if (c.phase === 'browsing' && !canGreetBrowsing(c)) continue
    if (!best || c.patienceLeft < best.patienceLeft) best = c
  }
  return best
}

/** Where a salesperson takes a buyer who said yes. */
export type LeadChoice = { kind: 'handOff' } | { kind: 'desk'; chairId: string }

/**
 * Finance if they're on duty and free, otherwise the salesperson's own desk,
 * otherwise finance even with a queue. Null if there's nowhere to sign.
 */
export function leadChoice(
  e: Employee,
  customers: readonly Customer[],
  roster: readonly Employee[],
): LeadChoice | null {
  const finance = !!financeOnDuty(roster)
  if (finance && !financeBusy(customers)) return { kind: 'handOff' }
  const desk = salesDeskOf(roster, e.id)
  if (desk) return { kind: 'desk', chairId: desk.guestChairId }
  return finance ? { kind: 'handOff' } : null
}

/** The salesperson's chair at the desk with guest chair `guestChairId`. */
export function salesChairFor(guestChairId: string): string | null {
  return SALES_DESKS.find((d) => d.guestChairId === guestChairId)?.chairId ?? null
}

/**
 * Salesperson `e`'s next task. With a customer in hand it follows from where
 * their deal stands; otherwise, if they're at work and could close a sale, they
 * pick a new customer (the caller claims them).
 */
export function nextSalesTask(
  e: Employee,
  customers: readonly Customer[],
  ctx: SalesContext,
): SalesTask {
  const c = customers.find((x) => x.handlerId === e.id && x.phase !== 'leaving')
  if (c) {
    switch (c.phase) {
      case 'browsing':
      case 'waiting':
        return { kind: 'greet', customerId: c.id }
      case 'talking':
      case 'considering':
        return { kind: 'offer', customerId: c.id }
      case 'following':
      case 'signing': {
        if (c.chairId === null) return { kind: 'lead', customerId: c.id }
        const chairId = salesChairFor(c.chairId)
        return chairId ? { kind: 'sign', customerId: c.id, chairId } : IDLE
      }
      default:
        return IDLE
    }
  }
  if (e.status !== 'atPost' || e.fired) return IDLE
  // Don't start a deal there'd be nowhere to close.
  if (!salesDeskOf(ctx.roster, e.id) && !financeOnDuty(ctx.roster)) return IDLE
  const exclude = new Set(ctx.exclude)
  if (ctx.playerTargetId) exclude.add(ctx.playerTargetId)
  // Newer salespeople let customers get to a car before going over.
  const early = e.skill >= EARLY_GREET_SKILL
  const next = pickSalesCustomer(customers, exclude, (c) => early || !!ctx.atCar?.has(c.id))
  return next ? { kind: 'greet', customerId: next.id } : IDLE
}

/**
 * A lot porter's next step:
 * - wash: walk to the car and wash it
 * - idle: every car is clean enough; wait at the standby spot
 */
export type PorterTask = { kind: 'idle' } | { kind: 'wash'; carId: string }

/** What the porter needs to know beyond the stock. */
export interface PorterContext {
  /** The car the player is on their way to wash, which the porter leaves to them. */
  playerTargetId: string | null
  /** Cars the porter has given up on (e.g. couldn't reach). */
  exclude?: ReadonlySet<string>
  /** The car they're already washing, which they finish before moving on. */
  current?: string | null
}

/**
 * Porter `e`'s next task while they're at work: finish the car they're on,
 * otherwise the dirtiest car that needs it.
 */
export function nextPorterTask(
  e: Employee,
  inventory: readonly InventoryCar[],
  ctx: PorterContext,
): PorterTask {
  if (e.status !== 'atPost' || e.fired) return IDLE_PORTER
  const current = ctx.current && inventory.find((c) => c.id === ctx.current)
  if (current && current.status === 'available' && current.cleanliness < SPOTLESS) {
    if (current.id !== ctx.playerTargetId && !ctx.exclude?.has(current.id)) {
      return { kind: 'wash', carId: current.id }
    }
  }
  const exclude = new Set(ctx.exclude)
  if (ctx.playerTargetId) exclude.add(ctx.playerTargetId)
  const car = dirtiestCar(inventory, exclude)
  return car ? { kind: 'wash', carId: car.id } : IDLE_PORTER
}

const IDLE_PORTER: PorterTask = { kind: 'idle' }
