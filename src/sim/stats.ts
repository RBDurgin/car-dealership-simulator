import { calendarOf, DAYS_PER_MONTH, DAYS_PER_WEEK, monthLabel } from './calendar'
import { PLAYER_ID } from './customers'
import { netIncome, totalGross, walkOuts, type DayStats, type Sale } from './deal'
import type { WorkCount } from './growth'
import type { CarModel } from './layout'
import type { Source } from './marketing'
import type { Role } from './staff'

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

/** One employee's lifetime record, whatever their role. */
export interface EmployeeTotal {
  /** Days they came in, and the experience they earned. */
  days: number
  xp: number
  /** Cars they sold and the gross on them. */
  sales: number
  gross: number
  /** The rest of their `WorkTally` counts, added up. */
  signings: number
  drives: number
  washes: number
  jobs: number
  checkIns: number
  findings: number
  calls: number
  bookings: number
  chases: number
  inspections: number
  buys: number
}

export function emptyEmployeeTotal(): EmployeeTotal {
  return {
    days: 0,
    xp: 0,
    sales: 0,
    gross: 0,
    signings: 0,
    drives: 0,
    washes: 0,
    jobs: 0,
    checkIns: 0,
    findings: 0,
    calls: 0,
    bookings: 0,
    chases: 0,
    inspections: 0,
    buys: 0,
  }
}

/** The `WorkTally` counts an `EmployeeTotal` adds up as they are. */
const TOTAL_COUNTS = [
  'signings',
  'drives',
  'washes',
  'jobs',
  'checkIns',
  'findings',
  'calls',
  'bookings',
  'chases',
  'inspections',
  'buys',
] as const satisfies readonly (keyof EmployeeTotal & WorkCount)[]

/** The counts an employee page shows for each role, after days worked and experience. */
export const ROLE_TOTALS: Record<Role, readonly (keyof EmployeeTotal)[]> = {
  sales: ['sales', 'gross', 'drives', 'signings'],
  receptionist: ['calls', 'bookings'],
  finance: ['signings'],
  porter: ['washes'],
  security: ['chases'],
  mechanic: ['jobs'],
  advisor: ['checkIns', 'findings'],
  buyer: ['inspections', 'buys'],
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
  /** Every employee's record, by id (the player isn't in it). */
  byEmployee: Record<string, EmployeeTotal>
  /** Sales with a trade-in, and used cars bought (trade-ins and sellers' cars). */
  trades: number
  bought: number
  /** Times Nazma was run off the lot, and thefts a guard foiled. */
  nazmaRunOffs: number
  theftsFoiled: number
  /** Morning huddles held. */
  huddles: number
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
    byEmployee: {},
    trades: 0,
    bought: 0,
    nazmaRunOffs: 0,
    theftsFoiled: 0,
    huddles: 0,
  }
}

/** Who a sale counts for: the salesperson's id, or `PLAYER_ID`. */
export function sellerKey(s: Sale): string {
  return s.soldBy === null ? PLAYER_ID : (s.sellerId ?? s.soldBy)
}

const bump = <K extends string>(counts: Partial<Record<K, number>>, key: K) => {
  counts[key] = (counts[key] ?? 0) + 1
}

/**
 * `stats`, a settled day, folded into `lifetime`, with `xp` the experience
 * each employee earned (by id, from `growStaff`).
 */
export function addDay(
  lifetime: Lifetime,
  stats: DayStats,
  xp: Readonly<Record<string, number>> = {},
): Lifetime {
  const byModel = { ...lifetime.byModel }
  const bySource = { ...lifetime.bySource }
  const bySeller = { ...lifetime.bySeller }
  const byEmployee = { ...lifetime.byEmployee }
  // Each employee's total is copied once, the first time the day adds to it.
  const copied = new Set<string>()
  const touch = (id: string) => {
    if (!copied.has(id)) {
      copied.add(id)
      byEmployee[id] = { ...(byEmployee[id] ?? emptyEmployeeTotal()) }
    }
    return byEmployee[id]
  }
  for (const s of stats.sales) {
    bump(byModel, s.model)
    bump(bySource, s.source)
    const key = sellerKey(s)
    const t = bySeller[key] ?? { sales: 0, gross: 0 }
    bySeller[key] = { sales: t.sales + 1, gross: t.gross + s.price - s.cost }
    if (key !== PLAYER_ID) {
      const e = touch(key)
      e.sales++
      e.gross += s.price - s.cost
    }
  }
  for (const [id, w] of Object.entries(stats.staffWork)) {
    const e = touch(id)
    if (w.came) e.days++
    for (const c of TOTAL_COUNTS) e[c] += w[c]
  }
  for (const [id, n] of Object.entries(xp)) touch(id).xp += n
  return {
    sales: lifetime.sales + stats.sales.length,
    usedSales: lifetime.usedSales + stats.sales.filter((s) => s.used).length,
    gross: lifetime.gross + Math.round(totalGross(stats)),
    net: lifetime.net + Math.round(netIncome(stats)),
    visitors: lifetime.visitors + stats.visitors,
    byModel,
    bySource,
    bySeller,
    byEmployee,
    trades: lifetime.trades + stats.sales.filter((s) => s.trade).length,
    bought: lifetime.bought + stats.bought.length,
    nazmaRunOffs: lifetime.nazmaRunOffs + (stats.nazma.runOff ? 1 : 0),
    theftsFoiled: lifetime.theftsFoiled + (stats.nazma.foiled ? 1 : 0),
    huddles: lifetime.huddles + (stats.huddle ? 1 : 0),
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
  /** Days in a row the whole team ended happy (see `isHappyTeam`), up to the last day settled. */
  happyStreak: number
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
    happyStreak: 0,
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

/** What the Stats tab can chart. */
export type Metric = 'sales' | 'gross' | 'net' | 'visitors' | 'reputation' | 'cash'
export const METRICS: readonly Metric[] = [
  'sales',
  'gross',
  'net',
  'visitors',
  'reputation',
  'cash',
]
/** Levels are read at a point in time (a line); the rest are amounts summed over a period (bars). */
export const isLevel = (m: Metric) => m === 'reputation' || m === 'cash'

/** The last `RECENT_DAYS` days, or the whole game. */
export type ChartRange = 'recent' | 'all'
export const RECENT_DAYS = 28
/** A chart never has more bars or points than this: past it, days are summed by week, then month. */
export const MAX_POINTS = 84

export interface Point {
  /** The last day the point covers. */
  day: number
  /** "Day 23", "Wk 2 Mar", "Mar" (with the year from year 2). */
  label: string
  value: number
}

function dayLabel(day: number): string {
  return `Day ${day}`
}

function weekLabel(day: number): string {
  const c = calendarOf(day)
  return `Wk ${c.week} ${monthLabel(c.month)}${c.year > 1 ? ` Y${c.year}` : ''}`
}

function monthLabelOf(day: number): string {
  const c = calendarOf(day)
  return `${monthLabel(c.month)}${c.year > 1 ? ` Y${c.year}` : ''}`
}

/**
 * The log as chart points for `metric`: one a day over the range when that
 * fits `MAX_POINTS`, else summed by calendar week (or month, past
 * `MAX_POINTS` weeks). A level (reputation, cash) takes its period's last day.
 */
export function series(log: readonly DayRecord[], metric: Metric, range: ChartRange): Point[] {
  const days = range === 'recent' ? log.slice(-RECENT_DAYS) : log
  if (days.length <= MAX_POINTS) {
    return days.map((r) => ({ day: r.day, label: dayLabel(r.day), value: r[metric] }))
  }
  const last = days[days.length - 1].day
  const first = days[0].day
  const byWeek = weekIndex(last) - weekIndex(first) < MAX_POINTS
  const by = byWeek ? weekIndex : monthIndexOf
  const label = byWeek ? weekLabel : monthLabelOf
  const points: Point[] = []
  let period = -1
  for (const r of days) {
    const p = by(r.day)
    const point = points[points.length - 1]
    if (p !== period || !point) {
      period = p
      points.push({ day: r.day, label: label(r.day), value: r[metric] })
    } else {
      point.day = r.day
      point.value = isLevel(metric) ? r[metric] : point.value + r[metric]
    }
  }
  return points
}

/** Sales over visitors (0–1), or null with no visitors. */
export function closeRate(sales: number, visitors: number): number | null {
  return visitors > 0 ? sales / visitors : null
}

/** Gross per car sold, or null with none sold. */
export function grossPerSale(gross: number, sales: number): number | null {
  return sales > 0 ? gross / sales : null
}

/** One row of the by-seller breakdown. */
export interface SellerRow {
  /** An employee id, `PLAYER_ID`, or `FORMER_STAFF`. */
  key: string
  sales: number
  gross: number
}

export const FORMER_STAFF = 'former'

/**
 * Lifetime sales by seller: the player first, then `staff` (today's
 * salespeople by id) by sales, and everyone else together as `FORMER_STAFF`
 * last. Sellers with no sales are left out.
 */
export function sellerRows(
  bySeller: Readonly<Record<string, SellerTotal>>,
  staff: readonly string[],
): SellerRow[] {
  const current = new Set(staff)
  const rows: SellerRow[] = []
  const former: SellerRow = { key: FORMER_STAFF, sales: 0, gross: 0 }
  for (const [key, t] of Object.entries(bySeller)) {
    if (t.sales === 0) continue
    if (key === PLAYER_ID || current.has(key)) rows.push({ key, ...t })
    else {
      former.sales += t.sales
      former.gross += t.gross
    }
  }
  rows.sort(
    (a, b) => Number(b.key === PLAYER_ID) - Number(a.key === PLAYER_ID) || b.sales - a.sales,
  )
  if (former.sales > 0) rows.push(former)
  return rows
}
