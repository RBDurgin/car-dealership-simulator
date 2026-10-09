import { calendarOf, DAYS_PER_WEEK, longDate } from './calendar'
import type { Customer } from './customers'
import type { Sale } from './deal'
import { EVENT_FIRST_WEEKDAY, eventOn } from './events'
import { BASE_MSRP } from './inventory'
import type { CarModel } from './layout'
import { PRICE_STEP } from './negotiation'
import { RANK_IDS, type RankId } from './progression'
import { START_REPUTATION } from './reputation'
import { createRng, type Rng } from './rng'

/**
 * Nazma's rival dealership across the road. Once the player's dealership
 * reaches `OPENING_RANK`, Nazma announces his own lot, and a week later it
 * opens and takes a share of the town's buyers: the day's planned visitors
 * are scaled by `1 − share`. His share rises with his strength and his price
 * cut, and falls with the player's reputation, ads and discounts. Each
 * evening his strength drifts with the share he took. The rival is saved.
 * Some of the day's shoppers have been to his lot first and carry his price
 * on a model they want (`assignQuotes`); the haggle weighs it (`quoteFor` in
 * `sim/negotiation.ts`). Each Monday he picks a move for the week
 * (`planRivalWeek`), and the lower his share the more desperate he gets
 * (`desperation`), which makes Nazma's visits, thefts and poaching likelier
 * (`sabotageScale`). Cars he steals go on his lot (`rivalStole`) and staff he
 * poaches go to work for him (`rivalHired`).
 */

/**
 * - unopened: nothing across the road yet
 * - announced: the lot is going up; it opens on `openDay`
 * - open: taking buyers
 * - closed: gone bust, until `closedUntil`
 */
export type RivalStatus = 'unopened' | 'announced' | 'open' | 'closed'

export interface Rival {
  status: RivalStatus
  /** The name over his lot. */
  name: string
  /** How many times he has opened (0 until the first). */
  generation: number
  /** The day he opens (or opened). 0 until announced. */
  openDay: number
  /** While closed, the day he may reopen. 0 otherwise. */
  closedUntil: number
  /** How strong his business is, 0–100. */
  strength: number
  /** His discount off MSRP, 0–1. */
  undercut: number
  /** A running average of the player's discount off MSRP on new cars, 0–1. */
  ourDiscount: number
  /** His share of the town's buyers on each of the last `SHARE_DAYS` open days, oldest first. */
  shares: number[]
  /** His average share each week he was open, as reported on Mondays, oldest first (the last `WEEKS_KEPT`). */
  weeks: number[]
  /** Models he has stolen, for sale on his lot. */
  stolen: CarModel[]
  /** Names of the staff he has poached, now working for him. */
  hires: string[]
  /** The last night Nazma tried to steal a car (0 if never). */
  lastTheftDay: number
  /** This week's move, picked on Monday while he's open (null before the first). */
  move: RivalMove | null
}

/**
 * - priceWar: his undercut deepens by `PRICE_WAR_UNDERCUT`
 * - adBlitz: the player's ads bring `BLITZ_CUT` fewer visitors
 * - saleWeekend: his share rises Friday to Sunday
 * - quiet: nothing special
 */
export type RivalMoveId = 'priceWar' | 'adBlitz' | 'saleWeekend' | 'quiet'

export interface RivalMove {
  id: RivalMoveId
  /** The Monday it was picked. */
  from: number
}

/** He announces his lot once the player reaches this rank. */
export const OPENING_RANK: RankId = 'main-street'
/** The least notice he gives: the lot opens on the first Monday at least this far off. */
export const NOTICE_DAYS = DAYS_PER_WEEK
/** His names, one per opening. */
export const RIVAL_NAMES = ["Nazma's Motors", 'N-Z Auto Outlet', 'Discount Dreams by Nazma']

/** His strength on opening, before the level's `rivalStrength`. */
export const OPEN_STRENGTH = 40
/** His discount off MSRP on opening, before the level's `rivalUndercut`. */
export const OPEN_UNDERCUT = 0.04
/** Where the player's average discount starts, before any sale. */
export const START_DISCOUNT = 0.04

/** The most of the town's buyers he can take. */
export const MAX_SHARE = 0.35
/** Weights on the logistic behind `marketShare`. */
const STRENGTH_WEIGHT = 1
const PRICE_WEIGHT = 0.5
/** A price gap of this much (his undercut over our discount) counts as one unit. */
const PRICE_UNIT = 0.05
const REPUTATION_WEIGHT = 1.5
/** Each active ad campaign pulls his share down by this, up to `MAX_ADS` of them. */
const AD_WEIGHT = 0.4
const MAX_ADS = 3

/** Days of share kept, for the weekly check. */
export const SHARE_DAYS = DAYS_PER_WEEK
/** Weekly shares kept, for the Rival tab and the weekly check. */
export const WEEKS_KEPT = 8
/** He grows when his share is above this and shrinks below it. */
export const PIVOT_SHARE = 0.12
/** Strength gained (or lost) per day per point of share away from `PIVOT_SHARE`. */
export const SHARE_GROWTH = 30
/** Strength he gains for each of his quote-holders who walked out on the player. */
export const LOST_STRENGTH = 1.5
/** Strength he loses for each of his quote-holders the player sold to. */
export const MATCHED_STRENGTH = 1
/** The day's strength wobbles by up to this either way. */
const STRENGTH_NOISE = 0.5
/** How much each new-car sale moves `ourDiscount`. */
const DISCOUNT_WEIGHT = 0.1

/** How the rival stood in today's market. */
export interface RivalStats {
  /** His share of today's buyers. */
  share: number
  /** Customers carrying his quote who walked out to him. */
  lost: number
  /** Customers carrying his quote the player sold to at or under it. */
  matched: number
}

export function emptyRival(): Rival {
  return {
    status: 'unopened',
    name: RIVAL_NAMES[0],
    generation: 0,
    openDay: 0,
    closedUntil: 0,
    strength: 0,
    undercut: 0,
    ourDiscount: START_DISCOUNT,
    shares: [],
    weeks: [],
    stolen: [],
    hires: [],
    lastTheftDay: 0,
    move: null,
  }
}

/** Whether he should announce his lot: not yet, and the player has reached `OPENING_RANK`. */
export function shouldAnnounce(rank: RankId, rival: Rival): boolean {
  return rival.status === 'unopened' && RANK_IDS.indexOf(rank) >= RANK_IDS.indexOf(OPENING_RANK)
}

/** The first Monday at least `NOTICE_DAYS` after `day`. */
export function openingDay(day: number): number {
  const earliest = day + NOTICE_DAYS
  return earliest + ((DAYS_PER_WEEK - calendarOf(earliest).weekday) % DAYS_PER_WEEK)
}

/** What the morning brought: his lot announced or opened, or (on a Monday) last week's report. */
export type RivalEvent = 'announced' | 'opened' | 'week'

/**
 * The rival on `day`'s morning: announced once the player is at `rank` (or
 * higher), opened on his `openDay`. `strength` and `undercut` are the level's
 * `rivalStrength` and `rivalUndercut`. On a Monday while he's open, last
 * week's average share goes on `weeks`, and he picks the week's move (on his
 * opening day too, a Monday).
 */
export function rivalMorning(
  rival: Rival,
  day: number,
  rank: RankId,
  strength = 1,
  undercut = 1,
): { rival: Rival; event: RivalEvent | null } {
  if (shouldAnnounce(rank, rival)) {
    return {
      rival: { ...rival, status: 'announced', openDay: openingDay(day) },
      event: 'announced',
    }
  }
  if (rival.status === 'announced' && day >= rival.openDay) {
    const generation = rival.generation + 1
    const opened: Rival = {
      ...rival,
      status: 'open',
      generation,
      name: RIVAL_NAMES[(generation - 1) % RIVAL_NAMES.length],
      strength: Math.min(100, OPEN_STRENGTH * strength),
      undercut: OPEN_UNDERCUT * undercut,
      shares: [],
      weeks: [],
    }
    return { rival: withMove(opened, day), event: 'opened' }
  }
  if (rival.status === 'open' && calendarOf(day).weekday === 0) {
    if (rival.shares.length === 0) return { rival: withMove(rival, day), event: null }
    const week = rival.shares.reduce((a, b) => a + b, 0) / rival.shares.length
    const reported = { ...rival, weeks: [...rival.weeks, week].slice(-WEEKS_KEPT) }
    return { rival: withMove(reported, day), event: 'week' }
  }
  return { rival, event: null }
}

/** `rival` with the week from Monday `day` planned. */
const withMove = (rival: Rival, day: number): Rival => ({
  ...rival,
  move: planRivalWeek(rival, day),
})

/** His undercut deepens by this during a price war. */
export const PRICE_WAR_UNDERCUT = 0.03
/** During his ad blitz, the player's ads bring this much less traffic. */
export const BLITZ_CUT = 0.5
/** During his sale weekend, the logistic behind `marketShare` is pushed up this much Friday to Sunday. */
export const SALE_WEEKEND_PUSH = 1
const WEEK_SEED = 23_000

/** His share at or over this, he's calm; at or under `DESPERATE_SHARE`, as desperate as he gets. */
export const CALM_SHARE = 0.2
export const DESPERATE_SHARE = 0.05
/** A desperate Nazma visits, steals and poaches this many times as often as a calm one. */
export const DESPERATE_SCALE = 2

/**
 * How desperate he is, 0 (calm) to 1: his average share over the last days
 * he was open, from `CALM_SHARE` down to `DESPERATE_SHARE`. Calm until he
 * has a day behind him, and unless he's open.
 */
export function desperation(rival: Rival): number {
  if (rival.status !== 'open' || rival.shares.length === 0) return 0
  const avg = rival.shares.reduce((a, b) => a + b, 0) / rival.shares.length
  return Math.max(0, Math.min(1, (CALM_SHARE - avg) / (CALM_SHARE - DESPERATE_SHARE)))
}

/**
 * What his business does to the odds of Nazma's visits, thefts and poaching:
 * as in Phase 9 (1) until he opens, up to `DESPERATE_SCALE` with his
 * `desperation` while he's open, and none while he's closed.
 */
export function sabotageScale(rival: Rival): number {
  if (rival.status === 'closed') return 0
  return 1 + desperation(rival) * (DESPERATE_SCALE - 1)
}

/**
 * His move for the week from Monday `day`, seeded by the day and his
 * generation. The more desperate he is, the likelier a price war and the less
 * likely a quiet week. A week ending in one of the player's sale weekends
 * (`EVENTS`) draws his own sale weekend onto it.
 */
export function planRivalWeek(rival: Rival, day: number): RivalMove {
  const d = desperation(rival)
  const eventWeek = !!eventOn(day + EVENT_FIRST_WEEKDAY)
  const weights: [RivalMoveId, number][] = [
    ['priceWar', 1 + 2 * d],
    ['adBlitz', 1],
    ['saleWeekend', eventWeek ? 4 : 1],
    ['quiet', 1.5 * (1 - d) + 0.25],
  ]
  const rng = createRng(WEEK_SEED + day + rival.generation * 1_000)
  let roll = rng.next() * weights.reduce((sum, [, w]) => sum + w, 0)
  const id = weights.find(([, w]) => (roll -= w) < 0)?.[0] ?? 'quiet'
  return { id, from: day }
}

/** His move this week, or null unless he's open. */
export function activeMove(rival: Rival): RivalMoveId | null {
  return rival.status === 'open' ? (rival.move?.id ?? null) : null
}

/** His discount off MSRP today, deeper during a price war. */
export function undercutOf(rival: Rival): number {
  return rival.undercut + (activeMove(rival) === 'priceWar' ? PRICE_WAR_UNDERCUT : 0)
}

/** What the player's ad traffic is scaled by: less during his ad blitz. */
export function blitzScale(rival: Rival): number {
  return activeMove(rival) === 'adBlitz' ? 1 - BLITZ_CUT : 1
}

/** Whether `day` is one of the days of his sale weekend. */
export function onSaleWeekend(rival: Rival, day: number): boolean {
  return activeMove(rival) === 'saleWeekend' && calendarOf(day).weekday >= EVENT_FIRST_WEEKDAY
}

export const MOVE_LABELS: Record<RivalMoveId, string> = {
  priceWar: 'Price war',
  adBlitz: 'Ad blitz',
  saleWeekend: 'Sale weekend',
  quiet: 'Quiet week',
}

/** What his move does this week, for the Rival tab and the Monday notice. */
export function moveText(rival: Rival): string | null {
  switch (activeMove(rival)) {
    case 'priceWar':
      return `a price war: he's selling at ${percent(undercutOf(rival))}% under MSRP.`
    case 'adBlitz':
      return `an ad blitz: your ads bring in ${percent(BLITZ_CUT)}% fewer shoppers.`
    case 'saleWeekend':
      return 'a sale weekend: more of the town goes to him Friday to Sunday.'
    case 'quiet':
      return 'a quiet one.'
    default:
      return null
  }
}

/** How many of the cars he stole are kept on his lot. */
export const STOLEN_KEPT = 4
/** How many of his hires are remembered. */
export const HIRES_KEPT = 6
/** Strength he gains per skill point of each employee he poaches. */
export const HIRE_STRENGTH = 2

/** A car of `model` stolen overnight: on his lot while he's open. */
export function rivalStole(rival: Rival, model: CarModel): Rival {
  if (rival.status !== 'open') return rival
  return { ...rival, stolen: [...rival.stolen, model].slice(-STOLEN_KEPT) }
}

/**
 * Staff who quit after Nazma talked to them: while he's open they go to work
 * for him, each adding `HIRE_STRENGTH` per skill point (× the level's `growth`).
 */
export function rivalHired(
  rival: Rival,
  staff: readonly { name: string; skill: number }[],
  growth = 1,
): Rival {
  if (rival.status !== 'open' || staff.length === 0) return rival
  const gain = staff.reduce((sum, e) => sum + e.skill * HIRE_STRENGTH, 0) * growth
  return {
    ...rival,
    hires: [...rival.hires, ...staff.map((e) => e.name)].slice(-HIRES_KEPT),
    strength: Math.min(100, rival.strength + gain),
  }
}

const percent = (share: number) => Math.round(share * 100)

/** Last week's share against the week before, in whole points, or null with only one week. */
export function weekChange(weeks: readonly number[]): number | null {
  if (weeks.length < 2) return null
  return percent(weeks[weeks.length - 1]) - percent(weeks[weeks.length - 2])
}

/** "18% (↑3)": a share, and the change in points when there is one. */
export function shareLine(share: number, change: number | null): string {
  const arrow =
    change === null
      ? ''
      : change > 0
        ? ` (↑${change})`
        : change < 0
          ? ` (↓${-change})`
          : ' (no change)'
  return `${percent(share)}%${arrow}`
}

/** The morning's word on his lot. */
export function rivalNotice(rival: Rival, event: RivalEvent): string {
  switch (event) {
    case 'announced':
      return `Nazma has bought the lot across the road. ${rival.name} opens there on ${longDate(rival.openDay)}.`
    case 'opened':
      return `${rival.name} opened across the road today. Expect some shoppers to go to him instead.${weekLine(rival)}`
    case 'week':
      return `${rival.name} took ${shareLine(rival.weeks[rival.weeks.length - 1] ?? 0, weekChange(rival.weeks))} of the town's buyers last week.${weekLine(rival)}`
  }
}

/** " This week: a price war: …", or nothing without a move. */
function weekLine(rival: Rival): string {
  const text = moveText(rival)
  return text ? ` This week: ${text}` : ''
}

/** His price on a car with this sticker: MSRP less his undercut, to the nearest `PRICE_STEP`. */
export function rivalPrice(rival: Rival, msrp: number): number {
  return Math.round((msrp * (1 - undercutOf(rival))) / PRICE_STEP) * PRICE_STEP
}

/** His price on one model, quoted to a shopper who went to his lot first. */
export interface RivalQuote {
  model: CarModel
  price: number
}

/** Shoppers carrying a quote, as a multiple of his share: about 1 in 5 at a 20% share. */
export const QUOTE_RATE = 1

/**
 * Some of `arrived` have shopped at his lot first: each new-car shopper
 * carries his quote with odds of his `share` × `QUOTE_RATE`, on one of the
 * models they want. Used-car shoppers and sellers never do. Nothing unless
 * he's open.
 */
export function assignQuotes(
  arrived: readonly Customer[],
  rival: Rival,
  share: number,
  rng: Rng,
): Customer[] {
  if (rival.status !== 'open' || share <= 0) return [...arrived]
  return arrived.map((c) => {
    if (c.selling || c.archetype === 'used-shopper' || c.preferredModels.length === 0) return c
    if (rng.next() >= share * QUOTE_RATE) return c
    const model = rng.pick(c.preferredModels)
    return { ...c, rivalQuote: { model, price: rivalPrice(rival, BASE_MSRP[model]) } }
  })
}

/** The banner on his front fence on `day`: his status, or this week's move. */
export function bannerText(rival: Rival, day: number): string {
  switch (rival.status) {
    case 'announced':
      return 'OPENING SOON'
    case 'closed':
      return 'CLOSED'
  }
  switch (activeMove(rival)) {
    case 'priceWar':
      return `PRICE WAR! ${percent(undercutOf(rival))}% OFF`
    case 'adBlitz':
      return 'AS SEEN ON TV!'
    case 'saleWeekend':
      return onSaleWeekend(rival, day) ? 'SALE WEEKEND!' : 'SALE THIS WEEKEND'
    default:
      return `${percent(undercutOf(rival))}% UNDER MSRP!`
  }
}

export const RIVAL_STATUS_LABELS: Record<RivalStatus, string> = {
  unopened: 'Not here yet',
  announced: 'Opening soon',
  open: 'Open',
  closed: 'Closed',
}

/** What the player's dealership brings against him. */
export interface OurStanding {
  reputation: number
  /** Ad campaigns running today. */
  campaigns: number
  /** Today, for his sale weekend. */
  day?: number
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/**
 * His share of the town's buyers, 0 to `MAX_SHARE`: a logistic that rises
 * with his strength and with his undercut over the player's average discount,
 * and falls with the player's reputation and running ads. More on the days of
 * his sale weekend. None unless open.
 */
export function marketShare(rival: Rival, us: OurStanding): number {
  if (rival.status !== 'open') return 0
  const x =
    (STRENGTH_WEIGHT * (rival.strength - 50)) / 50 +
    (PRICE_WEIGHT * (undercutOf(rival) - rival.ourDiscount)) / PRICE_UNIT -
    (REPUTATION_WEIGHT * (us.reputation - START_REPUTATION)) / 50 -
    AD_WEIGHT * Math.min(MAX_ADS, us.campaigns) +
    (us.day !== undefined && onSaleWeekend(rival, us.day) ? SALE_WEEKEND_PUSH : 0)
  return MAX_SHARE * sigmoid(x)
}

/** `ourDiscount` moved toward each new car's discount off MSRP in `sales`. */
export function averageDiscount(ourDiscount: number, sales: readonly Sale[]): number {
  let avg = ourDiscount
  for (const s of sales) {
    if (s.used || s.msrp <= 0) continue
    const discount = Math.max(0, 1 - s.price / s.msrp)
    avg += (discount - avg) * DISCOUNT_WEIGHT
  }
  return avg
}

/**
 * The rival after the day is settled. The player's average discount follows
 * the day's new-car sales whatever his status. While he's open, the day's
 * share is recorded and his strength drifts: up (× the level's `growth`) when
 * his share is over `PIVOT_SHARE` and down under it, up for each buyer who
 * walked out to him and down for each the player matched him on.
 */
export function rivalDay(
  rival: Rival,
  stats: { sales: readonly Sale[]; rival: RivalStats | null },
  rng: Rng,
  growth = 1,
): Rival {
  const ourDiscount = averageDiscount(rival.ourDiscount, stats.sales)
  if (rival.status !== 'open' || !stats.rival) return { ...rival, ourDiscount }
  const { share, lost, matched } = stats.rival
  const drift = (share - PIVOT_SHARE) * SHARE_GROWTH + lost * LOST_STRENGTH
  const change =
    (drift > 0 ? drift * growth : drift) -
    matched * MATCHED_STRENGTH +
    (rng.next() * 2 - 1) * STRENGTH_NOISE
  return {
    ...rival,
    ourDiscount,
    strength: Math.max(0, Math.min(100, rival.strength + change)),
    shares: [...rival.shares, share].slice(-SHARE_DAYS),
  }
}

export function emptyRivalStats(share: number): RivalStats {
  return { share, lost: 0, matched: 0 }
}

const STATUSES: readonly RivalStatus[] = ['unopened', 'announced', 'open', 'closed']
const MOVES: readonly RivalMoveId[] = ['priceWar', 'adBlitz', 'saleWeekend', 'quiet']

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Whether `v` is a well-formed `Rival` (for the save). */
export function isRival(v: unknown): v is Rival {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    (STATUSES as readonly unknown[]).includes(r.status) &&
    typeof r.name === 'string' &&
    isNumber(r.generation) &&
    isNumber(r.openDay) &&
    isNumber(r.closedUntil) &&
    isNumber(r.strength) &&
    isNumber(r.undercut) &&
    isNumber(r.ourDiscount) &&
    Array.isArray(r.shares) &&
    r.shares.every(isNumber) &&
    Array.isArray(r.weeks) &&
    r.weeks.every(isNumber) &&
    isStrings(r.stolen) &&
    isStrings(r.hires) &&
    isNumber(r.lastTheftDay) &&
    (r.move === null || isMove(r.move))
  )
}

function isMove(v: unknown): v is RivalMove {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  return (MOVES as readonly unknown[]).includes(m.id) && isNumber(m.from)
}
