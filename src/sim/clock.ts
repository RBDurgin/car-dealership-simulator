/**
 * Game time. A day runs from opening to closing; at closing the clock stops and
 * waits for the next day to be started (the day summary does that in 2e).
 */
export interface GameTime {
  day: number
  /** Minutes since midnight. Fractional while the clock runs. */
  minute: number
}

export const OPEN_MINUTE = 9 * 60
export const CLOSE_MINUTE = 18 * 60
/** Real milliseconds a full business day takes at normal speed. */
export const DEFAULT_DAY_MS = 6 * 60 * 1000
/** The store is told about the time in steps of this many game minutes. */
export const CLOCK_STEP_MINUTES = 10

export function startOfDay(day: number): GameTime {
  return { day, minute: OPEN_MINUTE }
}

export function isClosed(t: GameTime): boolean {
  return t.minute >= CLOSE_MINUTE
}

/**
 * The day is done: the doors are shut and the last customer has gone, so the
 * day summary shows until the next day is started.
 */
export function dayOver(s: { clock: GameTime; customers: readonly unknown[] }): boolean {
  return isClosed(s.clock) && s.customers.length === 0
}

/** Moves the clock forward by `dtMs` of real time, stopping at closing. */
export function advance(t: GameTime, dtMs: number, dayMs = DEFAULT_DAY_MS): GameTime {
  if (dtMs <= 0 || isClosed(t)) return t
  const minutesPerMs = (CLOSE_MINUTE - OPEN_MINUTE) / dayMs
  return { day: t.day, minute: Math.min(CLOSE_MINUTE, t.minute + dtMs * minutesPerMs) }
}

/** Snaps to the start of the current clock step, e.g. 10:47 → 10:40. */
export function toStep(t: GameTime): GameTime {
  return {
    day: t.day,
    minute: Math.floor(t.minute / CLOCK_STEP_MINUTES) * CLOCK_STEP_MINUTES,
  }
}

/** "9:00 AM", "12:30 PM", "6:00 PM". */
export function formatTime(minute: number): string {
  const total = Math.floor(minute)
  const h24 = Math.floor(total / 60) % 24
  const m = total % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
}
