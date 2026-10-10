import { DAYS_PER_MONTH } from './calendar'
import type { ClientVisit } from './calls'
import { DUE_SOON, returnFactor, UNHAPPY, type Appreciation, type Client } from './clients'
import { formatTime } from './clock'
import type { Rect } from './layout'
import type { Rng } from './rng'

/**
 * Client appreciation day (16e): booked in the Calendar tab for a day
 * `BOOK_AHEAD` days out, at most once a month, and paid for when booked.
 * Every client in good standing is invited; each comes with `attendChance`,
 * and some bring a friend. Guests gain `APPRECIATION_BOOST` satisfaction
 * whether or not they buy, and one nobody greets eats, looks around and
 * leaves as `visited` (not a walk-out). A cookout goes up on the forecourt
 * (`COOKOUT`), and a few more passers-by wander in.
 */

/** What a day costs, before `COST_PER_GUEST` for each client invited. */
export const APPRECIATION_COST = 1200
export const COST_PER_GUEST = 20
/** How far ahead a day can be booked. */
export const BOOK_AHEAD = { min: 3, max: 14 }
/** A guest's chance of coming at satisfaction 70, before the weather and the level. */
export const ATTEND_CHANCE = 0.2
/** Satisfaction every guest gains. */
export const APPRECIATION_BOOST = 6
/** Chance a guest brings a friend along. */
export const GUEST_FRIEND_CHANCE = 0.25
/** × the passers-by who walk in that day. */
export const APPRECIATION_WALK_IN = 1.25
/** The notice comes this many days ahead, and again on the morning. */
export const NOTICE_AHEAD = 3
/** Guests turn up between these minutes, on the five: lunch at the grill. */
export const GUEST_WINDOW = { from: 11 * 60, to: 15 * 60 }
/**
 * The cookout's ground on the west forecourt, between the middle row and the
 * west front row: a grill, two tables and a banner. Blocked for the day.
 */
export const COOKOUT: Rect = { tx: 9, tz: 16, w: 5, h: 2 }

/** The month `day` falls in, counted from the first (0). */
export function monthIndex(day: number): number {
  return Math.floor(Math.max(0, day - 1) / DAYS_PER_MONTH)
}

/** Invited: a client (not a prospect, lapsed or gone) who isn't unhappy. */
export function isInvited(c: Client): boolean {
  return c.status === 'client' && c.satisfaction >= UNHAPPY
}

export function invitedCount(book: readonly Client[]): number {
  return book.filter(isInvited).length
}

/** What a day costs with `book` as it is. */
export function appreciationCost(book: readonly Client[]): number {
  return APPRECIATION_COST + COST_PER_GUEST * invitedCount(book)
}

/** The day `appreciation` is on, if it's `day`. */
export function isAppreciationDay(appreciation: Appreciation | null, day: number): boolean {
  return appreciation?.day === day
}

/** One booked that's still to come (or on today). */
export function upcoming(appreciation: Appreciation | null, today: number): boolean {
  return !!appreciation && appreciation.day >= today
}

/**
 * The days a client appreciation day can be booked for on `today`: `BOOK_AHEAD`
 * days out, none while one is still to come, and not in the month of the last
 * one.
 */
export function bookableDays(appreciation: Appreciation | null, today: number): number[] {
  if (upcoming(appreciation, today)) return []
  const out: number[] = []
  for (let d = today + BOOK_AHEAD.min; d <= today + BOOK_AHEAD.max; d++) {
    if (appreciation && monthIndex(d) === appreciation.month) continue
    out.push(d)
  }
  return out
}

export interface AppreciationBook {
  appreciation: Appreciation | null
  book: readonly Client[]
  cash: number
  today: number
}

/** Why a day can't be booked for `day`, or null if it can. */
export function appreciationBlocker(s: AppreciationBook, day: number): string | null {
  if (upcoming(s.appreciation, s.today)) return 'A client appreciation day is already booked.'
  if (!bookableDays(s.appreciation, s.today).includes(day)) {
    return `Book it ${BOOK_AHEAD.min}–${BOOK_AHEAD.max} days ahead, once a month.`
  }
  if (invitedCount(s.book) === 0) return 'No clients to invite yet.'
  if (s.cash < appreciationCost(s.book)) return 'Not enough cash for that.'
  return null
}

/**
 * A guest's chance of coming: `ATTEND_CHANCE` × their `returnFactor`, ×
 * `scale` (`Tuning.clientReturn`) and the day's weather traffic.
 */
export function attendChance(c: Client, scale = 1, weather = 1): number {
  return Math.min(1, ATTEND_CHANCE * returnFactor(c.satisfaction) * scale * weather)
}

/** Due to trade up, or due within `DUE_SOON`: a guest who comes ready to. */
export function nearlyDue(c: Client, day: number): boolean {
  return c.status === 'client' && c.dueDay !== null && c.dueDay - day <= DUE_SOON
}

export interface GuestOpts {
  /** `Tuning.clientReturn`. */
  scale: number
  /** The day's weather traffic (`WEATHER_EFFECTS[…].traffic`). */
  weather: number
  /** Clients already coming in today (appointments, returns). */
  skip: ReadonlySet<string>
}

/**
 * The day's guests, rolled on `rng` in the book's order: each invited client
 * not already coming comes with `attendChance`, at a minute in
 * `GUEST_WINDOW`, and brings a friend `GUEST_FRIEND_CHANCE` of the time (a
 * `'friend'` visit by them, a little later).
 */
export function planGuests(book: readonly Client[], rng: Rng, opts: GuestOpts): ClientVisit[] {
  const out: ClientVisit[] = []
  const { from, to } = GUEST_WINDOW
  for (const c of book) {
    if (!isInvited(c) || opts.skip.has(c.id)) continue
    if (rng.next() >= attendChance(c, opts.scale, opts.weather)) continue
    const minute = rng.int(from / 5, to / 5) * 5
    out.push({ clientId: c.id, minute, reason: 'appreciation' })
    if (rng.next() < GUEST_FRIEND_CHANCE) {
      out.push({ clientId: c.id, minute: minute + 10, reason: 'friend' })
    }
  }
  return out
}

/** The book with every guest `APPRECIATION_BOOST` happier. */
export function welcomeGuest(book: Client[], id: string): Client[] {
  return book.map((c) =>
    c.id === id ? { ...c, satisfaction: Math.min(100, c.satisfaction + APPRECIATION_BOOST) } : c,
  )
}

/**
 * The morning's word: `NOTICE_AHEAD` days before, and on the day. Null
 * otherwise.
 */
export function appreciationNotice(appreciation: Appreciation | null, day: number): string | null {
  if (!appreciation) return null
  const ahead = appreciation.day - day
  if (ahead === 0) {
    return `Client appreciation day! The grill's on from ${formatTime(GUEST_WINDOW.from)}: greet your clients, some are ready to trade up.`
  }
  if (ahead === NOTICE_AHEAD) return `Client appreciation day is in ${NOTICE_AHEAD} days.`
  return null
}
