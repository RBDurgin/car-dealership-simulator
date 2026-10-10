import { calendarOf, DAYS_PER_MONTH } from './calendar'
import { CAR_MODELS } from './customers'
import { carName } from './interactables'
import type { CarModel } from './layout'
import type { Career } from './progression'
import { createRng } from './rng'
import { SERVICE_WEEKDAY } from './service'

/**
 * Manufacturer recalls (Phase 15e): now and then the factory recalls one
 * model, and the people the dealership sold it to bring it in for the work,
 * which the manufacturer pays for. Derived from the day number like the sale
 * weekends, so nothing is saved; a recall only runs while there's a garage.
 */
export interface Recall {
  model: CarModel
  /** What's wrong: "a brake sensor". */
  issue: string
}

/** The odds a month has a recall. */
export const RECALL_CHANCE = 0.6
/** A recall runs from this day of the month… */
export const RECALL_FIRST = 8
/** …to this one. */
export const RECALL_LAST = DAYS_PER_MONTH
/** The share of a recalled model's buyers who come in over the window. */
export const RECALL_RESPONSE = 0.25

export const RECALL_ISSUES: readonly string[] = [
  'a brake sensor',
  'an airbag inflator',
  'a fuel pump',
  'a seat belt latch',
  'a wiring harness',
  'a steering column bolt',
]

const RECALL_SEED = 24_000

/** The month `day` falls in, counted from the first: 0, 1, 2… */
function monthIndex(day: number): number {
  return Math.floor((Math.max(1, day) - 1) / DAYS_PER_MONTH)
}

/** The recall the manufacturer announces in `day`'s month, or null for a month without one. */
export function recallOfMonth(day: number): Recall | null {
  const rng = createRng(RECALL_SEED + monthIndex(day))
  if (rng.next() >= RECALL_CHANCE) return null
  return { model: rng.pick(CAR_MODELS), issue: rng.pick(RECALL_ISSUES) }
}

/** Whether `day` is between the 8th and the 28th of its month. */
export function inRecallWindow(day: number): boolean {
  const { dayOfMonth } = calendarOf(day)
  return dayOfMonth >= RECALL_FIRST && dayOfMonth <= RECALL_LAST
}

/** The recall running on `day`, with `bays` up: none without a garage, or outside the window. */
export function recallOn(day: number, bays: number): Recall | null {
  if (bays <= 0 || !inRecallWindow(day)) return null
  return recallOfMonth(day)
}

/**
 * Whether a recall starts on `day`: it's on today and wasn't yesterday, on the
 * 8th or the morning the garage first opens during one.
 */
export function recallStarts(day: number, bays: number, baysYesterday: number): boolean {
  return !!recallOn(day, bays) && !recallOn(day - 1, baysYesterday)
}

/** The weekday weights of the window's days added up, so its visits share out to `RECALL_RESPONSE`. */
const WINDOW_WEIGHT = (() => {
  let sum = 0
  for (let d = RECALL_FIRST; d <= RECALL_LAST; d++) sum += SERVICE_WEEKDAY[(d - 1) % 7]
  return sum
})()

/** How many of the `sold` buyers of a recalled model are expected in over the window. */
export function recallExpected(sold: number): number {
  return Math.round(sold * RECALL_RESPONSE)
}

/**
 * The recall visits expected on `day`, on top of the usual service visits:
 * the recalled model's buyers × `RECALL_RESPONSE`, shared out over the window
 * by the weekday (none on Sundays, when the shop is shut).
 */
export function recallDemand(
  day: number,
  career: Pick<Career, 'soldByModel'>,
  bays: number,
): number {
  const recall = recallOn(day, bays)
  if (!recall) return 0
  const sold = career.soldByModel[recall.model] ?? 0
  return (sold * RECALL_RESPONSE * SERVICE_WEEKDAY[calendarOf(day).weekday]) / WINDOW_WEIGHT
}

/** "28th". */
export function dayOrdinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${(!teen && ['th', 'st', 'nd', 'rd'][n % 10]) || 'th'}`
}

/** "Recall: the Summit Ridge needs a brake sensor replaced. …", the morning one starts. */
export function recallNotice(recall: Recall, sold: number): string {
  const name = carName(recall.model)
  const due =
    sold === 0
      ? `You haven't sold any, so expect few in.`
      : `You've sold ${sold}; expect about ${Math.max(1, recallExpected(sold))} of them in by the ${dayOrdinal(RECALL_LAST)}.`
  return `Recall: the ${name} needs ${recall.issue} replaced. ${due} The manufacturer pays for the work.`
}

/** What a recall is about, for the Calendar and Service tabs: "Summit Ridge for a brake sensor". */
export function recallLine(recall: Recall): string {
  return `${carName(recall.model)} for ${recall.issue}`
}
