import { dirtiestCar, SPOTLESS } from './cleanliness'
import type { Customer } from './customers'
import { financeBusy } from './deal'
import type { InventoryCar } from './inventory'
import type { Tile } from './grid'
import { GUARD_PATROL_TILES, SALES_DESKS, type ExpansionId } from './layout'
import { findingBlocker, jobPriority, openFinding, type ServiceJob } from './service'
import { financeOnDuty, salesDeskOf, type Employee } from './staff'
import { staffDriveCar } from './testDrive'
import { seniorSightBonus } from './growth'
import { hashSeed } from './rng'
import { auctionDayOf, isAuctionDay, type Inspection, type Lot } from './auction'
import { AUCTION_END, AUCTION_START } from './bidding'

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
 * - drive: the customer asked for a test drive; take them out first (the
 *   scene sets it off, walks to the car and gets in)
 * - ride: on the way to the test drive car, or out on the road in it
 * - offer: talk up the car, make the offer, and wait for the answer
 * - lead: the customer said yes; hand them to finance or send them to the desk
 * - sign: sit at the desk the buyer was sent to and do the paperwork
 * - idle: nobody to help; wait at their desk
 */
export type SalesTask =
  | { kind: 'idle' }
  | { kind: 'greet'; customerId: string }
  | { kind: 'drive'; customerId: string; carId: string }
  | { kind: 'ride'; customerId: string; carId: string }
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
  /** The stock, for test drives; without it, nobody is taken for one. */
  inventory?: readonly InventoryCar[]
  /** Cars a test drive holds already (see `carsHeld`), which no other drive takes. */
  carsOut?: ReadonlySet<string>
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
    // Service clients are for the garage's counter.
    if (c.service) continue
    // No room or cash for their car.
    if (c.selling && !buying) continue
    if (c.phase === 'browsing' && !canGreetBrowsing(c)) continue
    if (!best || c.patienceLeft < best.patienceLeft) best = c
  }
  return best
}

/**
 * The salesperson the player could hand a shopper to: at work, with nobody
 * in hand and somewhere to close a sale, the most skilled first. Null if
 * none is free.
 */
export function freeSalesperson(
  roster: readonly Employee[],
  customers: readonly Customer[],
  expansions: readonly ExpansionId[] = [],
): Employee | null {
  let best: Employee | null = null
  for (const e of roster) {
    if (e.role !== 'sales' || e.status !== 'atPost' || e.fired) continue
    if (customers.some((c) => c.handlerId === e.id && c.phase !== 'leaving')) continue
    if (!salesDeskOf(roster, e.id, expansions) && !financeOnDuty(roster)) continue
    if (!best || e.skill > best.skill) best = e
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
      case 'talking': {
        // On the way to the car, or (with nothing else to do) taking them out.
        if (c.drive && !c.drive.back) {
          return { kind: 'ride', customerId: c.id, carId: c.drive.carId }
        }
        const car = ctx.inventory && staffDriveCar(c, ctx.inventory, ctx.carsOut)
        if (car) return { kind: 'drive', customerId: c.id, carId: car.id }
        return { kind: 'offer', customerId: c.id }
      }
      case 'driving':
        return { kind: 'ride', customerId: c.id, carId: c.drive!.carId }
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
 * - chase: run after Nazma, who's been spotted on the lot
 * - idle: not at work
 */
export type GuardTask = { kind: 'idle' } | { kind: 'patrol'; tile: Tile } | { kind: 'chase' }

/** How far (in tiles) a guard of `skill` spots Nazma from. */
export function guardSight(skill: number): number {
  return GUARD_SIGHT_BASE + skill
}
const GUARD_SIGHT_BASE = 4

/** What the guard needs to know beyond themselves. */
export interface GuardContext {
  /** Nazma's tile while he's on the lot and can be run off, else null. */
  nazma: Tile | null
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
 * Guard `e`'s next task while at work: chase Nazma once he's within sight (and
 * keep at it), otherwise walk the patrol.
 */
export function nextGuardTask(e: Employee, ctx: GuardContext): GuardTask {
  if (e.status !== 'atPost' || e.fired) return { kind: 'idle' }
  const { nazma, at } = ctx
  if (nazma) {
    const seen =
      Math.hypot(nazma.tx - at.tx, nazma.tz - at.tz) <= guardSight(e.skill) + seniorSightBonus(e)
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

/**
 * The service client the advisor `e` checks in next: the one who's been at
 * the counter longest (least patience left), nobody else is helping and the
 * player isn't on their way to. Null while they're not at work.
 */
export function nextCheckIn(
  e: Employee,
  customers: readonly Customer[],
  atCounter: ReadonlySet<string>,
  playerTargetId: string | null,
): Customer | null {
  if (e.status !== 'atPost' || e.fired || e.quitting) return null
  let best: Customer | null = null
  for (const c of customers) {
    if (!c.service || c.phase !== 'waiting' || c.handlerId !== null) continue
    if (!atCounter.has(c.id) || c.id === playerTargetId) continue
    if (!best || c.patienceLeft < best.patienceLeft) best = c
  }
  return best
}

/**
 * The job whose extra work the advisor `e` offers next, when nobody is at
 * the counter: the first with a finding still open whose client is waiting
 * on it (on the lot, or away and called) and that can be done by closing at
 * `now`. Null while they're not at work.
 */
export function nextFinding(
  e: Employee,
  jobs: readonly ServiceJob[],
  clients: readonly Customer[],
  now: number,
): ServiceJob | null {
  if (e.status !== 'atPost' || e.fired || e.quitting) return null
  const waiting = new Set(clients.filter((c) => c.phase === 'servicing').map((c) => c.id))
  return (
    jobs.find(
      (j) =>
        openFinding(j) &&
        j.customerId !== null &&
        waiting.has(j.customerId) &&
        findingBlocker(j, now) === null,
    ) ?? null
  )
}

/** The used-car manager sets off for the auction this long before the run starts. */
export const BUYER_LEAVE = AUCTION_START - 30

/**
 * The used-car manager's next step:
 * - inspect: look over a lot on this week's run list (at their post), the
 *   day before the auction, or on the morning before they leave
 * - auction: away at the auction, from `BUYER_LEAVE` until the run is over
 * - idle: at their post by the kiosk
 */
export type BuyerTask = { kind: 'idle' } | { kind: 'inspect'; lotId: string } | { kind: 'auction' }

/** What the used-car manager's day depends on. */
export interface BuyerContext {
  day: number
  minute: number
  /** Whether the auction is open to the dealership. */
  open: boolean
  /** This week's run list. */
  lots: readonly Lot[]
  /** The lots inspected already (by anyone). */
  inspected: readonly Pick<Inspection, 'lotId'>[]
  /** Whether today's run is over (or there's none). */
  runOver: boolean
}

/** Whether the used-car manager is away at the auction at `minute` of `day`. */
export function atAuction(day: number, minute: number, runOver: boolean): boolean {
  return isAuctionDay(day) && minute >= BUYER_LEAVE && minute < AUCTION_END && !runOver
}

/** Whether employee `e` is a used-car manager at work today (not let go, on the lot). */
function buyerAtWork(e: Pick<Employee, 'role' | 'fired' | 'status'>): boolean {
  return e.role === 'buyer' && !e.fired && (e.status === 'arriving' || e.status === 'atPost')
}

export function nextBuyerTask(e: Employee, ctx: BuyerContext): BuyerTask {
  if (!ctx.open || !buyerAtWork(e)) return { kind: 'idle' }
  if (atAuction(ctx.day, ctx.minute, ctx.runOver)) return { kind: 'auction' }
  const before = auctionDayOf(ctx.day) - 1 === ctx.day
  const morning = isAuctionDay(ctx.day) && ctx.minute < BUYER_LEAVE
  if (!before && !morning) return { kind: 'idle' }
  const lot = ctx.lots.find((l) => !ctx.inspected.some((i) => i.lotId === l.id))
  return lot ? { kind: 'inspect', lotId: lot.id } : { kind: 'idle' }
}

/**
 * The used-car manager bidding for the dealership at `minute` of `day`: at
 * work today and away at the auction. Null if there's nobody there.
 */
export function proxyBuyer(
  roster: readonly Employee[],
  day: number,
  minute: number,
  runOver: boolean,
): Employee | null {
  if (!atAuction(day, minute, runOver)) return null
  return roster.find(buyerAtWork) ?? null
}

/** A break taken in the morning or the afternoon: one of each a day at most. */
export type BreakPart = 'morning' | 'afternoon'

/** When each part's breaks can start, in game minutes: 10:00–11:45 and 14:00–16:30. */
export const BREAK_WINDOWS: Record<BreakPart, readonly [number, number]> = {
  morning: [10 * 60, 11 * 60 + 45],
  afternoon: [14 * 60, 16 * 60 + 30],
}
/** Game minutes a break lasts. */
export const BREAK_MINUTES = 15
/** Most staff on a break at once: one per break room chair. */
export const MAX_ON_BREAK = 2

/** The part of the day `minute` falls in, if it's in a break window. */
export function breakPart(minute: number): BreakPart | null {
  for (const part of ['morning', 'afternoon'] as const) {
    const [from, to] = BREAK_WINDOWS[part]
    if (minute >= from && minute < to) return part
  }
  return null
}

/**
 * The minute in `part`'s window from which `id` would like a break: spread
 * over the window by their id, so the staff don't all go at once.
 */
export function breakMinute(id: string, part: BreakPart): number {
  const [from, to] = BREAK_WINDOWS[part]
  return from + (hashSeed(`break-${part}-${id}`) % (to - from))
}

/** What an idle employee's break depends on. */
export interface BreakContext {
  minute: number
  /** Parts of today they've had a break in already. */
  taken: readonly BreakPart[]
  /** Customers waiting to be helped (or at the service counter). */
  waiting: number
  /** Staff on a break now. */
  onBreak: number
  /** Whether there's a break room up. */
  breakRoom: boolean
}

/**
 * Whether idle employee `e` goes for a break now, and in which part of the
 * day: with a break room up, once their time in a window has come, at most
 * once a morning and once an afternoon, never while customers wait and
 * never more than `MAX_ON_BREAK` at once. Null if they don't.
 */
export function wantsBreak(
  e: Pick<Employee, 'id' | 'fired' | 'quitting' | 'status'>,
  ctx: BreakContext,
): BreakPart | null {
  if (!ctx.breakRoom || e.fired || e.quitting || e.status !== 'atPost') return null
  if (ctx.waiting > 0 || ctx.onBreak >= MAX_ON_BREAK) return null
  const part = breakPart(ctx.minute)
  if (!part || ctx.taken.includes(part)) return null
  return ctx.minute >= breakMinute(e.id, part) ? part : null
}
