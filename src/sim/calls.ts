import {
  isDue,
  PROSPECT_DAYS,
  returnChance,
  UNHAPPY,
  type AppointmentReason,
  type Client,
  type ClientPerks,
} from './clients'
import { formatTime, OPEN_MINUTE } from './clock'
import type { Rng } from './rng'
import { LAST_ARRIVAL_MINUTE } from './spawner'
import { MIN_SKILL } from './staff'

/**
 * Follow-up calls from the office desk phone (16c). The player, or a
 * receptionist with nobody waiting, calls one person from the book at a time:
 * a thank-you to a recent buyer, a prospect who walked out (a be-back), a
 * client due to trade up, an unhappy client, or one who went to Nazma's (a
 * win-back). A call can book an appointment for the next day, which
 * `planClientVisits` turns into a visit, and a win-back can make someone a
 * prospect again.
 */

export type CallKind = 'thanks' | 'beBack' | 'tradeUp' | 'checkIn' | 'winBack'

export type CallOutcome = 'booked' | 'thanked' | 'wonBack' | 'notNow' | 'noAnswer' | 'annoyed'

/** Game minutes a call takes the player (about 10 seconds at normal speed). */
export const CALL_MINUTES = 15
/** A buyer from this many days back (or today) gets a thank-you call. */
export const THANKS_DAYS = 3
/** Days before someone who picked up is called again. */
export const CALL_GAP_DAYS = 3
/** Calls in one cycle (since their last visit) past which a call is pestering. */
export const MAX_CALLS = 2
/** Share of calls nobody picks up. */
export const NO_ANSWER = 0.3
/** Satisfaction a thank-you call adds. */
export const THANKS_BOOST = 5
/** Satisfaction a pestering call costs. */
export const ANNOY_POINTS = 8
/** The odds an answered call books, by kind, from a caller of average skill at satisfaction 50. */
export const BOOK_ODDS: Record<CallKind, number> = {
  thanks: 0,
  beBack: 0.45,
  tradeUp: 0.6,
  checkIn: 0.3,
  winBack: 0,
}
/** The odds an answered win-back call makes them a prospect again, at satisfaction 50. */
export const WIN_BACK_CHANCE = 0.3
/** Satisfaction a win-back adds: someone noticed they'd gone. */
export const WIN_BACK_POINTS = 5
/** Most an answered call books. */
export const MAX_BOOK = 0.9
/** × the book odds per skill level from 3. */
export const SKILL_STEP = 0.1
/** Share of booked clients who turn up, before `Tuning.clientReturn`. */
export const SHOW_CHANCE = 0.85
/** Appointments are on the half hour, from an hour after opening to an hour before the last arrival. */
export const APPOINTMENT_WINDOW = { from: OPEN_MINUTE + 60, to: LAST_ARRIVAL_MINUTE - 60 }

const CALL_REASON: Record<CallKind, AppointmentReason | null> = {
  thanks: null,
  beBack: 'beBack',
  tradeUp: 'tradeUp',
  checkIn: 'checkIn',
  winBack: null,
}

/**
 * Why `c` would be called on `day`, or null: a prospect is a be-back, a
 * client due to trade up a trade-up, an unhappy client a check-in, and a
 * buyer from the last `THANKS_DAYS` who hasn't been called since a thank-you,
 * and someone who went to Nazma's a win-back.
 */
export function callKind(c: Client, day: number): CallKind | null {
  if (c.status === 'prospect') return 'beBack'
  if (c.status === 'defected') return 'winBack'
  if (c.status !== 'client') return null
  if (isDue(c, day)) return 'tradeUp'
  if (c.satisfaction < UNHAPPY) return 'checkIn'
  if (c.car && day - c.car.boughtDay <= THANKS_DAYS && c.callsThisCycle === 0) return 'thanks'
  return null
}

export interface CallEntry {
  client: Client
  kind: CallKind
}

/** Called and picked up within the last `CALL_GAP_DAYS`. */
function calledLately(c: Client, day: number): boolean {
  return c.lastCall !== null && day - c.lastCall < CALL_GAP_DAYS
}

/** Kinds in the order they're worth calling: a due client is the likeliest sale, then a be-back. */
const KIND_ORDER: readonly CallKind[] = ['tradeUp', 'beBack', 'checkIn', 'thanks', 'winBack']

/**
 * Who to call on `day`, likeliest to pay first: clients due to trade up and
 * be-backs (happiest first, then soonest to expire), unhappy clients (happiest first) and thank-yous. Leaves
 * out anyone called lately, with an appointment, or in `skip` (on the lot,
 * already tried today or being called).
 */
export function callList(
  book: readonly Client[],
  day: number,
  skip: ReadonlySet<string> = new Set(),
): CallEntry[] {
  const out: CallEntry[] = []
  for (const client of book) {
    if (skip.has(client.id) || client.appointment || calledLately(client, day)) continue
    const kind = callKind(client, day)
    if (kind) out.push({ client, kind })
  }
  return out.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      b.client.satisfaction - a.client.satisfaction ||
      (a.client.expires ?? Infinity) - (b.client.expires ?? Infinity),
  )
}

/** The skill a receptionist of `skill` calls at: below a salesperson's, and the player's. */
export function callSkill(skill: number): number {
  return MIN_SKILL + (skill - MIN_SKILL) * 0.5
}

/** × the call's length for a receptionist of `skill`: 1.5 at skill 1 down to 1 at skill 5. */
export function receptionCallTime(skill: number): number {
  return 1.5 - ((skill - MIN_SKILL) / 4) * 0.5
}

/**
 * The odds an answered `kind` call to `c` books, from a caller of `skill`:
 * the happier they are the likelier, × `scale` (`Tuning.clientReturn`).
 */
export function bookChance(c: Client, kind: CallKind, skill: number, scale = 1): number {
  const mood = 0.6 + (c.satisfaction / 100) * 0.8
  const craft = 1 + (skill - 3) * SKILL_STEP
  return Math.min(MAX_BOOK, Math.max(0, BOOK_ODDS[kind] * mood * craft * scale))
}

export interface CallResult {
  outcome: CallOutcome
  /** Added to their satisfaction. */
  change: number
}

/** The odds an answered win-back call to `c` wins them back, from a caller of `skill`. */
export function winBackChance(c: Client, skill: number, scale = 1): number {
  const mood = 0.6 + (c.satisfaction / 100) * 0.8
  const craft = 1 + (skill - 3) * SKILL_STEP
  return Math.min(MAX_BOOK, Math.max(0, WIN_BACK_CHANCE * mood * craft * scale))
}

/**
 * How a `kind` call to `c` goes, from a caller of `skill`: nobody picks up
 * (`NO_ANSWER`), a call past `MAX_CALLS` this cycle annoys them, a thank-you
 * pleases them, a win-back wins them back (`winBackChance`) or not, and
 * otherwise they book (`bookChance`) or say not now.
 */
export function callOutcome(
  c: Client,
  kind: CallKind,
  skill: number,
  rng: Rng,
  opts: { scale?: number } = {},
): CallResult {
  if (rng.next() < NO_ANSWER) return { outcome: 'noAnswer', change: 0 }
  if (c.callsThisCycle >= MAX_CALLS) return { outcome: 'annoyed', change: -ANNOY_POINTS }
  if (kind === 'thanks') return { outcome: 'thanked', change: THANKS_BOOST }
  if (kind === 'winBack') {
    const won = rng.next() < winBackChance(c, skill, opts.scale)
    return won ? { outcome: 'wonBack', change: WIN_BACK_POINTS } : { outcome: 'notNow', change: 0 }
  }
  if (rng.next() < bookChance(c, kind, skill, opts.scale)) return { outcome: 'booked', change: 0 }
  return { outcome: 'notNow', change: 0 }
}

/** A minute on the half hour within `APPOINTMENT_WINDOW`. */
export function appointmentMinute(rng: Rng): number {
  const { from, to } = APPOINTMENT_WINDOW
  return from + rng.int(0, Math.floor((to - from) / 30)) * 30
}

/**
 * The book after a `kind` call to client `id` on `day` went `result`. Nobody
 * answering changes nothing. Otherwise the call is logged (`lastCall`,
 * `callsThisCycle`), satisfaction moves, a booking sets an appointment
 * for the next day at `minute`, and someone won back is a prospect again for
 * `PROSPECT_DAYS`.
 */
export function applyCall(
  book: Client[],
  id: string,
  kind: CallKind,
  result: CallResult,
  day: number,
  minute: number,
): Client[] {
  if (result.outcome === 'noAnswer') return book
  return book.map((c) => {
    if (c.id !== id) return c
    const reason = CALL_REASON[kind]
    return {
      ...c,
      lastCall: day,
      callsThisCycle: c.callsThisCycle + 1,
      satisfaction: Math.min(100, Math.max(0, c.satisfaction + result.change)),
      ...(result.outcome === 'thanked' && { thanked: true }),
      ...(result.outcome === 'wonBack' && {
        status: 'prospect' as const,
        expires: day + PROSPECT_DAYS,
        callsThisCycle: 0,
      }),
      ...(result.outcome === 'booked' &&
        reason && { appointment: { day: day + 1, minute, reason } }),
    }
  })
}

/**
 * Why someone from the book comes in: an appointment, a due client trading
 * up on their own, a friend a client sent (`clientId` is the referrer; see
 * `sim/referrals.ts`) or a guest on client appreciation day.
 */
export type VisitReason = 'appointment' | 'return' | 'friend' | 'appreciation'

/** Someone due in today from the book, or sent by someone in it. */
export interface ClientVisit {
  clientId: string
  minute: number
  reason: VisitReason
}

/** A due client coming in on their own turns up between these minutes, on the five. */
export const RETURN_WINDOW = { from: OPEN_MINUTE + 30, to: LAST_ARRIVAL_MINUTE - 30 }

/**
 * Today's client visits, by minute: everyone with an appointment on `day` who
 * turns up (`SHOW_CHANCE` × `scale`), and the clients due to trade up who come
 * in on their own (`returnChance` with the loyalty `discount`, × `scale`) at
 * a minute in `RETURN_WINDOW`. Rolled on `rng` in the book's order; anyone
 * with an appointment on another day waits for it. An empty book rolls
 * nothing.
 */
export function planClientVisits(
  book: readonly Client[],
  day: number,
  rng: Rng,
  scale = 1,
  discount: ClientPerks['loyaltyDiscount'] = 0,
): ClientVisit[] {
  const show = Math.min(1, SHOW_CHANCE * scale)
  const out: ClientVisit[] = []
  for (const c of book) {
    if (c.appointment) {
      if (c.appointment.day === day && rng.next() < show) {
        out.push({ clientId: c.id, minute: c.appointment.minute, reason: 'appointment' })
      }
      continue
    }
    if (!isDue(c, day) || rng.next() >= returnChance(c, discount, scale)) continue
    const { from, to } = RETURN_WINDOW
    out.push({ clientId: c.id, minute: rng.int(from / 5, to / 5) * 5, reason: 'return' })
  }
  return out.sort((a, b) => a.minute - b.minute)
}

/** Visits due by `minute`, and those still to come. */
export function takeDueClients(
  visits: readonly ClientVisit[],
  minute: number,
): { due: ClientVisit[]; rest: ClientVisit[] } {
  const due = visits.filter((v) => v.minute <= minute)
  return due.length === 0
    ? { due, rest: visits as ClientVisit[] }
    : { due, rest: visits.filter((v) => v.minute > minute) }
}

/** Everyone in the book with an appointment on `day`, by time. */
export function appointmentsOn(book: readonly Client[], day: number): Client[] {
  return book
    .filter((c) => c.appointment?.day === day)
    .sort((a, b) => a.appointment!.minute - b.appointment!.minute)
}

/**
 * The morning's word on the day's appointments: "2 appointments today: Alex
 * B. at 10:30 AM, Sam K. at 2:00 PM." Null with none.
 */
export function appointmentsNotice(book: readonly Client[], day: number): string | null {
  const due = appointmentsOn(book, day)
  if (due.length === 0) return null
  const who = due.map((c) => `${c.name} at ${formatTime(c.appointment!.minute)}`).join(', ')
  return `${due.length === 1 ? '1 appointment' : `${due.length} appointments`} today: ${who}.`
}

/** What the player hears when a call ends. */
export function callLine(name: string, kind: CallKind, result: CallResult, minute: number): string {
  switch (result.outcome) {
    case 'noAnswer':
      return `${name} didn't pick up. Try again tomorrow.`
    case 'annoyed':
      return `${name}: "You've called me enough, thanks."`
    case 'thanked':
      return `${name} was glad you called to thank them.`
    case 'notNow':
      if (kind === 'checkIn') return `${name}: "Thanks for checking. I'm fine for now."`
      if (kind === 'tradeUp') return `${name}: "I'm happy with my car for now, thanks."`
      if (kind === 'winBack') return `${name}: "I'm doing business elsewhere now, thanks."`
      return `${name}: "Not right now, thanks."`
    case 'booked':
      return `${name} will come in tomorrow at ${formatTime(minute)}.`
    case 'wonBack':
      return `${name}: "Fair enough, I'll give you another look." They're a prospect again.`
  }
}
