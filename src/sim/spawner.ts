import { OPEN_MINUTE } from './clock'
import { CHANNEL_IDS, type Channel, type Source } from './marketing'
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
  /** What brings each arrival in, by index into `minutes`. */
  sources: Source[]
  spawned: number
}

/**
 * Plans a day's arrivals between opening and `LAST_ARRIVAL_MINUTE`: the usual
 * visitors plus any `boost` from ad campaigns (see `trafficBoost`), whose
 * fractions are rolled. Each time is the mean of two uniform draws, so
 * arrivals bunch up around midday.
 */
export function planArrivals(
  rng: Rng,
  boost: Partial<Record<Channel, number>> = {},
): ArrivalSchedule {
  const span = LAST_ARRIVAL_MINUTE - OPEN_MINUTE
  const time = () => Math.round(OPEN_MINUTE + ((rng.next() + rng.next()) / 2) * span)
  const count = rng.int(VISITORS_PER_DAY.min, VISITORS_PER_DAY.max)
  const planned = Array.from({ length: count }, () => ({
    minute: time(),
    source: 'regular' as Source,
  }))
  for (const channel of CHANNEL_IDS) {
    const expected = boost[channel] ?? 0
    if (expected <= 0) continue
    const extra = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0)
    for (let i = 0; i < extra; i++) planned.push({ minute: time(), source: channel })
  }
  planned.sort((a, b) => a.minute - b.minute)
  return {
    minutes: planned.map((p) => p.minute),
    sources: planned.map((p) => p.source),
    spawned: 0,
  }
}

/**
 * The sources of the arrivals due by `minute` that haven't spawned yet.
 * Returns the same schedule when none are due.
 */
export function takeDue(
  schedule: ArrivalSchedule,
  minute: number,
): { schedule: ArrivalSchedule; due: Source[] } {
  let spawned = schedule.spawned
  while (spawned < schedule.minutes.length && schedule.minutes[spawned] <= minute) spawned++
  const due = schedule.sources.slice(schedule.spawned, spawned)
  return { schedule: due.length > 0 ? { ...schedule, spawned } : schedule, due }
}
