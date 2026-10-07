import type { Archetype } from './archetypes'
import { calendarOf, DAYS_PER_MONTH, DAYS_PER_WEEK, isMonthEnd } from './calendar'
import { CAR_MODELS } from './customers'
import type { CarModel } from './layout'
import { createRng } from './rng'

/**
 * Holiday sale weekends and month-end closeouts, derived from the day number
 * like the rest of the calendar, so nothing is saved. A sale weekend brings a
 * crowd that expects a bigger discount and leans toward bargain hunters; a
 * closeout takes a slice off one model's invoice in the last days of a month.
 */
export type EventId = 'presidents' | 'memorial' | 'july4' | 'labor' | 'blackFriday' | 'yearEnd'

export interface SaleEvent {
  id: EventId
  /** "Memorial Day". */
  label: string
  /** 0 = January. */
  month: number
  /** The week of the month (1–4) whose Friday to Sunday it runs. */
  week: number
  /** Multiplier on the day's visitors. */
  traffic: number
  /** Added to the discount off MSRP each customer hopes for. */
  extraDiscount: number
  /** Multipliers on the usual archetype odds. */
  skew: Partial<Record<Archetype, number>>
}

const BARGAIN_HUNT: SaleEvent['skew'] = { bargain: 2.5, 'tire-kicker': 1.3 }

export const EVENTS: readonly SaleEvent[] = [
  {
    id: 'presidents',
    label: "Presidents' Day",
    month: 1,
    week: 3,
    traffic: 1.5,
    extraDiscount: 0.03,
    skew: BARGAIN_HUNT,
  },
  {
    id: 'memorial',
    label: 'Memorial Day',
    month: 4,
    week: 4,
    traffic: 1.8,
    extraDiscount: 0.04,
    skew: BARGAIN_HUNT,
  },
  {
    id: 'july4',
    label: 'Fourth of July',
    month: 6,
    week: 1,
    traffic: 1.6,
    extraDiscount: 0.04,
    skew: { ...BARGAIN_HUNT, couple: 1.5 },
  },
  {
    id: 'labor',
    label: 'Labor Day',
    month: 8,
    week: 1,
    traffic: 1.7,
    extraDiscount: 0.04,
    skew: BARGAIN_HUNT,
  },
  {
    id: 'blackFriday',
    label: 'Black Friday',
    month: 10,
    week: 4,
    traffic: 2,
    extraDiscount: 0.05,
    skew: { bargain: 3, 'tire-kicker': 1.5 },
  },
  {
    id: 'yearEnd',
    label: 'Year-End',
    month: 11,
    week: 4,
    traffic: 1.8,
    extraDiscount: 0.04,
    skew: { ...BARGAIN_HUNT, decisive: 1.3 },
  },
]

/** A sale runs Friday (weekday 4) to Sunday. */
export const EVENT_FIRST_WEEKDAY = 4
export const EVENT_DAYS = DAYS_PER_WEEK - EVENT_FIRST_WEEKDAY
/** The heads-up comes this many days before a sale opens. */
export const EVENT_NOTICE_DAYS = DAYS_PER_WEEK

/** The sale on `day`, or null. */
export function eventOn(day: number): SaleEvent | null {
  const c = calendarOf(day)
  if (c.weekday < EVENT_FIRST_WEEKDAY) return null
  return EVENTS.find((e) => e.month === c.month && e.week === c.week) ?? null
}

/** Whether `day` is the first day of a sale. */
export function eventOpens(day: number): boolean {
  return !!eventOn(day) && calendarOf(day).weekday === EVENT_FIRST_WEEKDAY
}

/** Sale days in the `days` days from `from` (inclusive). */
export function upcomingEvents(from: number, days: number): { day: number; event: SaleEvent }[] {
  const out: { day: number; event: SaleEvent }[] = []
  for (let day = from; day < from + days; day++) {
    const event = eventOn(day)
    if (event) out.push({ day, event })
  }
  return out
}

/** The next sale to open after `day`: its opening day and the event. */
export function nextEvent(day: number): { day: number; event: SaleEvent } {
  for (let d = day + 1; ; d++) {
    if (eventOpens(d)) return { day: d, event: eventOn(d)! }
  }
}

/** The morning notice: a week's warning, or the opening day's banner. Null on other days. */
export function eventNotice(day: number): string | null {
  if (eventOpens(day)) {
    const e = eventOn(day)!
    return `The ${e.label} sale starts today: expect a crowd hunting for bargains.`
  }
  const ahead = day + EVENT_NOTICE_DAYS
  if (eventOpens(ahead)) {
    return `The ${eventOn(ahead)!.label} sale starts next Friday. Stock up and run some ads.`
  }
  return null
}

/** The closeout rebate, off the invoice of one model in the last days of the month. */
export const CLOSEOUT_REBATE = 0.06
const CLOSEOUT_SEED = 22_000

/** The model on closeout on `day`: one per month, in its last days. Null otherwise. */
export function closeoutOn(day: number): CarModel | null {
  if (!isMonthEnd(day)) return null
  const month = Math.floor((day - 1) / DAYS_PER_MONTH)
  return createRng(CLOSEOUT_SEED + month).pick(CAR_MODELS)
}
