import { calendarOf, DAYS_PER_WEEK, weekStart } from './calendar'
import { orderable, type FranchiseTier } from './franchise'
import { roundTo100, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import type { Slot } from './ordering'
import { rankById, RANKS, type Career, type RankId } from './progression'
import { createRng } from './rng'
import { lotSlotFor, NO_CASH, NO_ROOM, type BuyBook } from './sellers'
import {
  gradeOf,
  marketValue,
  rollUsedCar,
  usedStockCar,
  type Grade,
  type UsedInfo,
} from './usedCars'

/**
 * The dealer auction: every Wednesday a run list of used cars is sold to the
 * trade, one lot at a time. The schedule and the list are derived from the
 * day number, like the calendar's sale weekends, so nothing about them is
 * saved. A lot won holds a lot space for the day and goes into stock when the
 * day is settled, like a car bought from a seller.
 */

/** The auction is held on Wednesdays (0 = Monday). */
export const AUCTION_WEEKDAY = 2
/** The rank that opens the auction to the dealership. */
export const AUCTION_RANK: RankId = 'main-street'
const AUCTION_SEED = 43_000

/** Lots in the run by the dealership's rank: a bigger name gets a longer list. */
export const RUN_SIZE: Record<RankId, number> = {
  'corner-lot': 6,
  'main-street': 6,
  'trusted-dealer': 7,
  'regional-name': 8,
  'dealer-of-the-year': 10,
}

/** What the trade pays for a used car it still has to retail: this share of its market value. */
export const WHOLESALE_FACTOR = 0.8
/** The run list's estimate is the wholesale value this much either way. */
export const ESTIMATE_SPREAD = 0.1
/** The auction's buyer fee: a flat amount plus a share of the hammer price. */
export const BUYER_FEE = { flat: 200, share: 0.03 }
/** Cars come off the transporter a little grubby. */
export const AUCTION_CLEANLINESS = 0.6

/** A car in the week's run. */
export interface Lot {
  /** `lot-<auction day>-<n>`. */
  id: string
  car: UsedInfo & { model: CarModel }
  /** How the sheet reads its condition. Until inspection comes in, it's the truth. */
  grade: Grade
  /** Its place in the run, from 1. */
  order: number
}

/** A lot the dealership won today, holding a lot space until the day is settled. */
export interface AuctionWin {
  /** Its stock id (`used-<day>-<n>`). */
  id: string
  lotId: string
  car: UsedInfo & { model: CarModel }
  /** The lot space held for it. */
  slot: Slot
  /** The hammer price. */
  price: number
  /** The buyer fee on top. */
  fee: number
}

/** An auction buy as the summary lists it. */
export interface AuctionBuy {
  model: CarModel
  year: number
  price: number
  fee: number
  /** Its market value that day. */
  value: number
}

/** The day's auction. Buys are stock, not an expense, so they stay off `netIncome`. */
export interface AuctionStats {
  bought: AuctionBuy[]
}

export function emptyAuctionStats(): AuctionStats {
  return { bought: [] }
}

/** Whether `day` is an auction day. */
export function isAuctionDay(day: number): boolean {
  return calendarOf(day).weekday === AUCTION_WEEKDAY
}

/** The auction day of the week `day` is in. */
export function auctionDayOf(day: number): number {
  return weekStart(day) + AUCTION_WEEKDAY
}

/** The next auction from `day` on: this week's until it's held, then next week's. */
export function nextAuction(day: number): number {
  const thisWeek = auctionDayOf(day)
  return day <= thisWeek ? thisWeek : thisWeek + DAYS_PER_WEEK
}

/** Whether the dealership has the rank to buy at the auction. */
export function auctionOpen(career: Pick<Career, 'rank'>): boolean {
  const index = (id: RankId) => RANKS.indexOf(rankById(id))
  return index(career.rank) >= index(AUCTION_RANK)
}

/** What the run list depends on besides the week. */
export interface RunOpts {
  rank: RankId
  tier: FranchiseTier
}

/**
 * The run list for the week `day` is in: `RUN_SIZE[rank]` used cars rolled on
 * the week's own seed, so the same week always gives the same list (and a
 * rank-up mid-week only adds lots at the end). Models the franchise `tier`
 * can't order (`MODEL_TIER`) don't come up.
 */
export function runList(day: number, { rank, tier }: RunOpts): Lot[] {
  const start = weekStart(day)
  const auctionDay = start + AUCTION_WEEKDAY
  const rng = createRng(AUCTION_SEED + start)
  const lots: Lot[] = []
  for (let order = 1; order <= RUN_SIZE[rank]; order++) {
    let car = rollUsedCar(rng, auctionDay)
    for (let tries = 0; !orderable(car.model, tier) && tries < 20; tries++) {
      car = rollUsedCar(rng, auctionDay)
    }
    if (!orderable(car.model, tier)) car = { ...car, model: 'sedan' }
    lots.push({ id: `lot-${auctionDay}-${order}`, car, grade: gradeOf(car.condition), order })
  }
  return lots
}

/**
 * What the trade pays for a used `model` on `day`: `WHOLESALE_FACTOR` of its
 * market value, rounded to $100.
 */
export function wholesaleValue(model: CarModel, info: UsedInfo, day: number): number {
  return roundTo100(marketValue(model, info, day) * WHOLESALE_FACTOR)
}

/** The run list's guide to what `lot` will go for on `day`: its wholesale value, give or take. */
export function lotEstimate(lot: Lot, day: number): { low: number; high: number } {
  const value = wholesaleValue(lot.car.model, lot.car, day)
  return {
    low: roundTo100(value * (1 - ESTIMATE_SPREAD)),
    high: roundTo100(value * (1 + ESTIMATE_SPREAD)),
  }
}

/** The buyer fee on a hammer price of `price`, rounded to $10. */
export function buyerFee(price: number): number {
  return Math.round((BUYER_FEE.flat + price * BUYER_FEE.share) / 10) * 10
}

/** A lot won at `price` costs this much: the price and the buyer fee. */
export function auctionCost(price: number): number {
  return price + buyerFee(price)
}

/**
 * Why the dealership can't bid `price` on a lot: no lot space left once every
 * space held today is counted, or not enough cash for the price and the fee
 * (auction cars are paid in cash, like every used car). Null if it can.
 */
export function bidBlocker(book: BuyBook, price: number): string | null {
  if (!lotSlotFor(book)) return NO_ROOM
  if (book.cash < auctionCost(price)) return NO_CASH
  return null
}

/** `lot` won at `price`, as stock id `id`, holding the first free lot space. Null without room. */
export function winLot(
  lot: Lot,
  price: number,
  book: Omit<BuyBook, 'cash'>,
  id: string,
): AuctionWin | null {
  const slot = lotSlotFor(book)
  if (!slot) return null
  return { id, lotId: lot.id, car: lot.car, slot, price, fee: buyerFee(price) }
}

/** Today's wins as stock on `day`, each in its held space, costing the price and the fee. */
export function stockWins(wins: readonly AuctionWin[], day: number): InventoryCar[] {
  return wins.map((w) =>
    usedStockCar(w.id, w.car, w.slot, w.price + w.fee, day, AUCTION_CLEANLINESS),
  )
}

/** For the summary: what was won, for how much and what it was worth on `day`. */
export function auctionRecord(w: AuctionWin, day: number): AuctionBuy {
  return {
    model: w.car.model,
    year: w.car.year,
    price: w.price,
    fee: w.fee,
    value: marketValue(w.car.model, w.car, day),
  }
}

/** What the day's auction buys cost, fees included. */
export function auctionSpend(stats: AuctionStats): number {
  return stats.bought.reduce((sum, b) => sum + b.price + b.fee, 0)
}
