import { DAYS_PER_MONTH, DAYS_PER_WEEK } from './calendar'
import { PLAYER_ID } from './customers'
import { netIncome, totalGross, walkOuts, type DayStats, type Sale } from './deal'
import type { CarModel } from './layout'
import type { Source } from './marketing'

/**
 * The game's memory of past days: a compact record of each settled day (the
 * log), lifetime totals and personal records. Added to once a day, in
 * `settleDay`. Week and month totals are summed from the log, never stored.
 */

/** One settled day, in whole numbers. */
export interface DayRecord {
  day: number
  /** Cars sold, new and used, and of them the used ones. */
  sales: number
  usedSales: number
  /** Gross profit on sales and service (`totalGross`), as the career counts it. */
  gross: number
  /** `netIncome`. */
  net: number
  visitors: number
  /** Refused, impatient and turned out at closing. */
  walkOuts: number
  /** Reputation and cash after the day was settled. */
  reputation: number
  cash: number
  /** Spent on ads. */
  marketing: number
}

/**
 * The saved order of a `DayRecord`'s fields: the save keeps each record as a
 * tuple in this order, to stay small. Add new fields at the end only.
 */
export const LOG_FIELDS = [
  'day',
  'sales',
  'usedSales',
  'gross',
  'net',
  'visitors',
  'walkOuts',
  'reputation',
  'cash',
  'marketing',
] as const satisfies readonly (keyof DayRecord)[]

/** `stats` boiled down to a record of `day`, with `reputation` and `cash` after settling. */
export function dayRecord(
  stats: DayStats,
  day: number,
  reputation: number,
  cash: number,
): DayRecord {
  return {
    day,
    sales: stats.sales.length,
    usedSales: stats.sales.filter((s) => s.used).length,
    gross: Math.round(totalGross(stats)),
    net: Math.round(netIncome(stats)),
    visitors: stats.visitors,
    walkOuts: walkOuts(stats),
    reputation: Math.round(reputation),
    cash: Math.round(cash),
    marketing: Math.round(stats.marketing),
  }
}

export function recordToTuple(r: DayRecord): number[] {
  return LOG_FIELDS.map((f) => r[f])
}

export function tupleToRecord(t: readonly number[]): DayRecord {
  const r = {} as DayRecord
  LOG_FIELDS.forEach((f, i) => (r[f] = t[i]))
  return r
}

/** One seller's lifetime share: cars sold and the gross on them. */
export interface SellerTotal {
  sales: number
  gross: number
}

export interface Lifetime {
  /** Cars sold, new and used, and of them the used ones. */
  sales: number
  usedSales: number
  /** Gross on sales and service, and net income, over every day settled. */
  gross: number
  net: number
  visitors: number
  /** Cars sold by model and by what brought the buyer in. */
  byModel: Partial<Record<CarModel, number>>
  bySource: Partial<Record<Source, number>>
  /** By employee id, or `PLAYER_ID` for the player's own sales. */
  bySeller: Record<string, SellerTotal>
  /** Sales with a trade-in, and used cars bought (trade-ins and sellers' cars). */
  trades: number
  bought: number
  /** Times Nazma was run off the lot, and thefts a guard foiled. */
  nazmaRunOffs: number
  theftsFoiled: number
}

export function emptyLifetime(): Lifetime {
  return {
    sales: 0,
    usedSales: 0,
    gross: 0,
    net: 0,
    visitors: 0,
    byModel: {},
    bySource: {},
    bySeller: {},
    trades: 0,
    bought: 0,
    nazmaRunOffs: 0,
    theftsFoiled: 0,
  }
}

/** Who a sale counts for: the salesperson's id, or `PLAYER_ID`. */
export function sellerKey(s: Sale): string {
  return s.soldBy === null ? PLAYER_ID : (s.sellerId ?? s.soldBy)
}

const bump = <K extends string>(counts: Partial<Record<K, number>>, key: K) => {
  counts[key] = (counts[key] ?? 0) + 1
}

/** `stats`, a settled day, folded into `lifetime`. */
export function addDay(lifetime: Lifetime, stats: DayStats): Lifetime {
  const byModel = { ...lifetime.byModel }
  const bySource = { ...lifetime.bySource }
  const bySeller = { ...lifetime.bySeller }
  for (const s of stats.sales) {
    bump(byModel, s.model)
    bump(bySource, s.source)
    const key = sellerKey(s)
    const t = bySeller[key] ?? { sales: 0, gross: 0 }
    bySeller[key] = { sales: t.sales + 1, gross: t.gross + s.price - s.cost }
  }
  return {
    sales: lifetime.sales + stats.sales.length,
    usedSales: lifetime.usedSales + stats.sales.filter((s) => s.used).length,
    gross: lifetime.gross + Math.round(totalGross(stats)),
    net: lifetime.net + Math.round(netIncome(stats)),
    visitors: lifetime.visitors + stats.visitors,
    byModel,
    bySource,
    bySeller,
    trades: lifetime.trades + stats.sales.filter((s) => s.trade).length,
    bought: lifetime.bought + stats.bought.length,
    nazmaRunOffs: lifetime.nazmaRunOffs + (stats.nazma.runOff ? 1 : 0),
    theftsFoiled: lifetime.theftsFoiled + (stats.nazma.foiled ? 1 : 0),
  }
}

/**
 * Money spent after the day was settled (ads, improvements, expansions or an
 * appreciation day booked from the summary) brought into the log's record of
 * the day and the lifetime net. Returns the same log and lifetime when the
 * log's last record isn't `day`'s or nothing changed.
 */
export function amendDay(
  log: DayRecord[],
  lifetime: Lifetime,
  stats: DayStats,
  day: number,
): { log: DayRecord[]; lifetime: Lifetime } {
  const last = log[log.length - 1]
  if (!last || last.day !== day) return { log, lifetime }
  const net = Math.round(netIncome(stats))
  const marketing = Math.round(stats.marketing)
  if (net === last.net && marketing === last.marketing) return { log, lifetime }
  return {
    log: [...log.slice(0, -1), { ...last, net, marketing }],
    lifetime: { ...lifetime, net: lifetime.net + net - last.net },
  }
}

/** A record and the day it was set (for a week, month or streak, its latest day). */
export interface Best {
  value: number
  day: number
}

export interface Records {
  /** The most gross in a day, and the most cars sold in a day. */
  bestDay: Best | null
  bestSalesDay: Best | null
  /** The most gross in a calendar week and month. */
  bestWeek: Best | null
  bestMonth: Best | null
  /** The most gross on one sale. */
  biggestDeal: (Best & { model: CarModel }) | null
  /** The most days in a row with a sale. */
  longestStreak: Best | null
  /** Days in a row with a sale, up to the last day settled. */
  streak: number
}

export type RecordKey =
  'bestDay' | 'bestSalesDay' | 'bestWeek' | 'bestMonth' | 'biggestDeal' | 'longestStreak'

export const RECORD_KEYS: readonly RecordKey[] = [
  'bestDay',
  'bestSalesDay',
  'bestWeek',
  'bestMonth',
  'biggestDeal',
  'longestStreak',
]

export function emptyRecords(): Records {
  return {
    bestDay: null,
    bestSalesDay: null,
    bestWeek: null,
    bestMonth: null,
    biggestDeal: null,
    longestStreak: null,
    streak: 0,
  }
}

/** The calendar week (from 0) `day` falls in. */
export const weekIndex = (day: number) => Math.floor((day - 1) / DAYS_PER_WEEK)
/** The calendar month (from 0, across years) `day` falls in. */
export const monthIndexOf = (day: number) => Math.floor((day - 1) / DAYS_PER_MONTH)

/** Gross over the log's days in the same week (`by` = `weekIndex`) or month as `day`. */
export function periodGross(
  log: readonly DayRecord[],
  day: number,
  by: (day: number) => number,
): number {
  const period = by(day)
  let sum = 0
  for (let i = log.length - 1; i >= 0 && by(log[i].day) >= period; i--) {
    if (by(log[i].day) === period) sum += log[i].gross
  }
  return sum
}

/**
 * The records after the day `log` ends with (its last record, built from
 * `stats`), and the ones `broken`. A record is set only by a strictly higher,
 * positive value. Setting the first of one isn't breaking it, and neither is a
 * week, month or streak going on raising its own record: only one that takes
 * a record from another day, week, month or streak is in `broken`.
 */
export function updateRecords(
  records: Records,
  log: readonly DayRecord[],
  stats: DayStats,
): { records: Records; broken: RecordKey[] } {
  const today = log[log.length - 1]
  if (!today) return { records, broken: [] }
  const { day } = today
  const next: Records = { ...records }
  const broken: RecordKey[] = []
  const consider = (
    key: Exclude<RecordKey, 'biggestDeal'>,
    value: number,
    samePeriod: (prev: Best) => boolean = () => false,
  ) => {
    const prev = records[key]
    if (value <= 0 || (prev && value <= prev.value)) return
    next[key] = { value, day }
    if (prev && !samePeriod(prev)) broken.push(key)
  }

  consider('bestDay', today.gross)
  consider('bestSalesDay', today.sales)
  consider('bestWeek', periodGross(log, day, weekIndex), (p) => weekIndex(p.day) === weekIndex(day))
  consider(
    'bestMonth',
    periodGross(log, day, monthIndexOf),
    (p) => monthIndexOf(p.day) === monthIndexOf(day),
  )

  // A streak runs across days the log has back to back.
  const yesterday = log[log.length - 2]
  const running = yesterday?.day === day - 1 ? records.streak : 0
  next.streak = today.sales > 0 ? running + 1 : 0
  // The longest streak raised by the streak that set it, still running.
  consider('longestStreak', next.streak, (p) => p.day === day - 1 && running === p.value)

  let deal: Sale | null = null
  for (const s of stats.sales) if (!deal || s.price - s.cost > deal.price - deal.cost) deal = s
  const dealGross = deal ? deal.price - deal.cost : 0
  const prevDeal = records.biggestDeal
  if (deal && dealGross > 0 && (!prevDeal || dealGross > prevDeal.value)) {
    next.biggestDeal = { value: dealGross, day, model: deal.model }
    if (prevDeal) broken.push('biggestDeal')
  }
  return { records: next, broken }
}
