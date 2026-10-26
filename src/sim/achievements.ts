import { auctionOpen, isSteal, STEAL_SHARE, type AuctionBuy } from './auction'
import { calendarOf, DAYS_PER_MONTH, DAYS_PER_WEEK, MONTHS_PER_YEAR } from './calendar'
import type { Client } from './clients'
import { netIncome, type DayStats, type Sale } from './deal'
import type { Difficulty } from './difficulty'
import { eventOn } from './events'
import { PRODUCTS, type FiStats, type ProductId } from './fi'
import { installedExpansions, type OwnedExpansion } from './expansions'
import type { FranchiseTier } from './franchise'
import { IMPROVEMENTS, type ImprovementId, type OwnedImprovement } from './improvements'
import type { InventoryCar } from './inventory'
import { CAR_MODELS } from './customers'
import { CHANNELS, type Channel } from './marketing'
import { freeSlots } from './ordering'
import { RANKS, TOP_RANK, type Career, type RankId } from './progression'
import { hiredSkill } from './growth'
import { MAX_SKILL, MIN_SKILL, roleLimits, ROLES, type Employee } from './staff'
import type { DayRecord, Lifetime, Records } from './stats'
import type { Weather } from './weather'

/**
 * Achievements: small wins marked as they happen. A record only: they give
 * nothing, and count the same on every level (each keeps the level it was
 * earned on). Pure: `achievementsFor` diffs two store states during the day,
 * like `tipFor`, and `dayAchievements` looks over a settled day in
 * `settleDay`. Both return only ids not yet earned.
 */

export type AchievementGroup =
  | 'selling'
  | 'business'
  | 'people'
  | 'adversaries'
  | 'calendar'
  | 'used'
  | 'reputation'
  | 'career'
  | 'service'
  | 'clients'
  | 'finance'
  | 'drives'
  | 'auction'

export const GROUP_LABELS: Record<AchievementGroup, string> = {
  selling: 'Selling',
  business: 'Business',
  people: 'People',
  adversaries: 'Adversaries',
  calendar: 'Calendar',
  used: 'Used cars',
  reputation: 'Reputation',
  career: 'Career',
  service: 'Service',
  clients: 'Clients',
  finance: 'Finance',
  drives: 'Test drives',
  auction: 'Auction',
}

// Thresholds, at every level.
export const CLOSER_SALES = 5
export const BIG_TICKET_GROSS = 5_000
export const SIX_FIGURES = 100_000
export const NO_DEBT_CARS = 10
export const STAR_SELLER_SALES = 25
export const HANDS_OFF_SALES = 3
export const SPOTLESS_CLEAN = 0.9
export const SPOTLESS_CARS = 5
export const RAINY_SALES = 3
export const WEEKEND_SALES = 10
export const SATURDAY_VISITORS = 20
export const STREAK_DAYS = 14
export const FLIPPER_GROSS = 2_000
export const FRESH_DAYS = 3
export const WELL_KNOWN = 75
export const BELOVED = 95
export const CAR_WASHES = 5
export const DONE_RIGHT_JOBS = 5
export const BOOK_CLIENTS = 50
export const CSI_TARGET = 90
export const BACK_END_GROSS = 2_000
export const CLEAN_BOOKS_DEALS = 10
export const ROAD_SALES = 5
export const TEAM_DRIVES = 5
export const SCRATCH_FREE_DRIVES = 6
export const TEAM_MORALE = 80
export const HAPPY_TEAM_DAYS = 7
export const HAPPY_TEAM_SIZE = 3
export const HUDDLES = 10
const SATURDAY = 5

/** The slice of the store `achievementsFor` compares. */
export interface AchievementState {
  screen: 'title' | 'playing'
  clock: { day: number }
  cash: number
  inventory: readonly InventoryCar[]
  roster: readonly Employee[]
  improvements: readonly OwnedImprovement[]
  expansions: readonly OwnedExpansion[]
  weather: Weather
  dayStats: Pick<
    DayStats,
    | 'sales'
    | 'nazma'
    | 'bought'
    | 'service'
    | 'clients'
    | 'washes'
    | 'settled'
    | 'drives'
    | 'huddle'
    | 'auction'
    | 'wholesale'
  >
  career: Pick<Career, 'sales' | 'soldByModel' | 'rivalsBeaten' | 'rank'>
  lifetime: Pick<Lifetime, 'bySource' | 'bySeller' | 'huddles'>
  clients: readonly Client[]
}

/** What `dayAchievements` looks at once a day is settled. */
export interface DayContext {
  day: number
  /** The settled day. */
  stats: DayStats
  /** The log with the day's record, and the records with the day in. */
  log: readonly DayRecord[]
  records: Records
  /** After settling. */
  reputation: number
  career: Pick<Career, 'rank' | 'bestCsi'>
  franchise: FranchiseTier
  inventory: readonly InventoryCar[]
  /** The month's F&I so far, with the day's chargebacks in. */
  monthFi: FiStats
}

type Check =
  | { when: 'live'; check: (prev: AchievementState, next: AchievementState) => boolean }
  | { when: 'day'; check: (ctx: DayContext) => boolean }

export type Achievement = {
  id: AchievementId
  title: string
  /** What earned it, lower case, for "🏆 Title: text". */
  text: string
  group: AchievementGroup
  /** Shown as "???" until earned. */
  hidden?: boolean
} & Check

export type AchievementId =
  | 'first-sale'
  | 'ten-sales'
  | 'fifty-sales'
  | 'two-hundred-sales'
  | 'full-sticker'
  | 'closer'
  | 'patient'
  | 'big-ticket'
  | 'every-model'
  | 'in-the-black'
  | 'six-figures'
  | 'holdback'
  | 'ad-man'
  | 'no-debt'
  | 'fully-loaded'
  | 'first-hire'
  | 'full-house'
  | 'star-seller'
  | 'loyal'
  | 'hands-off'
  | 'homegrown'
  | 'first-senior'
  | 'eotm'
  | 'happy-team'
  | 'huddle-up'
  | 'not-on-my-lot'
  | 'guard-dog'
  | 'fort-knox'
  | 'spotless'
  | 'rival-bust'
  | 'rain-or-shine'
  | 'sale-weekend'
  | 'busy-saturday'
  | 'one-year'
  | 'streak'
  | 'trade-in'
  | 'bought-low'
  | 'flipper'
  | 'fresh-lot'
  | 'well-known'
  | 'beloved'
  | 'main-street'
  | 'trusted-dealer'
  | 'regional-name'
  | 'dealer-of-the-year'
  | 'gold-franchise'
  | 'first-service'
  | 'done-right'
  | 'fifty-clients'
  | 'trade-up'
  | 'referral'
  | 'csi-90'
  | 'first-loan'
  | 'the-works'
  | 'back-end'
  | 'clean-books'
  | 'covered'
  | 'first-drive'
  | 'perfect-pitch'
  | 'sold-on-the-road'
  | 'road-crew'
  | 'not-a-scratch'
  | 'fender-bender'
  | 'first-lot'
  | 'a-steal'
  | 'bought-back'
  | 'sold-to-the-trade'
  | 'car-wash'
  | 'tube-man-fan'

/**
 * Whether everyone on the payroll (at least `HAPPY_TEAM_SIZE` of them) is at
 * `TEAM_MORALE` or more, for `Records.happyStreak`.
 */
export function isHappyTeam(roster: readonly Pick<Employee, 'fired' | 'morale'>[]): boolean {
  const team = roster.filter((e) => !e.fired)
  return team.length >= HAPPY_TEAM_SIZE && team.every((e) => e.morale >= TEAM_MORALE)
}

/** A new day (or a new game) starts the day's tallies afresh. */
const sameDay = (prev: AchievementState, next: AchievementState) =>
  prev.clock.day === next.clock.day

/** Sales signed since `prev`. */
function newSales(prev: AchievementState, next: AchievementState): readonly Sale[] {
  if (next.dayStats.sales === prev.dayStats.sales) return []
  return next.dayStats.sales.slice(sameDay(prev, next) ? prev.dayStats.sales.length : 0)
}

/** Today's sales not yet folded into the career and lifetime totals. */
const unsettled = (s: AchievementState): readonly Sale[] =>
  s.dayStats.settled ? [] : s.dayStats.sales

const salesChanged = (prev: AchievementState, next: AchievementState) =>
  next.dayStats.sales !== prev.dayStats.sales

const anyNewSale = (pred: (sale: Sale, next: AchievementState) => boolean) => ({
  when: 'live' as const,
  check: (prev: AchievementState, next: AchievementState) =>
    newSales(prev, next).some((sale) => pred(sale, next)),
})

/** Lifetime sales reach `n`. */
const salesReach = (n: number) => ({
  when: 'live' as const,
  check: (prev: AchievementState, next: AchievementState) =>
    salesChanged(prev, next) && next.career.sales + unsettled(next).length >= n,
})

const gross = (s: Sale) => s.price - s.cost

/** Whether the career (and today's sales) has every model sold at least once. */
function everyModel(s: AchievementState): boolean {
  const today = new Set(unsettled(s).map((x) => x.model))
  return CAR_MODELS.every((m) => (s.career.soldByModel[m] ?? 0) > 0 || today.has(m))
}

const AD_CHANNELS = Object.keys(CHANNELS) as Channel[]

function everyChannel(s: AchievementState): boolean {
  const today = new Set(unsettled(s).map((x) => x.source))
  return AD_CHANNELS.every((c) => (s.lifetime.bySource[c] ?? 0) > 0 || today.has(c))
}

/** A salesperson on the payroll with `n` lifetime sales, today's included. */
function starSeller(s: AchievementState, n: number): boolean {
  return s.roster.some((e) => {
    if (e.role !== 'sales') return false
    const today = unsettled(s).filter((x) => x.sellerId === e.id).length
    return (s.lifetime.bySeller[e.id]?.sales ?? 0) + today >= n
  })
}

/** Every role there's room for has someone on the payroll. */
function fullHouse(s: AchievementState): boolean {
  const limits = roleLimits(installedExpansions(s.expansions, s.clock.day), auctionOpen(s.career))
  return ROLES.every(
    (r) => limits[r] === 0 || s.roster.some((e) => e.role === r && !e.fired && !e.quitting),
  )
}

const OUTSIDE_IMPROVEMENTS = (Object.keys(IMPROVEMENTS) as ImprovementId[]).filter(
  (id) => IMPROVEMENTS[id].area === 'outside',
)

const stocked = (inventory: readonly InventoryCar[]) => inventory.filter((c) => c.status !== 'sold')

const rankIndex = (id: RankId) => RANKS.findIndex((r) => r.id === id)
const rankReached = (id: RankId) => ({
  when: 'day' as const,
  check: (ctx: DayContext) => rankIndex(ctx.career.rank) >= rankIndex(id),
})

/** Sales over the sale weekend `day` is in, up to `day`. */
function weekendSales(log: readonly DayRecord[], day: number): number {
  if (!eventOn(day)) return 0
  const week = calendarOf(day).week
  return log
    .filter(
      (r) =>
        r.day > day - DAYS_PER_WEEK &&
        r.day <= day &&
        eventOn(r.day) &&
        calendarOf(r.day).week === week,
    )
    .reduce((sum, r) => sum + r.sales, 0)
}

const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[]

/** A sale closed at your own desk: nobody sold it and no finance manager signed it. */
const yours = (s: Sale) => s.soldBy === null && s.signedBy === null

/** A test drive tally of today's reaching `n` (or more) since `prev`. */
const drivesReach = (n: number, count: (d: DayStats['drives']) => number) => ({
  when: 'live' as const,
  check: (prev: AchievementState, next: AchievementState) =>
    next.dayStats !== prev.dayStats && count(next.dayStats.drives) >= n,
})

/** A car won at the auction since `prev` that passes `pred`. */
const anyNewBuy = (pred: (b: AuctionBuy) => boolean) => ({
  when: 'live' as const,
  check: (prev: AchievementState, next: AchievementState) =>
    next.dayStats.auction !== prev.dayStats.auction && next.dayStats.auction.bought.some(pred),
})

const rankName = (id: RankId) => RANKS.find((r) => r.id === id)!.name

export const ACHIEVEMENTS: readonly Achievement[] = [
  // Selling
  {
    id: 'first-sale',
    title: 'First Sale',
    text: 'sold your first car',
    group: 'selling',
    ...salesReach(1),
  },
  { id: 'ten-sales', title: 'Ten Sold', text: 'sold 10 cars', group: 'selling', ...salesReach(10) },
  {
    id: 'fifty-sales',
    title: 'Fifty Sold',
    text: 'sold 50 cars',
    group: 'selling',
    ...salesReach(50),
  },
  {
    id: 'two-hundred-sales',
    title: 'Two Hundred Sold',
    text: 'sold 200 cars',
    group: 'selling',
    ...salesReach(200),
  },
  {
    id: 'full-sticker',
    title: 'Full Sticker',
    text: 'sold a new car at full MSRP',
    group: 'selling',
    ...anyNewSale((s) => !s.used && s.price >= s.msrp),
  },
  {
    id: 'closer',
    title: 'Closer',
    text: `sold ${CLOSER_SALES} cars in one day`,
    group: 'selling',
    when: 'live',
    check: (prev, next) => salesChanged(prev, next) && next.dayStats.sales.length >= CLOSER_SALES,
  },
  {
    id: 'patient',
    title: 'Patient',
    text: "closed a deal after the buyer's last counter",
    group: 'selling',
    ...anyNewSale((s) => !!s.lastRound),
  },
  {
    id: 'big-ticket',
    title: 'Big Ticket',
    text: `made $${BIG_TICKET_GROSS.toLocaleString('en-US')} or more gross on one sale`,
    group: 'selling',
    ...anyNewSale((s) => gross(s) >= BIG_TICKET_GROSS),
  },
  {
    id: 'every-model',
    title: 'Every Model',
    text: 'sold one of every model',
    group: 'selling',
    when: 'live',
    check: (prev, next) => salesChanged(prev, next) && everyModel(next),
  },
  // Business
  {
    id: 'in-the-black',
    title: 'In the Black',
    text: 'ended a day with a positive net',
    group: 'business',
    when: 'day',
    check: (ctx) => netIncome(ctx.stats) > 0,
  },
  {
    id: 'six-figures',
    title: 'Six Figures',
    text: `had $${SIX_FIGURES.toLocaleString('en-US')} in cash`,
    group: 'business',
    when: 'live',
    check: (prev, next) => next.cash !== prev.cash && next.cash >= SIX_FIGURES,
  },
  {
    id: 'holdback',
    title: 'Holdback',
    text: "met the manufacturer's monthly quota",
    group: 'business',
    when: 'day',
    check: (ctx) => !!ctx.stats.quota && ctx.stats.quota.sold >= ctx.stats.quota.quota,
  },
  {
    id: 'ad-man',
    title: 'Ad Man',
    text: 'made a sale from every ad channel',
    group: 'business',
    when: 'live',
    check: (prev, next) => salesChanged(prev, next) && everyChannel(next),
  },
  {
    id: 'no-debt',
    title: 'No Debt',
    text: `closed a day with ${NO_DEBT_CARS}+ cars and none on the floor plan`,
    group: 'business',
    when: 'day',
    check: (ctx) => {
      const cars = stocked(ctx.inventory)
      return cars.length >= NO_DEBT_CARS && cars.every((c) => !c.floored)
    },
  },
  {
    id: 'fully-loaded',
    title: 'Fully Loaded',
    text: 'opened with every lot space and platform full',
    group: 'business',
    when: 'live',
    check: (prev, next) =>
      !sameDay(prev, next) &&
      freeSlots(next.inventory, [], [], installedExpansions(next.expansions, next.clock.day))
        .length === 0,
  },
  {
    id: 'tube-man-fan',
    title: 'Tube Man Fan',
    text: 'owned every outdoor improvement',
    group: 'business',
    hidden: true,
    when: 'live',
    check: (prev, next) =>
      next.improvements !== prev.improvements &&
      OUTSIDE_IMPROVEMENTS.every((id) => next.improvements.some((o) => o.id === id)),
  },
  // People
  {
    id: 'first-hire',
    title: 'First Hire',
    text: 'hired your first employee',
    group: 'people',
    when: 'live',
    check: (prev, next) => next.roster !== prev.roster && next.roster.some((e) => !e.fired),
  },
  {
    id: 'full-house',
    title: 'Full House',
    text: 'had every role filled at once',
    group: 'people',
    when: 'live',
    check: (prev, next) =>
      (next.roster !== prev.roster ||
        next.expansions !== prev.expansions ||
        !sameDay(prev, next)) &&
      fullHouse(next),
  },
  {
    id: 'star-seller',
    title: 'Star Seller',
    text: `a salesperson reached ${STAR_SELLER_SALES} sales`,
    group: 'people',
    when: 'live',
    check: (prev, next) => salesChanged(prev, next) && starSeller(next, STAR_SELLER_SALES),
  },
  {
    id: 'loyal',
    title: 'Loyal',
    text: 'kept an employee Nazma poached',
    group: 'people',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.nazma !== prev.dayStats.nazma && next.dayStats.nazma.kept.length > 0,
  },
  {
    id: 'hands-off',
    title: 'Hands Off',
    text: `staff made every sale on a day of ${HANDS_OFF_SALES}+`,
    group: 'people',
    when: 'day',
    check: (ctx) =>
      ctx.stats.sales.length >= HANDS_OFF_SALES && ctx.stats.sales.every((s) => s.soldBy !== null),
  },
  {
    id: 'homegrown',
    title: 'Homegrown',
    text: 'grew someone hired at skill 1 to skill 5',
    group: 'people',
    when: 'live',
    check: (prev, next) =>
      next.roster !== prev.roster &&
      next.roster.some((e) => !e.fired && e.skill === MAX_SKILL && hiredSkill(e) === MIN_SKILL),
  },
  {
    id: 'first-senior',
    title: 'Corner Office',
    text: 'promoted someone to Senior',
    group: 'people',
    when: 'live',
    check: (prev, next) => next.roster !== prev.roster && next.roster.some((e) => e.senior),
  },
  {
    id: 'eotm',
    title: 'Employee of the Month',
    text: 'named an Employee of the Month',
    group: 'people',
    when: 'day',
    check: (ctx) => ctx.stats.eotm !== null,
  },
  {
    id: 'happy-team',
    title: 'Happy Team',
    text: `kept a team of ${HAPPY_TEAM_SIZE}+ all at ${TEAM_MORALE}+ morale for ${HAPPY_TEAM_DAYS} days in a row`,
    group: 'people',
    when: 'day',
    check: (ctx) => ctx.records.happyStreak >= HAPPY_TEAM_DAYS,
  },
  {
    id: 'huddle-up',
    title: 'Huddle Up',
    text: `held ${HUDDLES} morning huddles`,
    group: 'people',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.huddle &&
      !prev.dayStats.huddle &&
      next.lifetime.huddles + (next.dayStats.settled ? 0 : 1) >= HUDDLES,
  },
  // Adversaries
  {
    id: 'not-on-my-lot',
    title: 'Not On My Lot',
    text: 'ran Nazma off yourself',
    group: 'adversaries',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.nazma !== prev.dayStats.nazma && next.dayStats.nazma.runOff === 'player',
  },
  {
    id: 'guard-dog',
    title: 'Guard Dog',
    text: 'your guard ran Nazma off',
    group: 'adversaries',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.nazma !== prev.dayStats.nazma && next.dayStats.nazma.runOff === 'guard',
  },
  {
    id: 'fort-knox',
    title: 'Fort Knox',
    text: 'your guard foiled a theft',
    group: 'adversaries',
    when: 'day',
    check: (ctx) => ctx.stats.nazma.foiled,
  },
  {
    id: 'spotless',
    title: 'Spotless',
    text: 'closed a day with every car sparkling clean',
    group: 'adversaries',
    when: 'day',
    check: (ctx) => {
      const cars = stocked(ctx.inventory)
      return cars.length >= SPOTLESS_CARS && cars.every((c) => c.cleanliness >= SPOTLESS_CLEAN)
    },
  },
  {
    id: 'rival-bust',
    title: 'Rival Bust',
    text: "put Nazma's lot out of business",
    group: 'adversaries',
    when: 'live',
    check: (prev, next) => next.career !== prev.career && next.career.rivalsBeaten > 0,
  },
  // Calendar
  {
    id: 'rain-or-shine',
    title: 'Rain or Shine',
    text: `sold ${RAINY_SALES} cars on a rainy day`,
    group: 'calendar',
    when: 'live',
    check: (prev, next) =>
      salesChanged(prev, next) &&
      next.weather === 'rain' &&
      next.dayStats.sales.length >= RAINY_SALES,
  },
  {
    id: 'sale-weekend',
    title: 'Sale Weekend',
    text: `sold ${WEEKEND_SALES} cars over one sale weekend`,
    group: 'calendar',
    when: 'day',
    check: (ctx) => weekendSales(ctx.log, ctx.day) >= WEEKEND_SALES,
  },
  {
    id: 'busy-saturday',
    title: 'Busy Saturday',
    text: `had ${SATURDAY_VISITORS} visitors on a Saturday`,
    group: 'calendar',
    when: 'day',
    check: (ctx) =>
      calendarOf(ctx.day).weekday === SATURDAY && ctx.stats.visitors >= SATURDAY_VISITORS,
  },
  {
    id: 'one-year',
    title: 'One Year',
    text: 'made it to the end of a year',
    group: 'calendar',
    when: 'day',
    check: (ctx) => ctx.day >= MONTHS_PER_YEAR * DAYS_PER_MONTH,
  },
  {
    id: 'streak',
    title: 'On a Roll',
    text: `made a sale ${STREAK_DAYS} days in a row`,
    group: 'calendar',
    when: 'day',
    check: (ctx) => ctx.records.streak >= STREAK_DAYS,
  },
  // Used cars
  {
    id: 'trade-in',
    title: 'Trade-In',
    text: 'made a sale with a trade-in',
    group: 'used',
    ...anyNewSale((s) => !!s.trade),
  },
  {
    id: 'bought-low',
    title: 'Bought Low',
    text: 'bought a car for less than its seller hoped',
    group: 'used',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.bought !== prev.dayStats.bought &&
      next.dayStats.bought.some((b) => b.hope !== undefined && b.price < b.hope),
  },
  {
    id: 'flipper',
    title: 'Flipper',
    text: `made $${FLIPPER_GROSS.toLocaleString('en-US')} or more gross on a used car`,
    group: 'used',
    ...anyNewSale((s) => !!s.used && gross(s) >= FLIPPER_GROSS),
  },
  {
    id: 'fresh-lot',
    title: 'Fresh Lot',
    text: `sold a used car within ${FRESH_DAYS} days of buying it`,
    group: 'used',
    ...anyNewSale((s, next) => {
      const used = next.inventory.find((c) => c.id === s.carId)?.used
      return !!s.used && !!used && next.clock.day - used.acquiredDay <= FRESH_DAYS
    }),
  },
  // Reputation
  {
    id: 'well-known',
    title: 'Well Known',
    text: `reached a reputation of ${WELL_KNOWN}`,
    group: 'reputation',
    when: 'day',
    check: (ctx) => ctx.reputation >= WELL_KNOWN,
  },
  {
    id: 'beloved',
    title: 'Beloved',
    text: `reached a reputation of ${BELOVED}`,
    group: 'reputation',
    when: 'day',
    check: (ctx) => ctx.reputation >= BELOVED,
  },
  // Career
  ...(['main-street', 'trusted-dealer', 'regional-name'] as const).map((id): Achievement => ({
    id,
    title: rankName(id),
    text: `reached the rank of ${rankName(id)}`,
    group: 'career',
    ...rankReached(id),
  })),
  {
    id: 'dealer-of-the-year',
    title: TOP_RANK.name,
    text: 'reached the top rank',
    group: 'career',
    ...rankReached(TOP_RANK.id),
  },
  {
    id: 'gold-franchise',
    title: 'Gold Franchise',
    text: 'reached the Gold franchise tier',
    group: 'career',
    when: 'day',
    check: (ctx) => ctx.franchise === 'gold',
  },
  // Service
  {
    id: 'first-service',
    title: 'First Service Job',
    text: "finished your first client's service job",
    group: 'service',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.service !== prev.dayStats.service && next.dayStats.service.jobs > 0,
  },
  {
    id: 'done-right',
    title: 'Done Right',
    text: `finished ${DONE_RIGHT_JOBS} service jobs in a day with no comebacks`,
    group: 'service',
    when: 'day',
    check: (ctx) => ctx.stats.service.jobs >= DONE_RIGHT_JOBS && ctx.stats.service.comebacks === 0,
  },
  // Clients
  {
    id: 'fifty-clients',
    title: 'Fifty Clients',
    text: `had ${BOOK_CLIENTS} clients in your book`,
    group: 'clients',
    when: 'live',
    check: (prev, next) =>
      next.clients !== prev.clients &&
      next.clients.filter((c) => c.status === 'client').length >= BOOK_CLIENTS,
  },
  {
    id: 'trade-up',
    title: 'Trade-Up',
    text: 'sold a client a new car for their old one',
    group: 'clients',
    ...anyNewSale((s) => !!s.returning && !!s.trade),
  },
  {
    id: 'referral',
    title: 'Word of Mouth',
    text: 'sold to a friend a client sent',
    group: 'clients',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.clients !== prev.dayStats.clients && next.dayStats.clients.referrals > 0,
  },
  {
    id: 'csi-90',
    title: 'Top Marks',
    text: `finished a month with a CSI of ${CSI_TARGET}`,
    group: 'clients',
    when: 'day',
    check: (ctx) => (ctx.career.bestCsi ?? 0) >= CSI_TARGET,
  },
  // Finance
  {
    id: 'first-loan',
    title: 'Paper Signed',
    text: 'closed a financed deal at your own desk',
    group: 'finance',
    ...anyNewSale((s) => yours(s) && !!s.fi?.financed && s.fi.lender !== null),
  },
  {
    id: 'the-works',
    title: 'The Works',
    text: 'sold every product on the menu in one deal',
    group: 'finance',
    ...anyNewSale(
      (s) => !!s.fi && PRODUCT_IDS.every((id) => s.fi!.products.some((p) => p.id === id)),
    ),
  },
  {
    id: 'back-end',
    title: 'Back-End Pro',
    text: `made $${BACK_END_GROSS.toLocaleString('en-US')} or more F&I gross on one deal`,
    group: 'finance',
    ...anyNewSale((s) => (s.fi?.gross ?? 0) >= BACK_END_GROSS),
  },
  {
    id: 'clean-books',
    title: 'Clean Books',
    text: `finished a month of ${CLEAN_BOOKS_DEALS}+ financed deals with no chargebacks`,
    group: 'finance',
    when: 'day',
    check: (ctx) =>
      calendarOf(ctx.day).dayOfMonth === DAYS_PER_MONTH &&
      ctx.monthFi.financed >= CLEAN_BOOKS_DEALS &&
      ctx.monthFi.chargebackCount === 0,
  },
  {
    id: 'covered',
    title: 'Covered',
    text: 'finished a repair an extended warranty paid for',
    group: 'service',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.service !== prev.dayStats.service && next.dayStats.service.claims > 0,
  },
  // Test drives
  {
    id: 'first-drive',
    title: 'Along for the Ride',
    text: 'rode along on a test drive',
    group: 'drives',
    ...drivesReach(1, (d) => d.taken - d.byStaff),
  },
  {
    id: 'perfect-pitch',
    title: 'Perfect Pitch',
    text: 'made every talking point count on a test drive',
    group: 'drives',
    ...drivesReach(1, (d) => d.perfect),
  },
  {
    id: 'sold-on-the-road',
    title: 'Sold on the Road',
    text: `sold ${ROAD_SALES} cars in a day to buyers who took a test drive`,
    group: 'drives',
    ...drivesReach(ROAD_SALES, (d) => d.bought),
  },
  {
    id: 'road-crew',
    title: 'Road Crew',
    text: `had salespeople take ${TEAM_DRIVES} test drives in a day`,
    group: 'drives',
    ...drivesReach(TEAM_DRIVES, (d) => d.byStaff),
  },
  {
    id: 'not-a-scratch',
    title: 'Not a Scratch',
    text: `took ${SCRATCH_FREE_DRIVES}+ test drives in a day without a ding`,
    group: 'drives',
    when: 'day',
    check: (ctx) => ctx.stats.drives.taken >= SCRATCH_FREE_DRIVES && ctx.stats.drives.dings === 0,
  },
  // Auction
  {
    id: 'first-lot',
    title: 'Sold to the Dealership',
    text: 'won a lot at the dealer auction',
    group: 'auction',
    ...anyNewBuy(() => true),
  },
  {
    id: 'a-steal',
    title: 'A Steal',
    text: `won a lot for under ${Math.round(STEAL_SHARE * 100)}% of its wholesale value`,
    group: 'auction',
    ...anyNewBuy(isSteal),
  },
  {
    id: 'bought-back',
    title: 'Bought Back',
    text: 'bought back a car Nazma stole',
    group: 'auction',
    ...anyNewBuy((b) => !!b.stolen),
  },
  {
    id: 'sold-to-the-trade',
    title: 'Sold to the Trade',
    text: 'wholesaled a car for more than it cost, after the fee',
    group: 'auction',
    when: 'live',
    check: (prev, next) =>
      next.dayStats.wholesale !== prev.dayStats.wholesale &&
      next.dayStats.wholesale.sold.some((w) => w.price - w.fee > w.cost),
  },
  // Hidden
  {
    id: 'fender-bender',
    title: 'Fender Bender',
    text: 'had a car come back from a test drive with a ding',
    group: 'drives',
    hidden: true,
    ...drivesReach(1, (d) => d.dings),
  },
  {
    id: 'car-wash',
    title: 'Car Wash',
    text: `washed ${CAR_WASHES} cars yourself in a day`,
    group: 'business',
    hidden: true,
    when: 'live',
    check: (prev, next) =>
      next.dayStats.washes !== prev.dayStats.washes && next.dayStats.washes >= CAR_WASHES,
  },
]

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id)

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export function achievementOf(id: AchievementId): Achievement {
  return BY_ID.get(id)!
}

export function isAchievementId(v: unknown): v is AchievementId {
  return BY_ID.has(v as AchievementId)
}

/** An achievement earned: on what day and at what level. */
export interface EarnedAchievement {
  id: AchievementId
  day: number
  level: Difficulty
}

const LIVE = ACHIEVEMENTS.filter((a) => a.when === 'live')
const DAY_END = ACHIEVEMENTS.filter((a) => a.when === 'day')

/** Whether anything a live check reads changed between `prev` and `next`. */
function changed(prev: AchievementState, next: AchievementState): boolean {
  return (
    prev.clock.day !== next.clock.day ||
    prev.cash !== next.cash ||
    prev.dayStats !== next.dayStats ||
    prev.inventory !== next.inventory ||
    prev.roster !== next.roster ||
    prev.improvements !== next.improvements ||
    prev.expansions !== next.expansions ||
    prev.career !== next.career ||
    prev.clients !== next.clients
  )
}

const notEarned = (earned: readonly EarnedAchievement[]) => {
  const have = new Set(earned.map((e) => e.id))
  return (a: Achievement) => !have.has(a.id)
}

/**
 * Achievements the change from `prev` to `next` earns, not already in
 * `earned`. Nothing while the title screen is up or as a game starts or
 * resumes from it.
 */
export function achievementsFor(
  prev: AchievementState,
  next: AchievementState,
  earned: readonly EarnedAchievement[],
): AchievementId[] {
  if (next.screen !== 'playing' || prev.screen !== 'playing') return []
  if (!changed(prev, next)) return []
  return LIVE.filter(notEarned(earned))
    .filter((a) => a.when === 'live' && a.check(prev, next))
    .map((a) => a.id)
}

/** Achievements a settled day earns, not already in `earned`. */
export function dayAchievements(
  ctx: DayContext,
  earned: readonly EarnedAchievement[],
): AchievementId[] {
  return DAY_END.filter(notEarned(earned))
    .filter((a) => a.when === 'day' && a.check(ctx))
    .map((a) => a.id)
}

/** "🏆 Full Sticker: sold a new car at full MSRP", or for several at once "🏆 3 achievements: …". */
export function achievementNotice(ids: readonly AchievementId[]): string {
  if (ids.length === 1) {
    const a = achievementOf(ids[0])
    return `🏆 ${a.title}: ${a.text}`
  }
  const titles = ids.map((id) => achievementOf(id).title)
  return `🏆 ${ids.length} achievements: ${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}
