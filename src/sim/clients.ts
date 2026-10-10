import type { Archetype } from './archetypes'
import type { CustomerVariant } from './characters'
import { conditionOf } from './cleanliness'
import type { Customer } from './customers'
import type { InventoryCar } from './inventory'
import type { CarModel } from './layout'
import { hopePrice } from './negotiation'
import type { Rng } from './rng'
import { insultingAllowance } from './tradeIns'
import { MILES_PER_YEAR, modelYear, type UsedInfo } from './usedCars'

/**
 * The client book: everyone who bought from us, and the shoppers who talked
 * to us and left without buying (prospects, kept for `PROSPECT_DAYS`). Each
 * visit is scored for how it went (`visitScore`), and the score is blended
 * into the person's satisfaction. Sellers, service-only visitors and anyone
 * nobody greeted aren't kept: we never got their details.
 *
 * A client is due to trade up `TRADE_UP_DAYS` after a purchase, and lapses
 * (bought elsewhere) `LAPSE_DAYS` after that if they haven't come back.
 */

export type ClientStatus = 'prospect' | 'client' | 'lapsed' | 'defected'

/** The car a client bought from us, as it left the lot. */
export interface ClientCar {
  model: CarModel
  /** It was a used car. */
  used: boolean
  /** What they paid for it. */
  price: number
  boughtDay: number
  year: number
  miles: number
  /** 1 like new, 0 a wreck. */
  condition: number
}

/** Where a prospect's last deal stood, so a be-back can pick up from there. */
export interface LastDeal {
  model: CarModel
  /** Our last ask, or null if we never named a price. */
  ask: number | null
  /** Their last counter, or null if they never made one. */
  counter: number | null
}

/** Why a client is coming in on an appointment (see `sim/calls.ts`). */
export type AppointmentReason = 'beBack' | 'tradeUp' | 'checkIn' | 'winBack'

export interface Appointment {
  day: number
  minute: number
  reason: AppointmentReason
}

/** What a visit's score is made of: a kind, its points and a number for the text. */
export type ReasonKind =
  | 'wait'
  | 'quick'
  | 'haggle'
  | 'goodPrice'
  | 'highPrice'
  | 'cleanCar'
  | 'dirtyCar'
  | 'fairTrade'
  | 'lowTrade'
  | 'loyalty'

export interface ScoreReason {
  kind: ReasonKind
  /** What it added to (or took off) the score. */
  points: number
  /** Minutes waited, haggle rounds, or percent under (over) what they hoped to pay. */
  detail: number
}

export interface Client {
  /** `client-<day>-<n>`, stable across saves. */
  id: string
  name: string
  variant: CustomerVariant
  companion: CustomerVariant | null
  archetype: Archetype
  status: ClientStatus
  /** The day they first went in the book. */
  since: number
  lastVisit: number
  visits: number
  /** Cars bought from us. */
  bought: number
  /** The car they bought from us last, or null for a prospect or a lapsed client. */
  car: ClientCar | null
  budget: number
  preferredModels: CarModel[]
  /** A prospect's last deal, or null. */
  lastDeal: LastDeal | null
  /** 0–100, each visit's score blended in by `VISIT_WEIGHT`. */
  satisfaction: number
  /** The last visit's top reasons, biggest first. */
  reasons: ScoreReason[]
  /** The day they're due to trade up, or null. */
  dueDay: number | null
  /** A prospect's last day in the book, or null. */
  expires: number | null
  /** The day they last picked up a call, or null (see `sim/calls.ts`). */
  lastCall: number | null
  /** Calls they picked up since their last visit. */
  callsThisCycle: number
  appointment: Appointment | null
  /** The client who sent them, or null (16e). */
  referredBy: string | null
  /** Friends they've sent who bought (16e). */
  referrals: number
  /** The day their car is due for service, or null (16f). */
  serviceDue: number | null
}

/** Days a greeted walk-out stays in the book as a prospect. */
export const PROSPECT_DAYS = 14
/** Days after a purchase a client is due to trade up, rolled at the sale. */
export const TRADE_UP_DAYS = { min: 30, max: 60 }
/** Days after `dueDay` a client who hasn't come back has bought elsewhere. */
export const LAPSE_DAYS = 21
/** The book's size limit (see `pruneBook`). */
export const CLIENT_CAP = 200
/** How much one visit's score moves satisfaction. */
export const VISIT_WEIGHT = 0.4
/**
 * Days that make a year of a client's car. The game's year is 336 days, so
 * real time would bring a car back from a 40-day trade-up as new.
 */
export const CLIENT_YEAR_DAYS = 14
/** Condition a client's car loses per (client) year. */
export const CLIENT_WEAR = 0.04

export type VisitOutcome = 'bought' | 'refused' | 'impatient' | 'closing'

/** A visit's score before its reasons, by how they left. */
export const BASE_SCORE: Record<VisitOutcome, number> = {
  bought: 80,
  closing: 55,
  refused: 45,
  impatient: 30,
}
/** Off the score for having waited all their patience (scaled by the share waited). */
export const WAIT_POINTS = 40
/** Waited this many game minutes or less: quick service. */
export const QUICK_WAIT = 10
export const QUICK_POINTS = 4
/** Off the score per haggle round after the first. */
export const HAGGLE_POINTS = 5
/** Points per fraction paid under (or over) what they hoped, capped by `PRICE_CAP`. */
export const PRICE_SCALE = 150
export const PRICE_CAP = 10
/** A clean car pleases, a dirty one doesn't. */
export const CLEAN_POINTS = 4
export const DIRTY_POINTS = -6
/** An allowance at or over what they hoped for their trade, or an insulting one. */
export const FAIR_TRADE_POINTS = 6
export const LOW_TRADE_POINTS = -8
/** Points per share off the sticker a loyalty price adds to a buyer's score: +3 at 2%, +6 at 4%. */
export const LOYALTY_SCORE = 150
/** × the wait's cost to an appointment's visit score: kept waiting after booking a time. */
export const APPOINTMENT_WAIT_WEIGHT = 2
/** Reasons kept per visit. */
export const REASONS_KEPT = 3

export interface VisitScore {
  score: number
  /** Biggest first, at most `REASONS_KEPT`. */
  reasons: ScoreReason[]
}

export interface ScoreContext {
  /** The car they bought, or were after. */
  car: InventoryCar | null
  day: number
  /** Added to the score (`Tuning.satisfactionShift`). */
  shift?: number
  /** × the wait's cost: an appointment kept waiting minds more (`APPOINTMENT_WAIT_WEIGHT`). */
  waitWeight?: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * How `c`'s visit went, 0–100, and why. The base is set by how they left;
 * waiting, haggling and paying over what they hoped take off, and a price
 * under it, a clean car and a fair trade-in allowance add on.
 */
export function visitScore(c: Customer, outcome: VisitOutcome, ctx: ScoreContext): VisitScore {
  const reasons: ScoreReason[] = []
  const waited = Math.max(0, c.patience - c.patienceLeft)
  if (waited <= QUICK_WAIT) {
    reasons.push({ kind: 'quick', points: QUICK_POINTS, detail: waited })
  } else {
    const share = c.patience > 0 ? waited / c.patience : 1
    const points = -Math.round(WAIT_POINTS * share * (ctx.waitWeight ?? 1))
    reasons.push({ kind: 'wait', points, detail: waited })
  }
  const rounds = c.haggle?.round ?? 1
  if (rounds > 1)
    reasons.push({ kind: 'haggle', points: -HAGGLE_POINTS * (rounds - 1), detail: rounds })

  const { car } = ctx
  if (car) {
    const condition = conditionOf(car.cleanliness)
    if (condition === 'Clean') reasons.push({ kind: 'cleanCar', points: CLEAN_POINTS, detail: 0 })
    if (condition === 'Dirty') reasons.push({ kind: 'dirtyCar', points: DIRTY_POINTS, detail: 0 })
  }
  if (outcome === 'bought' && car && c.offer) {
    const { price, allowance } = c.offer
    const hope = hopePrice(c, car, ctx.day)
    const traded = c.trade && allowance !== undefined
    // With a trade, what they pay after it against what they hoped to.
    const paid = price - (traded ? allowance : 0)
    const hoped = hope - (traded ? c.trade!.hope : 0)
    const under = hope > 0 ? (hoped - paid) / hope : 0
    const points = clamp(Math.round(under * PRICE_SCALE), -PRICE_CAP, PRICE_CAP)
    if (points !== 0) {
      const kind = points > 0 ? 'goodPrice' : 'highPrice'
      reasons.push({ kind, points, detail: Math.round(Math.abs(under) * 100) })
    }
    if (traded && allowance >= c.trade!.hope) {
      reasons.push({ kind: 'fairTrade', points: FAIR_TRADE_POINTS, detail: 0 })
    } else if (traded && insultingAllowance(c, allowance)) {
      reasons.push({ kind: 'lowTrade', points: LOW_TRADE_POINTS, detail: 0 })
    }
    if (c.loyaltyCut > 0) {
      const points = Math.round(c.loyaltyCut * LOYALTY_SCORE)
      reasons.push({ kind: 'loyalty', points, detail: Math.round(c.loyaltyCut * 100) })
    }
  }
  const total = reasons.reduce((sum, r) => sum + r.points, BASE_SCORE[outcome] + (ctx.shift ?? 0))
  const top = reasons
    .filter((r) => r.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, REASONS_KEPT)
  return { score: clamp(Math.round(total), 0, 100), reasons: top }
}

/** A reason as the Clients tab shows it, e.g. "Waited 40 minutes". */
export function reasonText(r: ScoreReason): string {
  switch (r.kind) {
    case 'wait':
      return `Waited ${r.detail} minutes`
    case 'quick':
      return 'Served quickly'
    case 'haggle':
      return `${r.detail} rounds of haggling`
    case 'goodPrice':
      return 'Great price'
    case 'highPrice':
      return 'Paid more than hoped'
    case 'cleanCar':
      return 'Clean car'
    case 'dirtyCar':
      return 'Dirty car'
    case 'fairTrade':
      return 'Fair trade-in'
    case 'lowTrade':
      return 'Low trade-in offer'
    case 'loyalty':
      return 'Loyalty price'
  }
}

/**
 * How `c` left, if they go in the book: a buyer, or a shopper someone greeted
 * who left without buying. Null for sellers, service clients, anyone nobody
 * greeted, and anyone still on the lot.
 */
export function bookOutcome(c: Customer): VisitOutcome | null {
  if (c.phase !== 'leaving' || c.selling || c.service) return null
  const reason = c.leaveReason
  if (reason === 'bought') return 'bought'
  if (reason !== 'refused' && reason !== 'impatient' && reason !== 'closing') return null
  return c.sellerId !== null ? reason : null
}

/** A visit to record: who, how they left, the car they bought (or were after) and the score. */
export interface Visit {
  customer: Customer
  outcome: VisitOutcome
  car: InventoryCar | null
  score: VisitScore
}

/** The next free `client-<day>-<n>` id. */
export function nextClientId(book: readonly Client[], day: number): string {
  const prefix = `client-${day}-`
  let n = 0
  for (const c of book) {
    if (c.id.startsWith(prefix)) n = Math.max(n, Number(c.id.slice(prefix.length)) + 1)
  }
  return `${prefix}${n}`
}

/** `car` as it left the lot on `day`, sold for `price`. */
export function clientCarOf(car: InventoryCar, price: number, day: number): ClientCar {
  return {
    model: car.model,
    used: !!car.used,
    price,
    boughtDay: day,
    year: car.used?.year ?? modelYear(day),
    miles: car.used?.miles ?? 0,
    condition: car.used?.condition ?? 1,
  }
}

/** `old` with `score` blended in. */
export function blend(old: number, score: number): number {
  return Math.round(old * (1 - VISIT_WEIGHT) + score * VISIT_WEIGHT)
}

/**
 * The book after `visit` on `day`. A buyer becomes (or stays) a client with
 * the car they bought and a `dueDay` rolled on `rng`; a walk-out becomes a
 * prospect, or refreshes their entry. A returning visitor (`clientId`) updates
 * their entry instead of making a new one, and a client who walks out stays a
 * client.
 */
export function recordVisit(
  book: readonly Client[],
  visit: Visit,
  day: number,
  rng: Rng,
): Client[] {
  const { customer: c, outcome, car, score } = visit
  const old = c.clientId ? book.find((x) => x.id === c.clientId) : undefined
  const base: Client = old ?? {
    id: nextClientId(book, day),
    name: c.name,
    variant: c.variant,
    companion: c.companion,
    archetype: c.archetype,
    status: 'prospect',
    since: day,
    lastVisit: day,
    visits: 0,
    bought: 0,
    car: null,
    budget: c.budget,
    preferredModels: c.preferredModels,
    lastDeal: null,
    satisfaction: score.score,
    reasons: [],
    dueDay: null,
    expires: null,
    lastCall: null,
    callsThisCycle: 0,
    appointment: null,
    referredBy: null,
    referrals: 0,
    serviceDue: null,
  }
  const seen: Client = {
    ...base,
    lastVisit: day,
    visits: base.visits + 1,
    budget: c.budget,
    preferredModels: c.preferredModels,
    satisfaction: old ? blend(old.satisfaction, score.score) : score.score,
    reasons: score.reasons,
    callsThisCycle: 0,
    appointment: null,
  }
  let next: Client
  if (outcome === 'bought' && car && c.offer) {
    next = {
      ...seen,
      status: 'client',
      bought: seen.bought + 1,
      car: clientCarOf(car, c.offer.price, day),
      lastDeal: null,
      expires: null,
      dueDay: day + rng.int(TRADE_UP_DAYS.min, TRADE_UP_DAYS.max),
    }
  } else if (seen.status === 'client') {
    next = seen
  } else {
    next = {
      ...seen,
      status: 'prospect',
      expires: day + PROSPECT_DAYS,
      lastDeal: lastDealOf(c, car) ?? seen.lastDeal,
    }
  }
  return old ? book.map((x) => (x === old ? next : x)) : [...book, next]
}

/** Where `c`'s deal on `car` stood when they left, or null if they weren't after one. */
function lastDealOf(c: Customer, car: InventoryCar | null): LastDeal | null {
  if (!car) return null
  return { model: car.model, ask: c.haggle?.lastAsk ?? null, counter: c.haggle?.counter ?? null }
}

/** Due to trade up on `day`. */
export function isDue(client: Client, day: number): boolean {
  return client.status === 'client' && client.dueDay !== null && day >= client.dueDay
}

// Trade-ups and the loyalty discount (16d).

/** A due client's chance a day of coming in on their own to trade up, at satisfaction 70. */
export const RETURN_DAILY = 0.04
/** Most a loyalty-price buyer, or a happy one, adds to the odds they say yes (at satisfaction 100). */
export const LOYALTY_ACCEPT = 0.08
/** × the daily return chance, by the loyalty discount. */
export const LOYALTY_RETURN: Record<ClientPerks['loyaltyDiscount'], number> = {
  0: 1,
  0.02: 1.2,
  0.04: 1.4,
}

/**
 * × `RETURN_DAILY` for a client of `satisfaction`: 1 at 70, 0.5 at 50, up to
 * 1.75 at 100 and never under 0.1. About 60% of clients at 75 come back
 * within `LAPSE_DAYS` on their own, and about 20% at 40.
 */
export function returnFactor(satisfaction: number): number {
  return clamp((satisfaction - 30) / 40, 0.1, 1.75)
}

/**
 * A due client's chance today of coming in on their own, with the loyalty
 * `discount` on, × `scale` (`Tuning.clientReturn`).
 */
export function returnChance(
  c: Client,
  discount: ClientPerks['loyaltyDiscount'] = 0,
  scale = 1,
): number {
  return Math.min(1, RETURN_DAILY * returnFactor(c.satisfaction) * LOYALTY_RETURN[discount] * scale)
}

/**
 * What a returning visitor's history adds to the odds they say yes: 0 at
 * satisfaction 50, up to `LOYALTY_ACCEPT` at 100, and as much off at 0.
 */
export function loyaltyBonus(satisfaction: number): number {
  return ((clamp(satisfaction, 0, 100) - 50) / 50) * LOYALTY_ACCEPT
}

/** How many in the book are due to trade up on `day`. */
export function dueCount(book: readonly Client[], day: number): number {
  return book.filter((c) => isDue(c, day)).length
}

/** Statuses dropped first when the book is over `CLIENT_CAP`, in order. */
const DROP_ORDER: readonly ClientStatus[] = ['defected', 'lapsed', 'prospect', 'client']

/**
 * The book on the morning of `day`: expired prospects gone (unless booked
 * to come in), clients past
 * `dueDay + LAPSE_DAYS` lapsed (no car, not due), appointments from earlier
 * days dropped, and at most `CLIENT_CAP`
 * entries, dropping defected clients first, then lapsed ones, then the oldest
 * prospects (and, failing that, the clients seen longest ago). Returns the
 * same array when nothing changed.
 */
export function pruneBook(book: Client[], day: number): Client[] {
  let changed = false
  let kept: Client[] = []
  for (const c of book) {
    // A missed appointment (they didn't show, or nobody saw them) is dropped.
    const appointment = c.appointment && c.appointment.day < day ? null : c.appointment
    // A prospect booked to come in is kept for it.
    if (c.status === 'prospect' && c.expires !== null && day > c.expires && !appointment) {
      changed = true
      continue
    }
    if (c.status === 'client' && c.dueDay !== null && day > c.dueDay + LAPSE_DAYS) {
      changed = true
      kept.push({ ...c, status: 'lapsed', car: null, dueDay: null, appointment })
      continue
    }
    if (appointment !== c.appointment) {
      changed = true
      kept.push({ ...c, appointment })
      continue
    }
    kept.push(c)
  }
  if (kept.length > CLIENT_CAP) {
    changed = true
    const rank = (c: Client) => DROP_ORDER.indexOf(c.status)
    const drop = new Set(
      [...kept]
        .sort((a, b) => rank(a) - rank(b) || a.lastVisit - b.lastVisit)
        .slice(0, kept.length - CLIENT_CAP),
    )
    kept = kept.filter((c) => !drop.has(c))
  }
  return changed ? kept : book
}

/**
 * A client's car as it is on `day`, as a used car: a client year is
 * `CLIENT_YEAR_DAYS`, so a 30–60 day trade-up is 2–4 years older, with
 * `MILES_PER_YEAR` a year more on the clock and `CLIENT_WEAR` a year off its
 * condition.
 */
export function clientCarInfo(car: ClientCar, day: number): UsedInfo {
  const years = Math.max(0, day - car.boughtDay) / CLIENT_YEAR_DAYS
  const ageAtSale = Math.max(0, modelYear(car.boughtDay) - car.year)
  return {
    year: modelYear(day) - ageAtSale - Math.round(years),
    miles: Math.round((car.miles + years * MILES_PER_YEAR) / 100) * 100,
    condition: clamp(car.condition - years * CLIENT_WEAR, 0.05, 1),
    acquiredDay: day,
  }
}

/** Everyone's name in the book, which a new stranger's name steps past. */
export function bookNames(book: readonly Client[]): Set<string> {
  return new Set(book.map((c) => c.name))
}

/** A scored visit, for the day summary. */
export interface ScoredVisit {
  clientId: string
  outcome: VisitOutcome
  score: number
  reasons: ScoreReason[]
}

/** What the client book did today. */
export interface ClientStats {
  /** New clients: first purchases, prospects who came back to buy included. */
  added: number
  /** New prospects. */
  prospects: number
  /** Clients from the book who came back and bought. */
  returned: number
  calls: number
  booked: number
  referrals: number
  /** Paid to clients whose friends bought (16e). */
  referralFees: number
  /** Spent on a client appreciation day (16e). */
  appreciation: number
  /** Clients lost to Nazma's lot (16f). */
  defected: number
  /** Every visit scored today. */
  scores: ScoredVisit[]
}

export function emptyClientStats(): ClientStats {
  return {
    added: 0,
    prospects: 0,
    returned: 0,
    calls: 0,
    booked: 0,
    referrals: 0,
    referralFees: 0,
    appreciation: 0,
    defected: 0,
    scores: [],
  }
}

export interface BookContext {
  inventory: readonly InventoryCar[]
  day: number
  /** `Tuning.satisfactionShift`. */
  shift: number
  rng: Rng
}

/**
 * The book and the day's tally after the customers who started leaving
 * between `prev` and `next`. A sold car is still in `inventory` (until the
 * next morning), so how clean it was can be read. Returns the same book and
 * stats when nobody new went in it.
 */
export function recordClients(
  book: Client[],
  stats: ClientStats,
  prev: readonly Customer[],
  next: readonly Customer[],
  ctx: BookContext,
): { book: Client[]; stats: ClientStats } {
  let out = { book, stats }
  const wasLeaving = new Set(prev.filter((c) => c.phase === 'leaving').map((c) => c.id))
  for (const c of next) {
    if (wasLeaving.has(c.id)) continue
    const outcome = bookOutcome(c)
    if (!outcome) continue
    const carId = outcome === 'bought' ? c.offer?.carId : c.targetCarId
    const car = ctx.inventory.find((x) => x.id === carId) ?? null
    const before = c.clientId ? out.book.find((x) => x.id === c.clientId) : undefined
    // Kept waiting after booking a time minds more.
    const waitWeight = before?.appointment?.day === ctx.day ? APPOINTMENT_WAIT_WEIGHT : 1
    const score = visitScore(c, outcome, { car, day: ctx.day, shift: ctx.shift, waitWeight })
    const bookAfter = recordVisit(out.book, { customer: c, outcome, car, score }, ctx.day, ctx.rng)
    const entry = before
      ? bookAfter.find((x) => x.id === before.id)!
      : bookAfter[bookAfter.length - 1]
    const s = out.stats
    out = {
      book: bookAfter,
      stats: {
        ...s,
        added: s.added + (entry.status === 'client' && before?.status !== 'client' ? 1 : 0),
        prospects: s.prospects + (!before && entry.status === 'prospect' ? 1 : 0),
        returned: s.returned + (before && outcome === 'bought' ? 1 : 0),
        scores: [...s.scores, { clientId: entry.id, outcome, ...score }],
      },
    }
  }
  return out
}

/** What the player spends on loyalty, set in the Clients tab (read from 16c on). */
export interface ClientPerks {
  /** Off the sticker for a returning client: none, 2% or 4%. */
  loyaltyDiscount: 0 | 0.02 | 0.04
  /** Paid when a referred friend buys: $0, $100 or $250. */
  referralFee: 0 | 100 | 250
  /** The receptionist works the call list between customers. */
  receptionCalls: boolean
}

export const LOYALTY_DISCOUNTS: readonly ClientPerks['loyaltyDiscount'][] = [0, 0.02, 0.04]
export const REFERRAL_FEES: readonly ClientPerks['referralFee'][] = [0, 100, 250]

export function defaultPerks(): ClientPerks {
  return { loyaltyDiscount: 0, referralFee: 0, receptionCalls: true }
}

/** A client appreciation day booked (16e): its day and the month it was booked in. */
export interface Appreciation {
  day: number
  month: number
}

/** The visit scores of the month's new-car buyers, for the manufacturer's CSI (16f). */
export interface MonthCsi {
  total: number
  count: number
}

export function emptyMonthCsi(): MonthCsi {
  return { total: 0, count: 0 }
}

// The Clients tab and recognition (16b).

/** Satisfaction under this is unhappy: the Clients tab's filter, and 16c's check-in calls. */
export const UNHAPPY = 50
/** Satisfaction at or over this is happy. */
export const HAPPY = 70
/** The Due filter shows clients due now and those due within this many days. */
export const DUE_SOON = 7

/** A face for a satisfaction score. */
export function satisfactionFace(score: number): string {
  return score >= HAPPY ? '😊' : score >= UNHAPPY ? '😐' : '😞'
}

export type ClientFilter = 'all' | 'due' | 'prospects' | 'unhappy'

export const CLIENT_FILTERS: readonly [ClientFilter, string][] = [
  ['all', 'All'],
  ['due', 'Due'],
  ['prospects', 'Prospects'],
  ['unhappy', 'Unhappy'],
]

/** Still dealing with us: a client or a prospect, not lapsed or gone to the rival. */
export const isActive = (c: Client) => c.status === 'client' || c.status === 'prospect'

/**
 * The book through `filter` on `day`, in the order the Clients tab lists it:
 * everyone by their last visit, newest first; due clients by when they're due
 * (within `DUE_SOON`); prospects by when they expire; unhappy ones (active,
 * under `UNHAPPY`) unhappiest first.
 */
export function filterClients(
  book: readonly Client[],
  filter: ClientFilter,
  day: number,
): Client[] {
  switch (filter) {
    case 'all':
      return [...book].sort((a, b) => b.lastVisit - a.lastVisit)
    case 'due':
      return book
        .filter((c) => c.status === 'client' && c.dueDay !== null && c.dueDay - day <= DUE_SOON)
        .sort((a, b) => a.dueDay! - b.dueDay!)
    case 'prospects':
      return book.filter((c) => c.status === 'prospect').sort((a, b) => a.expires! - b.expires!)
    case 'unhappy':
      return book
        .filter((c) => isActive(c) && c.satisfaction < UNHAPPY)
        .sort((a, b) => a.satisfaction - b.satisfaction)
  }
}

/** The book at a glance: its size, clients and prospects, and their average satisfaction. */
export interface BookSummary {
  size: number
  clients: number
  prospects: number
  /** Over clients and prospects, or null with neither. */
  satisfaction: number | null
}

export function bookSummary(book: readonly Client[]): BookSummary {
  const active = book.filter(isActive)
  const total = active.reduce((sum, c) => sum + c.satisfaction, 0)
  return {
    size: book.length,
    clients: active.filter((c) => c.status === 'client').length,
    prospects: active.length - active.filter((c) => c.status === 'client').length,
    satisfaction: active.length > 0 ? Math.round(total / active.length) : null,
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Where they stand: "Due in 5 days", "Due now", "Prospect, 9 days left",
 * "Lapsed" or "At Nazma's" (`rival` is the rival lot's name).
 */
export function clientStatusText(c: Client, day: number, rival: string): string {
  switch (c.status) {
    case 'client':
      if (c.dueDay === null) return 'Client'
      return c.dueDay <= day ? 'Due now' : `Due in ${plural(c.dueDay - day, 'day')}`
    case 'prospect': {
      const left = (c.expires ?? day) - day
      return left <= 0 ? 'Prospect, last day' : `Prospect, ${plural(left, 'day')} left`
    }
    case 'lapsed':
      return 'Lapsed'
    case 'defected':
      return `At ${rival}`
  }
}

/** "Bought 41 days ago", "Bought today". */
function agoText(days: number, verb: string): string {
  if (days <= 0) return `${verb} today`
  if (days === 1) return `${verb} yesterday`
  return `${verb} ${days} days ago`
}

/**
 * Their car and how long they've had it, or what they were after:
 * "Summit Ridge, bought 12 days ago" or "After a Summit Ridge" (`names`
 * names a model).
 */
export function clientCarText(c: Client, day: number, names: (model: CarModel) => string): string {
  if (c.car) {
    const used = c.car.used ? ' (used)' : ''
    return `${names(c.car.model)}${used}, ${agoText(day - c.car.boughtDay, 'bought')}`
  }
  if (c.lastDeal) return `After a ${names(c.lastDeal.model)}`
  return c.bought > 0 ? `${plural(c.bought, 'car')} bought from us` : 'Just looking'
}

/**
 * The line under a returning visitor's name in the customer panel: "Bought a
 * Summit Cruiser 41 days ago · 😊 82" for a client, "Back about the Summit
 * Ridge: you asked $31,500" for a prospect (`money` formats a price).
 */
export function historyLine(
  c: Client,
  day: number,
  names: (model: CarModel) => string,
  money: (n: number) => string,
): string {
  const face = `${satisfactionFace(c.satisfaction)} ${c.satisfaction}`
  if (c.car) return `${agoText(day - c.car.boughtDay, `Bought a ${names(c.car.model)}`)} · ${face}`
  const deal = c.lastDeal
  if (c.status === 'prospect' && deal) {
    const about = `Back about the ${names(deal.model)}`
    if (deal.ask !== null) return `${about}: you asked ${money(deal.ask)}`
    return `${about} · ${face}`
  }
  return `${plural(c.visits, 'visit')} before · ${face}`
}

/** Reasons that take points off, and how the summary words them. */
const COST_WORDS: Partial<Record<ReasonKind, (n: number, detail: number) => string>> = {
  wait: (n, d) =>
    `Long waits: ${plural(n, 'customer')} waited ${n > 1 ? 'up to ' : ''}${d} minutes`,
  haggle: (n, d) =>
    `Hard haggles: ${plural(n, 'customer')} went ${n > 1 ? 'up to ' : ''}${d} rounds`,
  highPrice: (n) => `Prices: ${plural(n, 'buyer')} paid more than they hoped`,
  dirtyCar: (n) => `Dirty cars: ${plural(n, 'customer')} saw a dirty car`,
  lowTrade: (n) => `Trade-ins: ${plural(n, 'buyer')} got a low offer`,
}

/**
 * The reason that cost the day's scores the most points, worded for the
 * summary ("Long waits: 3 customers waited up to 42 minutes"), or null when
 * nothing cost any.
 */
export function costliestReason(scores: readonly ScoredVisit[]): string | null {
  const tally = new Map<ReasonKind, { points: number; n: number; detail: number }>()
  for (const s of scores) {
    for (const r of s.reasons) {
      if (r.points >= 0 || !COST_WORDS[r.kind]) continue
      const t = tally.get(r.kind) ?? { points: 0, n: 0, detail: 0 }
      tally.set(r.kind, {
        points: t.points + r.points,
        n: t.n + 1,
        detail: Math.max(t.detail, r.detail),
      })
    }
  }
  let worst: [ReasonKind, { points: number; n: number; detail: number }] | null = null
  for (const entry of tally) if (!worst || entry[1].points < worst[1].points) worst = entry
  if (!worst) return null
  const [kind, t] = worst
  return COST_WORDS[kind]!(t.n, t.detail)
}

/** The average score of the day's buyers, or null with none. */
export function buyerScore(scores: readonly ScoredVisit[]): number | null {
  const bought = scores.filter((s) => s.outcome === 'bought')
  if (bought.length === 0) return null
  return Math.round(bought.reduce((sum, s) => sum + s.score, 0) / bought.length)
}

/**
 * Someone from the book to bring back (the dev key Shift+L): a client or a
 * prospect who isn't on the lot today, picked on `rng` from those due to
 * trade up on `day` if any are, or null.
 */
export function pickReturning(
  book: readonly Client[],
  onLot: ReadonlySet<string>,
  rng: Rng,
  day = 0,
): Client | null {
  const pool = book.filter((c) => isActive(c) && !onLot.has(c.id))
  const due = pool.filter((c) => isDue(c, day))
  return due.length > 0 ? rng.pick(due) : pool.length > 0 ? rng.pick(pool) : null
}
