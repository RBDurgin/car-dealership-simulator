import { dirtiestCar, SPOTLESS } from './cleanliness'
import type { Customer } from './customers'
import { financeBusy } from './deal'
import type { InventoryCar } from './inventory'
import type { Tile } from './grid'
import { GUARD_PATROL_TILES, SALES_DESKS, type ExpansionId } from './layout'
import { jobPriority, type ServiceJob } from './service'
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
  /** There's lot space and cash to buy a seller's car; otherwise sellers are left alone. */
  buying?: boolean
  /** The expansions up, which say which sales desks stand (just the showroom's if left out). */
  expansions?: readonly ExpansionId[]
}

const IDLE: SalesTask = { kind: 'idle' }

/**
 * The customer a salesperson should go to: the one nobody is helping who has
 * the least patience left (waiting customers before browsing ones, who don't
 * lose patience), earliest on the lot on a tie. Skips anyone in `exclude`,
 * browsing customers that `canGreetBrowsing` rules out, and sellers unless
 * we're `buying`.
 */
export function pickSalesCustomer(
  customers: readonly Customer[],
  exclude: ReadonlySet<string> = new Set(),
  canGreetBrowsing: (c: Customer) => boolean = () => true,
  buying = true,
): Customer | null {
  let best: Customer | null = null
  for (const c of customers) {
    if (c.phase !== 'browsing' && c.phase !== 'waiting') continue
    if (c.handlerId !== null || exclude.has(c.id)) continue
    // No room or cash for their car.
    if (c.selling && !buying) continue
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
  expansions: readonly ExpansionId[] = [],
): LeadChoice | null {
  const finance = !!financeOnDuty(roster)
  if (finance && !financeBusy(customers)) return { kind: 'handOff' }
  const desk = salesDeskOf(roster, e.id, expansions)
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
  if (!salesDeskOf(ctx.roster, e.id, ctx.expansions) && !financeOnDuty(ctx.roster)) return IDLE
  const exclude = new Set(ctx.exclude)
  if (ctx.playerTargetId) exclude.add(ctx.playerTargetId)
  // Newer salespeople let customers get to a car before going over.
  const early = e.skill >= EARLY_GREET_SKILL
  const next = pickSalesCustomer(
    customers,
    exclude,
    (c) => early || !!ctx.atCar?.has(c.id),
    ctx.buying ?? true,
  )
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
  /** Cars another porter is washing, which this one leaves to them. */
  taken?: ReadonlySet<string>
}

/**
 * Porter `e`'s next task while they're at work: finish the car they're on,
 * otherwise the dirtiest car that needs it and no other porter is washing.
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
  const exclude = new Set([...(ctx.exclude ?? []), ...(ctx.taken ?? [])])
  if (ctx.playerTargetId) exclude.add(ctx.playerTargetId)
  const car = dirtiestCar(inventory, exclude)
  return car ? { kind: 'wash', carId: car.id } : IDLE_PORTER
}

const IDLE_PORTER: PorterTask = { kind: 'idle' }

/**
 * A security guard's next step:
 * - patrol: walk to the next stop on the patrol (`leg` counts the stops so far)
 * - chase: run after Jaguar, who's been spotted on the lot
 * - idle: not at work
 */
export type GuardTask = { kind: 'idle' } | { kind: 'patrol'; tile: Tile } | { kind: 'chase' }

/** How far (in tiles) a guard of `skill` spots Jaguar from. */
export function guardSight(skill: number): number {
  return GUARD_SIGHT_BASE + skill
}
const GUARD_SIGHT_BASE = 4

/** What the guard needs to know beyond themselves. */
export interface GuardContext {
  /** Jaguar's tile while he's on the lot and can be run off, else null. */
  jaguar: Tile | null
  /** The guard's own tile. */
  at: Tile
  /** Patrol stops reached so far today. */
  leg: number
  /** Already after him: they keep going until he's caught or gone. */
  chasing?: boolean
  /** The stops to walk (`patrolTiles` of the expansions up); the base patrol if left out. */
  patrol?: readonly Tile[]
}

/**
 * Guard `e`'s next task while at work: chase Jaguar once he's within sight (and
 * keep at it), otherwise walk the patrol.
 */
export function nextGuardTask(e: Employee, ctx: GuardContext): GuardTask {
  if (e.status !== 'atPost' || e.fired) return { kind: 'idle' }
  const { jaguar, at } = ctx
  if (jaguar) {
    const seen = Math.hypot(jaguar.tx - at.tx, jaguar.tz - at.tz) <= guardSight(e.skill)
    if (seen || ctx.chasing) return { kind: 'chase' }
  }
  const stops = ctx.patrol ?? GUARD_PATROL_TILES
  return { kind: 'patrol', tile: stops[ctx.leg % stops.length] }
}

/**
 * A mechanic's next step:
 * - job: walk to bay `bay` and work on job `jobId` there (start it, carry on
 *   with it, or take over one left stalled)
 * - idle: nothing to work on; wait in the garage
 */
export type MechanicTask = { kind: 'idle' } | { kind: 'job'; jobId: string; bay: number }

/** What the mechanic needs to know beyond the jobs. */
export interface MechanicContext {
  roster: readonly Employee[]
  /** Bays up today. */
  bays: number
  /** Jobs other mechanics are on their way to, and the bay each is going to. */
  taken?: ReadonlyMap<string, number>
}

const IDLE_MECHANIC: MechanicTask = { kind: 'idle' }

/** Whether `id` is at work on the job they're on: at their post, not let go and not quitting. */
export function mechanicWorking(roster: readonly Employee[], id: string | null): boolean {
  const e = id ? roster.find((x) => x.id === id) : undefined
  return !!e && e.status === 'atPost' && !e.fired && !e.quitting
}

/**
 * Mechanic `e`'s next task while at work: the job they're on, else one left
 * in a bay with nobody working it, else the first waiting job (clients' cars,
 * then recalls, then reconditioning) in a free bay. Someone thinking of
 * quitting downs tools.
 */
export function nextMechanicTask(
  e: Employee,
  jobs: readonly ServiceJob[],
  ctx: MechanicContext,
): MechanicTask {
  if (e.status !== 'atPost' || e.fired || e.quitting) return IDLE_MECHANIC
  const inBay = jobs.filter((j) => j.status === 'inBay' && j.bay !== null)
  const mine = inBay.find((j) => j.mechanicId === e.id)
  if (mine) return { kind: 'job', jobId: mine.id, bay: mine.bay! }
  const taken = ctx.taken ?? new Map<string, number>()
  const stalled = inBay.find(
    (j) => !taken.has(j.id) && j.mechanicId !== e.id && !mechanicWorking(ctx.roster, j.mechanicId),
  )
  if (stalled) return { kind: 'job', jobId: stalled.id, bay: stalled.bay! }
  const busy = new Set([...inBay.map((j) => j.bay!), ...taken.values()])
  let bay = 0
  while (bay < ctx.bays && busy.has(bay)) bay++
  if (bay >= ctx.bays) return IDLE_MECHANIC
  let next: ServiceJob | null = null
  for (const j of jobs) {
    if (j.status !== 'waiting' || taken.has(j.id)) continue
    if (!next || jobPriority(j) < jobPriority(next)) next = j
  }
  return next ? { kind: 'job', jobId: next.id, bay } : IDLE_MECHANIC
}
