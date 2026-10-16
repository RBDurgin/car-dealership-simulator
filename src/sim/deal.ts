import { ARCHETYPES } from './archetypes'
import {
  PLAYER_ID,
  reduceCustomers,
  staffHandled,
  type Customer,
  type CustomerPhase,
} from './customers'
import { washBlocker } from './cleanliness'
import { emptyClientStats, type Client, type ClientStats } from './clients'
import type { Grid, Tile } from './grid'
import { seniorFeeBonus, type CourseDone, type LevelUp, type StaffWork } from './growth'
import {
  approachTilesFor,
  carName,
  type ActionId,
  type Interactable,
  type InteractableKind,
} from './interactables'
import type { InventoryCar } from './inventory'
import { emptyFiStats, fiDayGross, type FiStats, type SaleFi } from './fi'
import { DESK_CHAIR_ID, GUEST_CHAIR_ID, MANAGER_DESK, type CarModel } from './layout'
import type { Source } from './marketing'
import { emptyNazmaStats, type NazmaStats } from './nazma'
import { roundOf } from './negotiation'
import type { RivalStats } from './rival'
import type { OwnerVerdict } from './owner'
import type { RankId } from './progression'
import type { RecordKey } from './stats'
import type { QuotaResult } from './quota'
import { vehicleOwnerId, type BoughtCar } from './sellers'
import { emptyServiceStats, openFinding, type ServiceJob, type ServiceStats } from './service'
import { financeCommission, financeOnDuty, salesCommission, type Employee } from './staff'
import { driveBlocker, drivePending } from './testDrive'
import { tradeOver, tradeRecord, type TradeRecord } from './tradeIns'

/**
 * Selling to a customer: who is dealing with whom, which actions a customer
 * offers the player, what blocks an action, and the day's tally for the
 * end-of-day summary.
 */

/** Phases in which a customer is dealing with their handler. */
export const DEAL_PHASES: readonly CustomerPhase[] = [
  'talking',
  'driving',
  'considering',
  'following',
  'signing',
  'menu',
]
/**
 * Phases in which the player is with the customer, talking: standing with
 * them, or across the desk at the F&I menu. Walking off ends it.
 */
export const CONVERSATION_PHASES: readonly CustomerPhase[] = ['talking', 'considering', 'menu']

/**
 * The guest chair across from the desk chair `deskChairId` the player closes
 * at: the office's, or their own desk's on the showroom floor.
 */
export function guestChairOf(deskChairId: string): string {
  return deskChairId === MANAGER_DESK.chairId ? MANAGER_DESK.guestChairId : GUEST_CHAIR_ID
}

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
    (c) =>
      c.chairId === chairId &&
      (c.phase === 'signing' || c.phase === 'following' || c.phase === 'menu'),
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

/**
 * What the player can do with a customer right now. A seller waits for an
 * offer, a service client to be checked in, or told about extra work the
 * mechanic found on their car (among today's `jobs`). Nothing while staff have them.
 */
export function customerActions(c: Customer, jobs: readonly ServiceJob[] = []): ActionId[] {
  if (staffHandled(c)) return []
  // A service client is checked in at the counter, then left to the garage.
  const visit = c.service
  if (visit) {
    if (c.phase === 'waiting') return ['checkIn']
    if (c.phase !== 'servicing') return []
    const job = jobs.find((j) => j.id === visit.jobId)
    const out: ActionId[] = openFinding(job) ? ['recommend'] : []
    // A client from the book due to trade up soon, waiting on their car.
    if (visit.pitch && !visit.dropOff && !visit.returned) out.push('pitch')
    return out
  }
  switch (c.phase) {
    case 'browsing':
    case 'waiting':
      return c.selling ? ['makeOffer'] : ['greet']
    case 'talking':
      // On the way to a test drive, there's only the car to get to.
      if (drivePending(c)) return []
      return c.selling || c.drive ? ['offer'] : ['offer', 'testDrive']
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

export function customerInteractable(
  grid: Grid,
  c: Customer,
  tile: Tile,
  jobs: readonly ServiceJob[] = [],
): Interactable {
  return personInteractable(grid, c, 'customer', tile, customerActions(c, jobs))
}

const CUSTOMER_ACTIONS: ReadonlySet<ActionId> = new Set([
  'greet',
  'makeOffer',
  'offer',
  'checkIn',
  'recommend',
  'pitch',
  'testDrive',
])

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
  jobs: readonly ServiceJob[] = [],
): string | null {
  if (action === 'wash') return washBlocker(inventory.find((c) => c.id === targetId))
  if (action === 'appraise')
    return appraiseBlocker(customers.find((c) => c.id === vehicleOwnerId(targetId)))
  if (isCustomerAction(action)) {
    const c = customers.find((x) => x.id === targetId)
    if (!c || c.phase === 'leaving') return `${c?.name ?? 'The customer'} left.`
    if (staffHandled(c)) {
      const by = roster.find((e) => e.id === c.handlerId)
      return by ? `${by.name} is helping ${c.name}.` : `${c.name} is being helped.`
    }
    if (action === 'testDrive') return driveBlocker(c, inventory)
    if (action === 'recommend' && !customerActions(c, jobs).includes(action)) {
      return `There's nothing more to offer ${c.name}.`
    }
    return customerActions(c, jobs).includes(action) ? null : `${c.name} is busy.`
  }
  const deal = dealCustomer(customers, PLAYER_ID)
  if (action === 'ride') {
    return deal?.phase === 'talking' && deal.drive?.carId === targetId && !deal.drive.back
      ? null
      : 'Nobody is waiting to drive it.'
  }
  if (action === 'closeDeal') {
    // The player's own desk is theirs alone: only the office desk is finance's.
    if (targetId === DESK_CHAIR_ID) {
      if (financeOnDuty(roster)) return 'Your finance manager does the paperwork. Hand buyers off.'
      if (financeBusy(customers)) return 'Finance is still using the desk.'
    }
    if (deal?.phase !== 'following' && deal?.phase !== 'signing') return NOBODY_TO_SIGN
  }
  if (action === 'handOff') {
    if (!financeOnDuty(roster)) return 'No finance manager on shift.'
    if (deal?.phase !== 'following') return NOBODY_TO_SIGN
  }
  return null
}

/** Why the player can't appraise customer `c`'s car (a seller's, or a trade-in), or null if they can. */
export function appraiseBlocker(c: Customer | undefined): string | null {
  if (!c?.vehicle || c.phase === 'leaving') return 'They drove off.'
  const look = c.selling ?? c.trade
  if (!look) return "It isn't for sale."
  if (look.appraised) return "You've already appraised it."
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
  /** Their employee id, while `soldBy` is set. */
  sellerId?: string
  /** The finance manager who signed it, or null when the seller did. */
  signedBy: string | null
  /** What staff earned on the sale, paid with the day's payroll. */
  commission: number
  /** Of `commission`, what the finance manager earned for signing it, while `signedBy` is set. */
  financeCommission?: number
  /** What brought the buyer in. */
  source: Source
  /** The car they traded in, if they did. */
  trade?: TradeRecord
  /** The car sold was a used one. */
  used?: boolean
  /** Sold to a client from the book, back for another car. */
  returning?: boolean
  /** Closed after the buyer's last counter, when they had no rounds left. */
  lastRound?: boolean
  /**
   * The loan and the F&I menu: the player's or the finance manager's menu, or
   * a salesperson's loan at the buy rate with no products.
   */
  fi?: SaleFi
}

/** What `saleRecord` needs to know besides the buyer and the car. */
export interface SaleTerms {
  price: number
  /** The day and minute the paperwork was signed. */
  day: number
  minute: number
  /** Today's payroll, to name the salesperson who made the sale. */
  roster: readonly Employee[]
  /** The employee at the desk (finance, or the salesperson), null for the player. */
  signer: Employee | null
  /** The client book, to mark a sale to a returning client. */
  book: readonly Client[]
  /** What we allowed for their trade-in, or null without one in the deal. */
  tradePrice: number | null
  /** The loan and the F&I menu, when the buyer had them. */
  fi?: SaleFi
}

/** The record of `c` buying `car`: who sold and signed it, the commission and what went with it. */
export function saleRecord(c: Customer, car: InventoryCar, t: SaleTerms): Sale {
  // Who made the sale. A salesperson let go since is no longer on the roster.
  const seller =
    c.sellerId && c.sellerId !== PLAYER_ID
      ? (t.roster.find((e) => e.id === c.sellerId)?.name ?? 'Former staff')
      : null
  const finance = t.signer?.role === 'finance' ? t.signer : null
  const financePay = finance ? financeCommission(t.fi?.gross ?? 0, seniorFeeBonus(finance)) : 0
  const sale: Sale = {
    customerName: c.name,
    carId: car.id,
    model: car.model,
    price: t.price,
    msrp: car.msrp,
    cost: car.cost,
    minute: t.minute,
    soldBy: seller,
    ...(seller && { sellerId: c.sellerId as string }),
    signedBy: finance?.name ?? null,
    commission: (seller ? salesCommission(t.price, car.cost) : 0) + financePay,
    source: c.source,
  }
  if (finance) sale.financeCommission = financePay
  const trade = t.tradePrice !== null && tradeRecord(c, t.tradePrice, t.day)
  if (trade) sale.trade = trade
  if (car.used) sale.used = true
  if (t.fi) sale.fi = t.fi
  if (c.haggle && roundOf(c) >= ARCHETYPES[c.archetype].haggle.rounds) sale.lastRound = true
  if (t.book.some((x) => x.id === c.clientId && x.status === 'client')) sale.returning = true
  return sale
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
  /** Spent on expansions today (paid when bought). */
  expansions: number
  /** Customers who found none of the body types they wanted, by their first choice. */
  missed: Partial<Record<CarModel, number>>
  /** Used-car shoppers who came in with no used car for sale. */
  missedUsed: number
  /** What the day did to reputation (set when settled; see `reputationChange`). */
  reputation: number
  /** Records the day took from an earlier one (set when settled; see `sim/stats.ts`). */
  newRecords: RecordKey[]
  /** Payroll has been paid for the day. */
  settled: boolean
  /** On an owner's day, how the day measured up to their goal (set when settled). */
  owner: OwnerVerdict | null
  /** What Nazma got up to today. */
  nazma: NazmaStats
  /** On the month's last day, the quota and the holdback it paid (set when settled). */
  quota: QuotaResult | null
  /**
   * What the bank put in to bring a negative balance back to $0 (Easy's
   * one-time safety net), set when settled. A rescue, not income.
   */
  bailout: number
  /** Used cars bought from sellers today: stock, not an expense, so off `netIncome`. */
  bought: BoughtCar[]
  /** Cars the player washed themselves today. */
  washes: number
  /** The rank reached when the day was settled, or null if it didn't change. */
  rankUp: RankId | null
  /** How Nazma's lot across the road stood today, or null while it isn't open. */
  rival: RivalStats | null
  /** The service department's day (see `sim/service.ts`). */
  service: ServiceStats
  /** What the client book did today (see `sim/clients.ts`). */
  clients: ClientStats
  /** Loans and the F&I menu today (see `sim/fi.ts`). */
  fi: FiStats
  /** Test drives today: back from the road, of those how many bought, how many were cut short and how many came back dinged. */
  drives: DriveStats
  /** What each employee did today, by id (see `sim/growth.ts`). */
  staffWork: StaffWork
  /** Who levelled up when the day was settled. */
  levelUps: LevelUp[]
  /** Whose raise request lapsed unanswered when the day was settled. */
  raisesLapsed: string[]
  /** Ids of those whose raise request the player turned down today (see `sim/morale.ts`). */
  raisesDeclined: string[]
  /** Staff who left today, let go or quitting: it gets the rest down. */
  coworkersLost: number
  /** Ids of those who handed in notice this morning over low morale. */
  resigned: string[]
  /** Names of those who left at closing over low morale (the rest of `nazma.quit` were poached). */
  moraleQuits: string[]
  /** Ids of those who had the day off (see `sim/rota.ts`): not paid, and their streak resets. */
  off: string[]
  /** The day's wages of those who quit at closing, paid with the rest though they've gone. */
  quitWages: number
  /** Course fees paid this morning for those away training today (see `sim/growth.ts`). */
  training: number
  /** Courses finished when the day was settled. */
  courses: CourseDone[]
}

/** A day's test drives (see `sim/testDrive.ts`). */
export interface DriveStats {
  taken: number
  bought: number
  cut: number
  /** Taken by salespeople (the rest by the player). */
  byStaff: number
  dings: number
  /** The player's drives where every talking point suited the buyer (see `perfectDrive`). */
  perfect: number
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
    expansions: 0,
    missed: {},
    missedUsed: 0,
    reputation: 0,
    newRecords: [],
    settled: false,
    owner: null,
    nazma: emptyNazmaStats(),
    quota: null,
    bailout: 0,
    bought: [],
    washes: 0,
    rankUp: null,
    rival: null,
    service: emptyServiceStats(),
    clients: emptyClientStats(),
    fi: emptyFiStats(),
    drives: { taken: 0, bought: 0, cut: 0, byStaff: 0, dings: 0, perfect: 0 },
    staffWork: {},
    levelUps: [],
    raisesLapsed: [],
    raisesDeclined: [],
    coworkersLost: 0,
    resigned: [],
    moraleQuits: [],
    off: [],
    quitWages: 0,
    training: 0,
    courses: [],
  }
}

export function revenue(stats: DayStats): number {
  return stats.sales.reduce((sum, s) => sum + s.price, 0)
}

/** What the cars sold today cost the dealership. */
export function costOfSales(stats: DayStats): number {
  return stats.sales.reduce((sum, s) => sum + s.cost, 0)
}

/** Revenue less the cost of the cars sold. Car sales only: see `totalGross`. */
export function grossProfit(stats: DayStats): number {
  return revenue(stats) - costOfSales(stats)
}

/**
 * The service department's gross: labor and parts billed less what the parts
 * cost, plus the manufacturer's and warranty company's pay, less overtime.
 */
export function serviceGross(stats: DayStats): number {
  const s = stats.service
  return s.labor + s.parts - s.partsCost + s.warranty + s.contract - s.overtime
}

/** Gross profit on car sales, F&I and service together, for the career and the owner. */
export function totalGross(stats: DayStats): number {
  return grossProfit(stats) + fiDayGross(stats.fi) + serviceGross(stats)
}

/** Gross profit on new cars and on used ones, apart, and the F&I on top of them. */
export function grossSplit(stats: DayStats): { new: number; used: number; fi: number } {
  const split = { new: 0, used: 0, fi: fiDayGross(stats.fi) }
  for (const s of stats.sales) split[s.used ? 'used' : 'new'] += s.price - s.cost
  return split
}

/** The cost of the stock Nazma stole overnight, written off. */
export function theftLoss(stats: DayStats): number {
  return stats.nazma.stolen.reduce((sum, c) => sum + c.cost, 0)
}

/**
 * Gross profit on sales, F&I and service less the day's staff costs, floor plan
 * interest, ad spend, improvements, expansions, referral fees, a client
 * appreciation day and stolen stock, plus any bonus from the owner and the
 * month-end holdback.
 */
export function netIncome(stats: DayStats): number {
  return (
    totalGross(stats) -
    stats.wages -
    stats.commissions -
    stats.interest -
    stats.marketing -
    stats.improvements -
    stats.expansions -
    stats.clients.referralFees -
    stats.clients.appreciation -
    stats.training -
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
 * among the `available` cars, under their first choice, and the used-car
 * shoppers who find no used car (`missedUsed`). Returns the same stats when
 * everyone can.
 */
export function recordMissed(
  stats: DayStats,
  arrived: readonly Customer[],
  available: readonly InventoryCar[],
): DayStats {
  const inStock = new Set(available.map((c) => c.model))
  let missed = stats.missed
  let missedUsed = stats.missedUsed
  const usedInStock = available.some((c) => c.used)
  for (const c of arrived) {
    // A seller or a service client isn't shopping.
    if (c.selling || c.service) continue
    // A used-car shopper is missed for want of a used car, whatever its body type.
    if (c.archetype === 'used-shopper') {
      if (!usedInStock) missedUsed++
      continue
    }
    if (c.preferredModels.some((m) => inStock.has(m))) continue
    const model = c.preferredModels[0]
    missed = { ...missed, [model]: (missed[model] ?? 0) + 1 }
  }
  return missed === stats.missed && missedUsed === stats.missedUsed
    ? stats
    : { ...stats, missed, missedUsed }
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
  /** What the salesperson earned on these sales (the finance manager's pay is his own row). */
  commission: number
  /** Trade-ins taken on these sales, and how much over their value they were allowed (under if negative). */
  trades: number
  tradeOver: number
  /** F&I made at the seller's own desk: the player's menu, or a salesperson's loan. */
  fi: number
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
      trades: 0,
      tradeOver: 0,
      fi: 0,
    }
    tallies.set(s.soldBy, {
      ...t,
      cars: t.cars + 1,
      revenue: t.revenue + s.price,
      msrp: t.msrp + s.msrp,
      gross: t.gross + s.price - s.cost,
      commission: t.commission + s.commission - (s.financeCommission ?? 0),
      trades: t.trades + (s.trade ? 1 : 0),
      tradeOver: t.tradeOver + (s.trade ? tradeOver(s.trade) : 0),
      fi: t.fi + (s.signedBy === null ? (s.fi?.gross ?? 0) : 0),
    })
  }
  return [...tallies.values()]
}

/** The deals a finance manager signed today: how many, their F&I and his pay on them. */
export interface FinanceTally {
  name: string
  deals: number
  fi: number
  commission: number
}

/** The day's deals by the finance manager who signed them, in order of first deal. */
export function salesByFinance(stats: DayStats): FinanceTally[] {
  const tallies = new Map<string, FinanceTally>()
  for (const s of stats.sales) {
    if (s.signedBy === null) continue
    const t = tallies.get(s.signedBy) ?? { name: s.signedBy, deals: 0, fi: 0, commission: 0 }
    tallies.set(s.signedBy, {
      ...t,
      deals: t.deals + 1,
      fi: t.fi + (s.fi?.gross ?? 0),
      commission: t.commission + (s.financeCommission ?? 0),
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
