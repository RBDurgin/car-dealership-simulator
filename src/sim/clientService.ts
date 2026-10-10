import { calendarOf } from './calendar'
import { CLIENT_WEAR, CLIENT_YEAR_DAYS, DUE_SOON, SERVICE_INTERVAL, type Client } from './clients'
import type { CarModel } from './layout'
import { RECALL_FIRST } from './recalls'
import type { Rng } from './rng'
import { LAST_SERVICE_MINUTE, pickKind, type BookServiceVisit } from './service'
import { OPEN_MINUTE } from './clock'

/**
 * Service from the client book (16f): every car we sold comes back for
 * service every `SERVICE_INTERVAL` days, named and recognised, so the garage
 * fills as the book grows. Strangers from town (`TOWN_SERVICE`) still come too,
 * and aren't kept. A visit moves the client's satisfaction (`afterService`)
 * and a serviced car keeps more of its value (`SERVICE_WEAR_SAVED`). A client
 * waiting on their car who's due to trade up soon can be pitched a trade-up.
 */

/** A due client's daily chance of bringing their car in, at satisfaction 70. */
export const SERVICE_DAILY = 0.12
/** Satisfaction a job done on time adds, and one done late costs. */
export const SERVICE_BOOST = 4
export const LATE_SERVICE_POINTS = -6
/** Satisfaction a job that didn't hold costs (the car came back). */
export const COMEBACK_POINTS = -8
/** Satisfaction lost when we couldn't take the car, or they turned down the quote. */
export const TURNED_AWAY_POINTS = -5
/** Share of the wear since the last service a service undoes. */
export const SERVICE_WEAR_SAVED = 0.5

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** × `SERVICE_DAILY` for a client of `satisfaction`: 1 at 70, 0.6 at 30, 1.3 at 100. */
export function serviceChance(satisfaction: number): number {
  return SERVICE_DAILY * clamp((satisfaction + 30) / 100, 0.3, 1.3)
}

/** Their car (one we sold them) is due for service on `day`. */
export function isServiceDue(c: Client, day: number): boolean {
  return c.status === 'client' && !!c.car && c.serviceDue !== null && day >= c.serviceDue
}

export interface BookServiceOpts {
  /** × every chance: the weekday, the shop rate and the level (`demandScale`). */
  scale: number
  /** `Tuning.clientReturn`. */
  clientReturn: number
  /** Most visits the bays can still take today. */
  max: number
  /** Clients already coming in today (appointments, guests). */
  skip?: ReadonlySet<string>
}

/**
 * The clients from the book who bring their car in on `day`: each one due
 * rolls `serviceChance` × `scale` × `clientReturn` on `rng`, at a minute
 * bunched toward the morning like the town's visits, at most `max` of them.
 * Rolls nothing on a day the shop is shut or full.
 */
export function planBookService(
  book: readonly Client[],
  day: number,
  rng: Rng,
  opts: BookServiceOpts,
): BookServiceVisit[] {
  if (opts.scale <= 0 || opts.max < 1) return []
  const span = LAST_SERVICE_MINUTE - OPEN_MINUTE
  const out: BookServiceVisit[] = []
  for (const c of book) {
    if (out.length >= Math.floor(opts.max)) break
    if (!isServiceDue(c, day) || opts.skip?.has(c.id)) continue
    if (rng.next() >= serviceChance(c.satisfaction) * opts.scale * opts.clientReturn) continue
    const minute = Math.round(OPEN_MINUTE + Math.min(rng.next(), rng.next()) * span)
    out.push({ clientId: c.id, minute, kind: pickKind(rng) })
  }
  return out
}

/** Condition a service gives back to a client's car: half a service interval's wear. */
export function serviceWearBack(): number {
  return SERVICE_WEAR_SAVED * CLIENT_WEAR * (SERVICE_INTERVAL / CLIENT_YEAR_DAYS)
}

export type ServiceOutcome = 'serviced' | 'late' | 'comeback' | 'turnedAway'

const SERVICE_POINTS: Record<ServiceOutcome, number> = {
  serviced: SERVICE_BOOST,
  late: LATE_SERVICE_POINTS,
  comeback: COMEBACK_POINTS,
  turnedAway: TURNED_AWAY_POINTS,
}

/**
 * The book after client `id`'s service visit on `day` went `outcome`. A
 * finished job (on time or late) puts the next service `SERVICE_INTERVAL`
 * days off and gives the car back some of its wear; so does being turned away
 * (they went elsewhere). A comeback only costs satisfaction.
 */
export function afterService(
  book: Client[],
  id: string,
  outcome: ServiceOutcome,
  day: number,
): Client[] {
  if (!book.some((c) => c.id === id)) return book
  return book.map((c) => {
    if (c.id !== id) return c
    const satisfaction = clamp(c.satisfaction + SERVICE_POINTS[outcome], 0, 100)
    if (outcome === 'comeback') return { ...c, satisfaction }
    const serviced = outcome !== 'turnedAway'
    const car =
      c.car && serviced
        ? { ...c.car, condition: Math.min(1, c.car.condition + serviceWearBack()) }
        : c.car
    return { ...c, satisfaction, car, serviceDue: c.car ? day + SERVICE_INTERVAL : null }
  })
}

/** Clients who drive a `model` we sold them (for a recall notice). */
export function recallOwners(book: readonly Client[], model: CarModel): number {
  return book.filter((c) => c.status === 'client' && c.car?.model === model).length
}

/**
 * A client to come in for the recall on `model` on `day`, picked on `rng`
 * from those who drive one, aren't in `skip`, and haven't had a service since
 * the recall began this month (it was done then). Null with nobody left, and
 * the visit is a stranger's.
 */
export function recallClient(
  book: readonly Client[],
  model: CarModel,
  day: number,
  skip: ReadonlySet<string>,
  rng: Rng,
): Client | null {
  const start = day - (calendarOf(day).dayOfMonth - RECALL_FIRST)
  const pool = book.filter(
    (c) =>
      c.status === 'client' &&
      c.car?.model === model &&
      !skip.has(c.id) &&
      (c.serviceDue === null || c.serviceDue - SERVICE_INTERVAL < start),
  )
  return pool.length > 0 ? rng.pick(pool) : null
}

// Pitching a trade-up to a service client.

/** The odds a pitch books a trade-up, at satisfaction 50. */
export const PITCH_ODDS = 0.5
/** Most a pitch books. */
export const MAX_PITCH = 0.85

/** A client in for service who's due to trade up within `DUE_SOON` days, with nothing booked. */
export function canPitch(c: Client, day: number): boolean {
  return c.status === 'client' && c.dueDay !== null && c.dueDay - day <= DUE_SOON && !c.appointment
}

/** The odds pitching a trade-up to `c` books them: the happier, the likelier. */
export function pitchChance(c: Client): number {
  return Math.min(MAX_PITCH, PITCH_ODDS * (0.6 + (c.satisfaction / 100) * 0.8))
}

/**
 * The book after client `id` took a pitch on `day`: an appointment the next
 * day at `minute` to trade up, and they're due by then.
 */
export function pitchBooked(book: Client[], id: string, day: number, minute: number): Client[] {
  return book.map((c) =>
    c.id === id
      ? {
          ...c,
          dueDay: Math.min(c.dueDay ?? day + 1, day + 1),
          appointment: { day: day + 1, minute, reason: 'tradeUp' },
        }
      : c,
  )
}
