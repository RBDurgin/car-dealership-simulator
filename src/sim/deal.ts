import {
  PLAYER_ID,
  reduceCustomers,
  staffHandled,
  type Customer,
  type CustomerPhase,
} from './customers'
import type { Grid, Tile } from './grid'
import {
  approachTilesFor,
  type ActionId,
  type Interactable,
  type InteractableKind,
} from './interactables'
import type { CarModel } from './layout'
import { financeOnDuty, type Employee } from './staff'

/**
 * Selling to a customer: who is dealing with whom, which actions a customer
 * offers the player, what blocks an action, and the day's tally for the
 * end-of-day summary.
 */

/** Phases in which a customer is dealing with their handler. */
export const DEAL_PHASES: readonly CustomerPhase[] = [
  'talking',
  'considering',
  'following',
  'signing',
]
/** Phases in which the player is standing with the customer, talking. Walking off ends it. */
export const CONVERSATION_PHASES: readonly CustomerPhase[] = ['talking', 'considering']

/**
 * The customer `handlerId` (the player or a salesperson) is dealing with, from
 * greeting until the deal is signed, dropped or handed off. The store keeps it
 * to at most one per handler.
 */
export function dealCustomer(customers: readonly Customer[], handlerId: string): Customer | null {
  return customers.find((c) => c.handlerId === handlerId && DEAL_PHASES.includes(c.phase)) ?? null
}

/** Whether the player is standing talking with a customer, which walking off ends. */
export function inConversation(customers: readonly Customer[]): boolean {
  const deal = dealCustomer(customers, PLAYER_ID)
  return !!deal && CONVERSATION_PHASES.includes(deal.phase)
}

/**
 * The office guest chair is taken: someone is signing there, or on their way
 * over to sign with finance.
 */
export function guestChairBusy(customers: readonly Customer[]): boolean {
  return customers.some(
    (c) => c.phase === 'signing' || (c.phase === 'following' && staffHandled(c)),
  )
}

/**
 * Calls the first buyer waiting in the lounge over to the desk once the guest
 * chair is free. Returns the same array when there's nobody to call.
 */
export function callNextBuyer(customers: Customer[]): Customer[] {
  if (guestChairBusy(customers)) return customers
  const next = customers.find((c) => c.phase === 'queued')
  return next ? reduceCustomers(customers, { type: 'call', id: next.id }) : customers
}

/** Phases of a buyer handed off to finance: in the lounge, on the way to the desk, signing. */
export const FINANCE_PHASES: readonly CustomerPhase[] = ['queued', 'following', 'signing']

/** Whether employee `id` has buyers handed off to them that they haven't finished with. */
export function hasBuyersInHand(customers: readonly Customer[], id: string): boolean {
  return customers.some((c) => c.handlerId === id && FINANCE_PHASES.includes(c.phase))
}

/**
 * What the office desk chair offers: with a finance manager on duty they sit
 * there and the player hands buyers off; otherwise the player signs.
 */
export function deskActions(roster: readonly Employee[]): ActionId[] {
  return financeOnDuty(roster) ? ['handOff'] : ['sit', 'closeDeal']
}

/**
 * What the player can do with an employee. The finance manager on duty sits in
 * the desk chair, so clicks on the desk land on them: they take hand-offs too.
 */
export function employeeActions(e: Employee, roster: readonly Employee[]): ActionId[] {
  return financeOnDuty(roster)?.id === e.id ? ['handOff', 'inspect'] : ['inspect']
}

/** What the player can do with a customer right now. */
export function customerActions(c: Customer): ActionId[] {
  switch (c.phase) {
    case 'browsing':
    case 'waiting':
      return ['greet']
    case 'talking':
      return ['offer']
    default:
      return []
  }
}

/**
 * A person as an action target, approached from the tile they stand on now.
 * Rebuilt on demand: unlike props, people move.
 */
export function personInteractable(
  grid: Grid,
  person: { id: string; name: string },
  kind: InteractableKind,
  tile: Tile,
  actions: ActionId[],
): Interactable {
  const rect = { tx: tile.tx, tz: tile.tz, w: 1, h: 1 }
  return {
    id: person.id,
    kind,
    name: person.name,
    rect,
    facing: 0,
    approachTiles: approachTilesFor(grid, rect),
    actions,
  }
}

export function customerInteractable(grid: Grid, c: Customer, tile: Tile): Interactable {
  return personInteractable(grid, c, 'customer', tile, customerActions(c))
}

const CUSTOMER_ACTIONS: ReadonlySet<ActionId> = new Set(['greet', 'offer'])

export function isCustomerAction(action: ActionId): boolean {
  return CUSTOMER_ACTIONS.has(action)
}

const NOBODY_TO_SIGN = 'Nobody is ready to sign. Make a sale first.'

/** Why the player can't do `action` on `targetId` right now, or null if they can. */
export function actionBlocker(
  action: ActionId,
  targetId: string,
  customers: readonly Customer[],
  roster: readonly Employee[],
): string | null {
  if (isCustomerAction(action)) {
    const c = customers.find((x) => x.id === targetId)
    if (!c || c.phase === 'leaving') return `${c?.name ?? 'The customer'} left.`
    if (staffHandled(c)) return `${c.name} is being helped.`
    return customerActions(c).includes(action) ? null : `${c.name} is busy.`
  }
  const deal = dealCustomer(customers, PLAYER_ID)
  if (action === 'closeDeal') {
    if (financeOnDuty(roster)) return 'Your finance manager does the paperwork. Hand buyers off.'
    if (customers.some((c) => staffHandled(c) && FINANCE_PHASES.includes(c.phase))) {
      return 'Finance is still using the desk.'
    }
    if (deal?.phase !== 'following' && deal?.phase !== 'signing') return NOBODY_TO_SIGN
  }
  if (action === 'handOff') {
    if (!financeOnDuty(roster)) return 'No finance manager on shift.'
    if (deal?.phase !== 'following') return NOBODY_TO_SIGN
  }
  return null
}

/** The rough budget a customer admits to when greeted: their real budget to the nearest $5k. */
export function budgetHint(c: Customer): number {
  return Math.max(5000, Math.round(c.budget / 5000) * 5000)
}

export interface Sale {
  customerName: string
  carId: string
  model: CarModel
  price: number
  /** Game minute the paperwork was signed. */
  minute: number
  /** The employee who signed it, or null when the player did. */
  signedBy: string | null
  /** What staff earned on the sale, paid with the day's payroll. */
  commission: number
}

/** One day's results, for the end-of-day summary. */
export interface DayStats {
  visitors: number
  sales: Sale[]
  /** Walk-outs by reason. Buyers are counted in `sales`. */
  refused: number
  impatient: number
  closing: number
  /** Staff costs, paid once when the day is settled. */
  wages: number
  commissions: number
  /** Payroll has been paid for the day. */
  settled: boolean
}

export function emptyStats(): DayStats {
  return {
    visitors: 0,
    sales: [],
    refused: 0,
    impatient: 0,
    closing: 0,
    wages: 0,
    commissions: 0,
    settled: false,
  }
}

export function revenue(stats: DayStats): number {
  return stats.sales.reduce((sum, s) => sum + s.price, 0)
}

/** Revenue less the day's staff costs. */
export function netIncome(stats: DayStats): number {
  return revenue(stats) - stats.wages - stats.commissions
}

export function walkOuts(stats: DayStats): number {
  return stats.refused + stats.impatient + stats.closing
}

/**
 * Counts the customers who started leaving between `prev` and `next` without
 * buying. Returns the same stats when nobody did.
 */
export function recordDepartures(
  stats: DayStats,
  prev: readonly Customer[],
  next: readonly Customer[],
): DayStats {
  const wasLeaving = new Set(prev.filter((c) => c.phase === 'leaving').map((c) => c.id))
  let out = stats
  for (const c of next) {
    if (c.phase !== 'leaving' || wasLeaving.has(c.id)) continue
    const reason = c.leaveReason
    if (reason === 'refused' || reason === 'impatient' || reason === 'closing') {
      out = { ...out, [reason]: out[reason] + 1 }
    }
  }
  return out
}
