/**
 * The calendar, derived from the day number alone: day 1 is Monday, week 1 of
 * January, year 1. Months are four 7-day weeks, so every month starts on a
 * Monday. Nothing here is saved.
 */

export const DAYS_PER_WEEK = 7
export const WEEKS_PER_MONTH = 4
export const DAYS_PER_MONTH = DAYS_PER_WEEK * WEEKS_PER_MONTH
export const MONTHS_PER_YEAR = 12
/** The last this many days of a month count as month end. */
export const MONTH_END_DAYS = 3

export interface CalendarDate {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number
  /** 1–4, the week of the month. */
  week: number
  /** 0 = January … 11 = December. */
  month: number
  /** From 1. */
  year: number
  /** 1–28. */
  dayOfMonth: number
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Traffic by weekday, a multiplier on the usual visitors and passers-by:
 * Saturday is the rush and Sunday the slowest day. A week comes to about 6.75
 * average days.
 */
export const WEEKDAY_TRAFFIC = [0.8, 0.8, 0.9, 1.0, 1.15, 1.4, 0.7]

export function calendarOf(day: number): CalendarDate {
  const index = Math.max(0, day - 1)
  const inMonth = index % DAYS_PER_MONTH
  const months = Math.floor(index / DAYS_PER_MONTH)
  return {
    weekday: index % DAYS_PER_WEEK,
    week: Math.floor(inMonth / DAYS_PER_WEEK) + 1,
    month: months % MONTHS_PER_YEAR,
    year: Math.floor(months / MONTHS_PER_YEAR) + 1,
    dayOfMonth: inMonth + 1,
  }
}

/** "Sat", or "Saturday" in full. */
export function weekdayLabel(weekday: number, long = false): string {
  const name = WEEKDAYS[weekday]
  return long ? name : name.slice(0, 3)
}

/** "Mar", or "March" in full. */
export function monthLabel(month: number, long = false): string {
  const name = MONTHS[month]
  return long ? name : name.slice(0, 3)
}

/** "Sat · Wk 2 · Mar", for the top bar. */
export function formatDate(day: number): string {
  const c = calendarOf(day)
  return `${weekdayLabel(c.weekday)} · Wk ${c.week} · ${monthLabel(c.month)}`
}

/** "Saturday, week 2 of March", with the year from year 2 on. */
export function longDate(day: number): string {
  const c = calendarOf(day)
  const year = c.year > 1 ? `, year ${c.year}` : ''
  return `${weekdayLabel(c.weekday, true)}, week ${c.week} of ${monthLabel(c.month, true)}${year}`
}

/** The last `MONTH_END_DAYS` days of the month. */
export function isMonthEnd(day: number): boolean {
  return calendarOf(day).dayOfMonth > DAYS_PER_MONTH - MONTH_END_DAYS
}

/** The weekday's multiplier on a day's visitors and passers-by. */
export function weekdayTraffic(day: number): number {
  return WEEKDAY_TRAFFIC[calendarOf(day).weekday]
}

/** The first day (Monday) of the week `day` is in. */
export function weekStart(day: number): number {
  return day - calendarOf(day).weekday
}

/** How busy a traffic multiplier reads in the calendar. */
export function trafficLabel(traffic: number): string {
  if (traffic >= 1.3) return 'Rush'
  if (traffic >= 1.1) return 'Busy'
  if (traffic >= 0.95) return 'Steady'
  return 'Quiet'
}
