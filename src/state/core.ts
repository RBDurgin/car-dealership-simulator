import { reduceAction, type ActionEvent } from '../sim/actions'
import { combineSkews, usedStockSkew } from '../sim/archetypes'
import { browseDirt } from '../sim/cleanliness'
import { bookNames, recordClients, type ClientStats } from '../sim/clients'
import { isClosed } from '../sim/clock'
import { addCsi } from '../sim/csi'
import {
  PLAYER_ID,
  PLAYER_SKILL,
  reduceCustomers,
  type Customer,
  type CustomerPhase,
} from '../sim/customers'
import {
  actionBlocker,
  callNextBuyer,
  customerActions,
  dealCustomer,
  recordDepartures,
  recordMissed,
  type DayStats,
} from '../sim/deal'
import type { Tuning } from '../sim/difficulty'
import { eventOn } from '../sim/events'
import { addWork, type WorkCount } from '../sim/growth'
import { effectsOf, installed } from '../sim/improvements'
import { carName } from '../sim/interactables'
import { availableCars } from '../sim/inventory'
import { patienceFactor, type Employee } from '../sim/staff'
import { JOB_WANTS } from '../sim/serviceClients'
import { syncCarsOut } from '../sim/testDrive'
import { advisorAtPost, levelTuning } from './derived'
import { rng } from './rng'
import { endCall, pitch } from './slices/clients'
import {
  appraiseCar,
  board,
  closeDeal,
  greet,
  handOff,
  offer,
  startDrive,
} from './slices/customers'
import { wash } from './slices/economy'
import { settleDay } from './slices/day'
import { checkIn, offerFinding } from './slices/service'
import type { GameState } from './types'

/**
 * What the slices share: the store's `get`/`set` (batched, see `transactional`)
 * and the helpers more than one slice needs. Every helper takes the `Kit`.
 */

export type Patch = { [K in keyof GameState]?: GameState[K] }
export type SetState = (partial: Patch | ((s: GameState) => Patch)) => void

export interface Kit {
  get: () => GameState
  set: SetState
  /**
   * Runs `fn` with every `set` going into one draft that `get` reads back,
   * then stores the draft with one `set`, so listeners and selectors run once.
   * A batch inside a batch joins it.
   */
  batch: <T>(fn: () => T) => T
}

/** The store's `set`/`get`, wrapped so a `batch` stores its changes at once. */
export function transactional(rawSet: (partial: Patch) => void, rawGet: () => GameState): Kit {
  let draft: GameState | null = null
  const get = () => draft ?? rawGet()
  // Each set inside a batch copies the draft, so a state `get` handed out is
  // never changed after (copying only after a read measured no faster).
  const set: SetState = (partial) => {
    const p = typeof partial === 'function' ? partial(get()) : partial
    if (draft) draft = { ...draft, ...p }
    else rawSet(p)
  }
  const batch = <T>(fn: () => T): T => {
    if (draft) return fn()
    const start = rawGet()
    draft = start
    try {
      return fn()
    } finally {
      const done = draft
      draft = null
      if (done !== start) rawSet(done)
    }
  }
  return { get, set, batch }
}

export const notify = (k: Kit, text: string) => k.get().showNotice(text)

/** The levers of the game's difficulty level. */
export const tuning = (k: Kit): Tuning => levelTuning(k.get())

/** What the improvements up today add up to. */
export function upEffects(k: Kit) {
  const s = k.get()
  return effectsOf(installed(s.improvements, s.clock.day))
}

/**
 * What a new customer brings in with them today: the level's patience and
 * hoped-for discount, the showroom's cut to that discount, and on a sale
 * weekend a bigger hoped-for discount and a lean toward bargain hunters.
 * With no used car for sale, few used-car shoppers come (`usedStockSkew`).
 */
export function arrivalOpts(k: Kit) {
  const s = k.get()
  const event = eventOn(s.clock.day)
  const level = tuning(k)
  const skew = combineSkews(event?.skew ?? {}, usedStockSkew(availableCars(s.inventory)))
  return {
    patienceFactor: level.patience,
    expectShift: level.expect,
    taken: bookNames(s.clients),
    expectCut: upEffects(k).expectCut,
    ...(event && { extraDiscount: event.extraDiscount }),
    ...(Object.keys(skew).length > 0 && { skew }),
  }
}

/** `stats` with the book's tally, the same object when the tally hasn't changed. */
export function withClientStats(stats: DayStats, clients: ClientStats): DayStats {
  return stats.clients === clients ? stats : { ...stats, clients }
}

/** Counts new `arrived` customers who can't find a body type they want in stock. */
export function tallyMissed(k: Kit, stats: DayStats, arrived: readonly Customer[]): DayStats {
  return recordMissed(stats, arrived, availableCars(k.get().inventory))
}

/**
 * Stores a new customer list. Everything that follows from customers changing
 * happens here, one named step after another; the last one settles the day
 * once it's over (the only place it's settled).
 */
export function commit(k: Kit, next: Customer[]): void {
  const s = k.get()
  const customers = callNextBuyer(closeStep(s, next))
  if (customers !== s.customers) {
    k.set({
      customers,
      // Cars go out for test drives and come back (or a drive is called off).
      inventory: syncCarsOut(browseDirt(s.inventory, s.customers, customers), customers),
      ...departuresStep(k, s, customers),
      ...cleanupStep(s, customers),
    })
    announceWaiting(k, s.customers, customers)
  }
  settleDay(k)
  if (customers !== s.customers) cancelBlockedStep(k, customers)
}

/** After closing nobody goes back to waiting: everyone still about heads out. */
function closeStep(s: GameState, next: Customer[]): Customer[] {
  return isClosed(s.clock) ? reduceCustomers(next, { type: 'close' }) : next
}

/**
 * Walk-outs are tallied, and the client book takes in who left (with the
 * month's CSI taking in today's new-car buyers as they're scored).
 */
function departuresStep(k: Kit, s: GameState, customers: readonly Customer[]): Patch {
  const book = recordClients(s.clients, s.dayStats.clients, s.customers, customers, {
    inventory: s.inventory,
    day: s.clock.day,
    shift: tuning(k).satisfactionShift,
    rng: rng.client,
  })
  const scored = book.stats.scores.slice(s.dayStats.clients.scores.length)
  return {
    clients: book.book,
    monthCsi: addCsi(s.monthCsi, scored),
    dayStats: withClientStats(recordDepartures(s.dayStats, s.customers, customers), book.stats),
  }
}

/** The menu and hover drop a customer who left, or has nothing left to offer. */
function cleanupStep(s: GameState, customers: readonly Customer[]): Patch {
  const gone = (id: string | null) => {
    if (!id || !s.customers.some((c) => c.id === id)) return false
    const c = customers.find((x) => x.id === id)
    return !c || customerActions(c, s.serviceJobs).length === 0
  }
  return {
    menu: gone(s.menu?.targetId ?? null) ? null : s.menu,
    hoveredId: gone(s.hoveredId) ? null : s.hoveredId,
  }
}

/**
 * The player's action stops when it's aimed at a customer who left or moved
 * on (e.g. ran out of patience on the way), or a deal to close with nobody
 * left to sign it.
 */
function cancelBlockedStep(k: Kit, customers: Customer[]): void {
  const s = k.get()
  const a = s.activeAction
  const blocker =
    a && actionBlocker(a.action, a.targetId, customers, s.roster, s.inventory, s.serviceJobs)
  if (a && blocker) {
    dispatch(k, { type: 'cancel' })
    notify(k, blocker)
  }
}

/**
 * The receptionist lets the player know when someone done browsing starts
 * waiting. With no service advisor at the counter, the player hears about
 * service clients there too.
 */
function announceWaiting(k: Kit, prev: readonly Customer[], next: readonly Customer[]): void {
  const s = k.get()
  const reception = patienceFactor(s.roster) !== 1
  const advisor = advisorAtPost(s.roster)
  for (const c of next) {
    if (c.phase !== 'waiting') continue
    const was = prev.find((x) => x.id === c.id)?.phase
    if (was !== 'arriving' && was !== 'browsing') continue
    if (c.service) {
      if (!advisor) {
        notify(
          k,
          `${c.name} drove in for ${JOB_WANTS[c.service.kind]}. They're at the service counter.`,
        )
      }
      continue
    }
    if (!reception) continue
    if (c.selling && c.vehicle) {
      notify(
        k,
        `${c.name} wants to sell their ${carName(c.vehicle.car.model)}. They're waiting by it.`,
      )
      continue
    }
    const carId = c.browseCarIds[c.browseCarIds.length - 1]
    const car = s.inventory.find((x) => x.id === carId)
    notify(k, `${c.name} is waiting ${car ? `by the ${carName(car.model)}` : 'out front'}.`)
  }
}

/** Moves the player's action along, and carries out one that finished. */
export function dispatch(k: Kit, ev: ActionEvent): void {
  const { get, set } = k
  const prev = get().activeAction
  const { next, finished } = reduceAction(prev, ev)
  set({ activeAction: next })
  // Getting up from the desk mid-paperwork leaves the customer waiting.
  if (prev?.action === 'closeDeal' && next?.id !== prev.id && finished?.id !== prev.id) {
    endDeal(k, ['signing'])
  }
  if (!finished) return
  switch (finished.action) {
    case 'inspect':
      return set({ inspectedId: finished.targetId })
    case 'wash':
      return wash(k, finished.targetId)
    case 'getCoffee':
      return notify(k, 'Ahh, fresh coffee.')
    case 'greet':
    case 'makeOffer':
      return greet(k, finished.targetId)
    case 'appraise':
      return appraiseCar(k, finished.targetId)
    case 'checkIn':
      return checkIn(k, finished.targetId, PLAYER_ID)
    case 'recommend': {
      const c = get().customers.find((x) => x.id === finished.targetId)
      return c?.service?.jobId ? offerFinding(k, c.service.jobId, PLAYER_ID) : undefined
    }
    case 'pitch':
      return pitch(k, finished.targetId)
    case 'offer':
      return offer(k, finished.targetId)
    case 'testDrive':
      return startDrive(k, finished.targetId)
    case 'ride':
      return board(k, finished.targetId)
    case 'closeDeal':
      return closeDeal(k)
    case 'handOff':
      return handOff(k)
    case 'office':
      return get().toggleStockPanel(true)
    case 'call': {
      const id = get().playerCall
      set({ playerCall: null })
      return id ? endCall(k, id, PLAYER_ID, PLAYER_SKILL) : undefined
    }
    case 'recondition':
      return void get().recondition(finished.targetId)
    case 'fixDing':
      return void get().fixDing(finished.targetId)
    case 'confront':
      return get().nazmaRunOff('player')
  }
}

/** Puts the player's deal customer back to waiting if they're in one of `phases`. */
export function endDeal(
  k: Kit,
  phases: readonly CustomerPhase[],
  message?: (name: string) => string,
): void {
  const deal = dealCustomer(k.get().customers, PLAYER_ID)
  if (!deal || !phases.includes(deal.phase)) return
  commit(k, reduceCustomers(k.get().customers, { type: 'cancel', id: deal.id }))
  if (message) notify(k, message(deal.name))
}

/** Stores a new roster, dropping hovers, menus and panels aimed at anyone who's gone. */
export function setRoster(k: Kit, roster: Employee[]): void {
  const s = k.get()
  if (roster === s.roster) return
  const gone = (id: string | null) =>
    !!id && s.roster.some((e) => e.id === id) && !roster.some((e) => e.id === id)
  k.set({
    roster,
    menu: gone(s.menu?.targetId ?? null) ? null : s.menu,
    hoveredId: gone(s.hoveredId) ? null : s.hoveredId,
    inspectedId: gone(s.inspectedId) ? null : s.inspectedId,
  })
  const a = s.activeAction
  if (a && gone(a.targetId)) dispatch(k, { type: 'cancel' })
}

/** Counts `n` more of `count` toward employee `id`'s work today (not the player's). */
export function tallyWork(k: Kit, id: string | null | undefined, count: WorkCount | 'came', n = 1) {
  if (!id || id === PLAYER_ID || n <= 0) return
  const stats = k.get().dayStats
  if (!k.get().roster.some((e) => e.id === id)) return
  const staffWork = addWork(stats.staffWork, id, count, n)
  if (staffWork !== stats.staffWork) k.set({ dayStats: { ...stats, staffWork } })
}

/** `n` more staff left today, let go or quitting, which gets the rest down at closing. */
export function lostCoworkers(k: Kit, n: number): void {
  const stats = k.get().dayStats
  k.set({ dayStats: { ...stats, coworkersLost: stats.coworkersLost + n } })
}
