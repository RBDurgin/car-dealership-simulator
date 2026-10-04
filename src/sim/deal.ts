import type { Customer, CustomerPhase } from './customers'
import type { Grid, Tile } from './grid'
import {
  approachTilesFor,
  type ActionId,
  type Interactable,
  type InteractableKind,
} from './interactables'
import type { CarModel } from './layout'

/**
 * Selling to a customer, from the player's side: which actions a customer offers,
 * what blocks an action, and the day's tally for the end-of-day summary.
 */

/** Phases in which a customer is dealing with the player. */
export const DEAL_PHASES: readonly CustomerPhase[] = [
  'talking',
  'considering',
  'following',
  'signing',
]
/** Phases in which the player is standing with the customer, talking. Walking off ends it. */
export const CONVERSATION_PHASES: readonly CustomerPhase[] = ['talking', 'considering']

/**
 * The customer the player is dealing with, from greeting until the deal is signed
 * or dropped. The store keeps it to at most one.
 */
export function dealCustomer(customers: readonly Customer[]): Customer | null {
  return customers.find((c) => DEAL_PHASES.includes(c.phase)) ?? null
}

/** Whether the player is standing talking with a customer, which walking off ends. */
export function inConversation(customers: readonly Customer[]): boolean {
  const deal = dealCustomer(customers)
  return !!deal && CONVERSATION_PHASES.includes(deal.phase)
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

/** Why `action` on `targetId` can't happen right now, or null if it can. */
export function actionBlocker(
  action: ActionId,
  targetId: string,
  customers: readonly Customer[],
): string | null {
  if (isCustomerAction(action)) {
    const c = customers.find((x) => x.id === targetId)
    if (!c || c.phase === 'leaving') return `${c?.name ?? 'The customer'} left.`
    return customerActions(c).includes(action) ? null : `${c.name} is busy.`
  }
  if (
    action === 'closeDeal' &&
    !customers.some((c) => ['following', 'signing'].includes(c.phase))
  ) {
    return 'Nobody is ready to sign. Make a sale first.'
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
