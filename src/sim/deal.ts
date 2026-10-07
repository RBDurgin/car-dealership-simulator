import {
  PLAYER_ID,
  reduceCustomers,
  staffHandled,
  type Customer,
  type CustomerPhase,
} from './customers'
import { washBlocker } from './cleanliness'
import type { Grid, Tile } from './grid'
import {
  approachTilesFor,
  carName,
  type ActionId,
  type Interactable,
  type InteractableKind,
} from './interactables'
import type { InventoryCar } from './inventory'
import { GUEST_CHAIR_ID, type CarModel } from './layout'
import type { Source } from './marketing'
import { emptyNazmaStats, type NazmaStats } from './nazma'
import type { OwnerVerdict } from './owner'
import type { QuotaResult } from './quota'
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
 * A guest chair (the office's by default) is taken: someone is signing there,
 * or on their way over to sign.
 */
export function guestChairBusy(
  customers: readonly Customer[],
  chairId: string = GUEST_CHAIR_ID,
): boolean {
  return customers.some(
    (c) => c.chairId === chairId && (c.phase === 'signing' || c.phase === 'following'),
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

/**
 * Whether employee `id` has buyers they haven't finished with: handed off to
 * finance, or a salesperson's buyer on the way to (or at) their desk.
 */
export function hasBuyersInHand(customers: readonly Customer[], id: string): boolean {
  return customers.some((c) => c.handlerId === id && FINANCE_PHASES.includes(c.phase))
}

/** Finance has buyers in the lounge, or one on the way to or at the office desk. */
export function financeBusy(customers: readonly Customer[]): boolean {
  return customers.some(
    (c) => staffHandled(c) && (c.phase === 'queued' || guestChairBusy([c], GUEST_CHAIR_ID)),
  )
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
  inventory: readonly InventoryCar[],
): string | null {
  if (action === 'wash') return washBlocker(inventory.find((c) => c.id === targetId))
  if (isCustomerAction(action)) {
    const c = customers.find((x) => x.id === targetId)
    if (!c || c.phase === 'leaving') return `${c?.name ?? 'The customer'} left.`
    if (staffHandled(c)) {
      const by = roster.find((e) => e.id === c.handlerId)
      return by ? `${by.name} is helping ${c.name}.` : `${c.name} is being helped.`
    }
    return customerActions(c).includes(action) ? null : `${c.name} is busy.`
  }
  const deal = dealCustomer(customers, PLAYER_ID)
  if (action === 'closeDeal') {
    if (financeOnDuty(roster)) return 'Your finance manager does the paperwork. Hand buyers off.'
    if (financeBusy(customers)) return 'Finance is still using the desk.'
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
  /** The car's sticker price and what the dealership paid for it. */
  msrp: number
  cost: number
  /** Game minute the paperwork was signed. */
  minute: number
  /** The salesperson who made the sale, or null when the player did. */
  soldBy: string | null
  /** The finance manager who signed it, or null when the seller did. */
  signedBy: string | null
  /** What staff earned on the sale, paid with the day's payroll. */
  commission: number
  /** What brought the buyer in. */
  source: Source
}

/** One day's results, for the end-of-day summary. */
export interface DayStats {
  visitors: number
  /** Of the visitors, passers-by who wandered in off the sidewalk. */
  walkIns: number
  /** Visitors by what brought them in. */
  bySource: Partial<Record<Source, number>>
  sales: Sale[]
  /** Walk-outs by reason. Buyers are counted in `sales`. */
  refused: number
  impatient: number
  closing: number
  /** Staff costs, paid once when the day is settled. */
  wages: number
  commissions: number
  /** Floor plan interest, charged with payroll. */
  interest: number
  /** Spent on ad campaigns today (paid when bought). */
  marketing: number
  /** Spent on improvements today (paid when bought). */
  improvements: number
  /** Customers who found none of the body types they wanted, by their first choice. */
  missed: Partial<Record<CarModel, number>>
  /** What the day did to reputation (set when settled; see `reputationChange`). */
  reputation: number
  /** Payroll has been paid for the day. */
  settled: boolean
  /** On an owner's day, how the day measured up to their goal (set when settled). */
  owner: OwnerVerdict | null
  /** What Nazma got up to today. */
  nazma: NazmaStats
  /** On the month's last day, the quota and the holdback it paid (set when settled). */
  quota: QuotaResult | null
}

export function emptyStats(): DayStats {
  return {
    visitors: 0,
    walkIns: 0,
    bySource: {},
    sales: [],
    refused: 0,
    impatient: 0,
    closing: 0,
    wages: 0,
    commissions: 0,
    interest: 0,
    marketing: 0,
    improvements: 0,
    missed: {},
    reputation: 0,
    settled: false,
    owner: null,
    nazma: emptyNazmaStats(),
    quota: null,
  }
}

export function revenue(stats: DayStats): number {
  return stats.sales.reduce((sum, s) => sum + s.price, 0)
}

/** What the cars sold today cost the dealership. */
export function costOfSales(stats: DayStats): number {
  return stats.sales.reduce((sum, s) => sum + s.cost, 0)
}

/** Revenue less the cost of the cars sold. */
export function grossProfit(stats: DayStats): number {
  return revenue(stats) - costOfSales(stats)
}

/** The cost of the stock Nazma stole overnight, written off. */
export function theftLoss(stats: DayStats): number {
  return stats.nazma.stolen.reduce((sum, c) => sum + c.cost, 0)
}

/**
 * Gross profit less the day's staff costs, floor plan interest, ad spend, improvements
 * and stolen stock, plus any bonus from the owner and the month-end holdback.
 */
export function netIncome(stats: DayStats): number {
  return (
    grossProfit(stats) -
    stats.wages -
    stats.commissions -
    stats.interest -
    stats.marketing -
    stats.improvements -
    theftLoss(stats) +
    (stats.owner?.bonus ?? 0) +
    (stats.quota?.payout ?? 0)
  )
}

/** Counts the new `arrived` customers as visitors, by what brought them in. */
export function recordVisitors(stats: DayStats, arrived: readonly Customer[]): DayStats {
  if (arrived.length === 0) return stats
  const bySource = { ...stats.bySource }
  for (const c of arrived) bySource[c.source] = (bySource[c.source] ?? 0) + 1
  return {
    ...stats,
    visitors: stats.visitors + arrived.length,
    walkIns: stats.walkIns + arrived.filter((c) => c.source === 'walk-in').length,
    bySource,
  }
}

/** One source's visitors and what they bought. */
export interface SourceTally {
  source: Source
  visitors: number
  cars: number
  gross: number
}

/** The day's visitors and sales by what brought them in, busiest first. */
export function salesBySource(stats: DayStats): SourceTally[] {
  const tallies = new Map<Source, SourceTally>()
  const tally = (source: Source) =>
    tallies.get(source) ?? { source, visitors: 0, cars: 0, gross: 0 }
  for (const [source, n] of Object.entries(stats.bySource) as [Source, number][]) {
    tallies.set(source, { ...tally(source), visitors: n })
  }
  for (const s of stats.sales) {
    const t = tally(s.source)
    tallies.set(s.source, { ...t, cars: t.cars + 1, gross: t.gross + s.price - s.cost })
  }
  return [...tallies.values()].sort((a, b) => b.visitors - a.visitors)
}

/**
 * Tallies the new `arrived` customers who can't find any body type they want
 * among the `available` cars, under their first choice. Returns the same stats
 * when everyone can.
 */
export function recordMissed(
  stats: DayStats,
  arrived: readonly Customer[],
  available: readonly InventoryCar[],
): DayStats {
  const inStock = new Set(available.map((c) => c.model))
  let missed = stats.missed
  for (const c of arrived) {
    if (c.preferredModels.some((m) => inStock.has(m))) continue
    const model = c.preferredModels[0]
    missed = { ...missed, [model]: (missed[model] ?? 0) + 1 }
  }
  return missed === stats.missed ? stats : { ...stats, missed }
}

/** "Summit Ridge ×2, Summit Hauler ×1": the missed demand, most asked-for first. Empty if none. */
export function missedSummary(missed: DayStats['missed']): string {
  return (Object.entries(missed) as [CarModel, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([model, n]) => `${carName(model)} ×${n}`)
    .join(', ')
}

/** One seller's share of the day's sales. */
export interface SellerTally {
  /** The salesperson's name, or null for the player. */
  seller: string | null
  cars: number
  revenue: number
  /** The sticker prices of these cars, added up. */
  msrp: number
  /** Revenue less the cost of these cars. */
  gross: number
  /** What staff earned on these sales (the salesperson's cut and any finance fee). */
  commission: number
}

/** The day's sales by who made them, the player first, then in order of first sale. */
export function salesBySeller(stats: DayStats): SellerTally[] {
  const tallies = new Map<string | null, SellerTally>()
  const sorted = [...stats.sales].sort(
    (a, b) => Number(a.soldBy !== null) - Number(b.soldBy !== null),
  )
  for (const s of sorted) {
    const t = tallies.get(s.soldBy) ?? {
      seller: s.soldBy,
      cars: 0,
      revenue: 0,
      msrp: 0,
      gross: 0,
      commission: 0,
    }
    tallies.set(s.soldBy, {
      ...t,
      cars: t.cars + 1,
      revenue: t.revenue + s.price,
      msrp: t.msrp + s.msrp,
      gross: t.gross + s.price - s.cost,
      commission: t.commission + s.commission,
    })
  }
  return [...tallies.values()]
}

/** How far under sticker a seller sold on average, as a share of MSRP (0.03 = 3% off). */
export function averageDiscount(t: SellerTally): number {
  return t.msrp > 0 ? (t.msrp - t.revenue) / t.msrp : 0
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
