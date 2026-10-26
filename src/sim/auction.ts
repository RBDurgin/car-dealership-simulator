import { calendarOf, DAYS_PER_WEEK, weekStart } from './calendar'
import { orderable, type FranchiseTier } from './franchise'
import { roundTo100, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import type { Slot } from './ordering'
import { rankById, RANKS, type Career, type RankId } from './progression'
import { carName } from './interactables'
import { createRng, hashSeed } from './rng'
import { lotSlotFor, NO_CASH, NO_ROOM, type BuyBook } from './sellers'
import {
  appraisalNoise,
  GRADES,
  gradeOf,
  marketValue,
  rollUsedCar,
  usedStockCar,
  type Grade,
  type UsedInfo,
} from './usedCars'
import type { Consignment } from './wholesale'

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
/** The sheet's readings roll on their own seed, so the cars stay as they were before grades could be off. */
const SHEET_SEED = 44_000

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
/**
 * The sheet reads a lot's condition up to this much over the truth (never
 * under): usually the right grade, about one lot in five a step better.
 */
export const SHEET_NOISE = 0.12
/** An inspection reads condition up to the inspector's `appraisalNoise` × this over the truth. */
export const INSPECT_NOISE_SCALE = 0.3
/** What an inspection costs. */
export const INSPECT_FEE = 150
/** An inspected lot's estimate is its wholesale value this much either way. */
export const INSPECTED_SPREAD = 0.05

/** A car in the week's run. */
export interface Lot {
  /** `lot-<auction day>-<n>`. */
  id: string
  /** The car as it really is: `condition` is the truth, which nobody at the sale sees. */
  car: UsedInfo & { model: CarModel }
  /** The condition as the sheet reads it: the truth or a little better. */
  reading: number
  /** The sheet's grade, `gradeOf(reading)`. */
  grade: Grade
  /** Its place in the run, from 1. */
  order: number
  /** One of our cars, consigned to the run (see `sim/wholesale.ts`): we can't bid on it. */
  consigned?: Consignment
}

/** A lot looked over before the auction: a closer reading of its condition. */
export interface Inspection {
  lotId: string
  /** The day of the auction it runs in. */
  auctionDay: number
  reading: number
  grade: Grade
}

/** A car that came in worse than the grade it was bought on. */
export interface AuctionSurprise {
  model: CarModel
  year: number
  /** The grade it was bought on: the sheet's, or the inspection's. */
  graded: Grade
  arrived: Grade
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
  /** The grade it was bought on: the sheet's, or the inspection's. */
  graded: Grade
}

/** An auction buy as the summary lists it. */
export interface AuctionBuy {
  model: CarModel
  year: number
  price: number
  fee: number
  /** Its market value that day. */
  value: number
  /** The grade it was bought on. */
  graded: Grade
}

/** The day's auction. Buys are stock, not an expense, so they stay off `netIncome`. */
export interface AuctionStats {
  bought: AuctionBuy[]
  /** What inspections cost today: an expense, so off `netIncome`. */
  inspections: number
  /** Today's wins that came in worse than their grade, set when the day is settled. */
  surprises: AuctionSurprise[]
}

export function emptyAuctionStats(): AuctionStats {
  return { bought: [], inspections: 0, surprises: [] }
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
  const sheet = createRng(SHEET_SEED + start)
  const lots: Lot[] = []
  for (let order = 1; order <= RUN_SIZE[rank]; order++) {
    let car = rollUsedCar(rng, auctionDay)
    for (let tries = 0; !orderable(car.model, tier) && tries < 20; tries++) {
      car = rollUsedCar(rng, auctionDay)
    }
    if (!orderable(car.model, tier)) car = { ...car, model: 'sedan' }
    const reading = readCondition(car.condition, SHEET_NOISE, sheet.next())
    lots.push({ id: `lot-${auctionDay}-${order}`, car, reading, grade: gradeOf(reading), order })
  }
  return lots
}

/**
 * A reading of `condition` up to `noise` over it (`u` from 0 to 1 says how
 * far): whoever writes the grade leans optimistic, never pessimistic.
 */
export function readCondition(condition: number, noise: number, u: number): number {
  return Math.min(1, condition + noise * u)
}

/**
 * Lot `lot` inspected by someone of `skill`: a reading within
 * `appraisalNoise(skill)` × `INSPECT_NOISE_SCALE` (× `scale`, a senior's
 * closer look) of the truth, never rosier than the sheet. Seeded by the lot
 * and the skill, so it reads the same twice.
 */
export function inspectLot(lot: Lot, skill: number, scale = 1): Inspection {
  const u = createRng(hashSeed(lot.id) + skill).next()
  const noise = appraisalNoise(skill) * INSPECT_NOISE_SCALE * scale
  const reading = Math.min(lot.reading, readCondition(lot.car.condition, noise, u))
  return {
    lotId: lot.id,
    auctionDay: auctionDayOf(lot.car.acquiredDay),
    reading,
    grade: gradeOf(reading),
  }
}

/** What the trade can go on for `lot`: the reading (the inspection's, if there is one) and its grade. */
export function lotReading(
  lot: Lot,
  inspection?: Inspection | null,
): { reading: number; grade: Grade } {
  return inspection ?? lot
}

/**
 * Why lot `lot` can't be inspected on `day`: already done, it has run (or is
 * on the block in `run`), or not enough cash for `INSPECT_FEE`. Null if it can.
 */
export function inspectBlocker(
  lot: Lot,
  day: number,
  run: { lotIndex: number; over: boolean } | null,
  inspected: readonly Inspection[],
  cash: number,
): string | null {
  if (inspected.some((i) => i.lotId === lot.id)) return 'Already inspected.'
  if (lotHasRun(lot, day, run)) return TOO_LATE
  if (cash < INSPECT_FEE) return NO_CASH
  return null
}

const TOO_LATE = 'Too late: that lot has run.'

/** Whether `lot` has run by `day` (or is on the block in today's `run`). */
export function lotHasRun(
  lot: Lot,
  day: number,
  run: { lotIndex: number; over: boolean } | null,
): boolean {
  const auctionDay = auctionDayOf(lot.car.acquiredDay)
  return (
    day > auctionDay || (day === auctionDay && !!run && (run.over || run.lotIndex >= lot.order - 1))
  )
}

/**
 * The most the used-car manager will bid on a lot for the dealership, set by
 * the player before it runs. Saved, as it's set before auction day.
 */
export interface AuctionBid {
  lotId: string
  /** The day of the auction the lot runs in. */
  auctionDay: number
  max: number
}

/** The max bid set on lot `lotId`, or 0 without one. */
export function maxBidFor(bids: readonly AuctionBid[], lotId: string): number {
  return bids.find((b) => b.lotId === lotId)?.max ?? 0
}

/** `bids` for auctions on or after `day` (the same array if none have run). */
export function liveBids(bids: AuctionBid[], day: number): AuctionBid[] {
  return bids.every((b) => b.auctionDay >= day) ? bids : bids.filter((b) => b.auctionDay >= day)
}

/** `bids` with lot `lot`'s max bid set to `max` (cleared at 0 or under). */
export function withMaxBid(bids: readonly AuctionBid[], lot: Lot, max: number): AuctionBid[] {
  const rest = bids.filter((b) => b.lotId !== lot.id)
  if (max <= 0) return rest
  return [...rest, { lotId: lot.id, auctionDay: auctionDayOf(lot.car.acquiredDay), max }]
}

/**
 * Why a max bid can't be set on `lot` on `day`: no used-car manager to bid
 * it, or the lot has run (or is on the block in `run`). Null if it can.
 */
export function maxBidBlocker(
  lot: Lot,
  day: number,
  run: { lotIndex: number; over: boolean } | null,
  manager: boolean,
): string | null {
  if (!manager) return 'Hire a used-car manager to bid for you.'
  if (lotHasRun(lot, day, run)) return TOO_LATE
  return null
}

/**
 * What the trade pays for a used `model` on `day`: `WHOLESALE_FACTOR` of its
 * market value, rounded to $100.
 */
export function wholesaleValue(model: CarModel, info: UsedInfo, day: number): number {
  return roundTo100(marketValue(model, info, day) * WHOLESALE_FACTOR)
}

/**
 * What `lot` is worth to the trade on `day` as the sheet reads it (or, with
 * an `inspection`, as that reads it): the true condition isn't known at the sale.
 */
export function lotValue(lot: Lot, day: number, inspection?: Inspection | null): number {
  const { reading } = lotReading(lot, inspection)
  return wholesaleValue(lot.car.model, { ...lot.car, condition: reading }, day)
}

/**
 * The run list's guide to what `lot` will go for on `day`: its wholesale
 * value as read, give or take `ESTIMATE_SPREAD` (`INSPECTED_SPREAD` once inspected).
 */
export function lotEstimate(
  lot: Lot,
  day: number,
  inspection?: Inspection | null,
): { low: number; high: number } {
  const value = lotValue(lot, day, inspection)
  const spread = inspection ? INSPECTED_SPREAD : ESTIMATE_SPREAD
  return {
    low: roundTo100(value * (1 - spread)),
    high: roundTo100(value * (1 + spread)),
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

/**
 * `lot` won at `price`, as stock id `id`, holding the first free lot space,
 * bought on the grade the buyer had (`inspection`'s, else the sheet's). Null without room.
 */
export function winLot(
  lot: Lot,
  price: number,
  book: Omit<BuyBook, 'cash'>,
  id: string,
  inspection?: Inspection | null,
): AuctionWin | null {
  const slot = lotSlotFor(book)
  if (!slot) return null
  const graded = lotReading(lot, inspection).grade
  return { id, lotId: lot.id, car: lot.car, slot, price, fee: buyerFee(price), graded }
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
    graded: w.graded,
  }
}

/** Today's wins that are a grade (or more) worse than they were bought on. */
export function surprisesOf(wins: readonly AuctionWin[]): AuctionSurprise[] {
  return wins.flatMap((w) => {
    const arrived = gradeOf(w.car.condition)
    return GRADES.indexOf(arrived) > GRADES.indexOf(w.graded)
      ? [{ model: w.car.model, year: w.car.year, graded: w.graded, arrived }]
      : []
  })
}

/** "The Hatch you bought graded Good, arrived Worn." for each surprise, or null without any. */
export function surpriseNotice(surprises: readonly AuctionSurprise[]): string | null {
  if (surprises.length === 0) return null
  return surprises
    .map((s) => `The ${carName(s.model)} you bought graded ${s.graded}, arrived ${s.arrived}.`)
    .join(' ')
}

/** What the day's auction buys cost, fees included. */
export function auctionSpend(stats: AuctionStats): number {
  return stats.bought.reduce((sum, b) => sum + b.price + b.fee, 0)
}
