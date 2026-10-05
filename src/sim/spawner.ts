import { OPEN_MINUTE } from './clock'
import type { Rng } from './rng'

/** Nobody new shows up after this, so late visitors have time to be helped. */
export const LAST_ARRIVAL_MINUTE = 17 * 60
/**
 * Planned arrivals. Passers-by who wander in (see `sim/pedestrians.ts`) add
 * about three more a day on top.
 */
export const VISITORS_PER_DAY = { min: 4, max: 7 }

/** A day's arrivals and how many of them have already been spawned. */
export interface ArrivalSchedule {
  /** Game minutes, ascending. */
  minutes: number[]
  spawned: number
}

/**
 * Plans a day's arrivals between opening and `LAST_ARRIVAL_MINUTE`. Each time
 * is the mean of two uniform draws, so arrivals bunch up around midday.
 */
export function planArrivals(rng: Rng): ArrivalSchedule {
  const count = rng.int(VISITORS_PER_DAY.min, VISITORS_PER_DAY.max)
  const span = LAST_ARRIVAL_MINUTE - OPEN_MINUTE
  const minutes = Array.from({ length: count }, () =>
    Math.round(OPEN_MINUTE + ((rng.next() + rng.next()) / 2) * span),
  ).sort((a, b) => a - b)
  return { minutes, spawned: 0 }
}

/**
 * How many arrivals are due by `minute` that haven't spawned yet. Returns the
 * same schedule when none are due.
 */
export function takeDue(
  schedule: ArrivalSchedule,
  minute: number,
): { schedule: ArrivalSchedule; count: number } {
  let spawned = schedule.spawned
  while (spawned < schedule.minutes.length && schedule.minutes[spawned] <= minute) spawned++
  const count = spawned - schedule.spawned
  return { schedule: count > 0 ? { ...schedule, spawned } : schedule, count }
}
