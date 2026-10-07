import { describe, expect, it } from 'vitest'
import {
  calendarOf,
  DAYS_PER_MONTH,
  formatDate,
  isMonthEnd,
  longDate,
  trafficLabel,
  WEEKDAY_TRAFFIC,
  weekdayTraffic,
  weekStart,
} from './calendar'

describe('calendarOf', () => {
  it('starts on Monday, week 1 of January, year 1', () => {
    expect(calendarOf(1)).toEqual({ weekday: 0, week: 1, month: 0, year: 1, dayOfMonth: 1 })
  })

  it('counts weekdays, weeks and days of the month', () => {
    expect(calendarOf(7)).toMatchObject({ weekday: 6, week: 1, dayOfMonth: 7 })
    expect(calendarOf(8)).toMatchObject({ weekday: 0, week: 2, dayOfMonth: 8 })
    expect(calendarOf(28)).toMatchObject({ weekday: 6, week: 4, month: 0, dayOfMonth: 28 })
  })

  it('rolls into the next month and year', () => {
    expect(calendarOf(29)).toMatchObject({ weekday: 0, week: 1, month: 1, dayOfMonth: 1 })
    expect(calendarOf(12 * DAYS_PER_MONTH)).toMatchObject({ month: 11, year: 1 })
    expect(calendarOf(12 * DAYS_PER_MONTH + 1)).toMatchObject({ month: 0, year: 2 })
  })
})

describe('labels', () => {
  it('formats the short date for the top bar', () => {
    expect(formatDate(1)).toBe('Mon · Wk 1 · Jan')
    // Saturday of week 2 in March.
    expect(formatDate(2 * DAYS_PER_MONTH + 13)).toBe('Sat · Wk 2 · Mar')
  })

  it('spells out the long date, with the year from year 2', () => {
    expect(longDate(2 * DAYS_PER_MONTH + 13)).toBe('Saturday, week 2 of March')
    expect(longDate(12 * DAYS_PER_MONTH + 1)).toBe('Monday, week 1 of January, year 2')
  })
})

describe('isMonthEnd', () => {
  it('is the last three days of the month', () => {
    expect([25, 26, 27, 28].map(isMonthEnd)).toEqual([false, true, true, true])
    expect(isMonthEnd(29)).toBe(false)
    expect(isMonthEnd(DAYS_PER_MONTH * 2)).toBe(true)
  })
})

describe('weekly traffic', () => {
  it('peaks on Saturday at about twice Sunday', () => {
    const sat = weekdayTraffic(6)
    const sun = weekdayTraffic(7)
    expect(sat).toBe(Math.max(...WEEKDAY_TRAFFIC))
    expect(sun).toBe(Math.min(...WEEKDAY_TRAFFIC))
    expect(sat / sun).toBeCloseTo(2, 0)
  })

  it('adds up to about 6.8 average days a week', () => {
    const week = WEEKDAY_TRAFFIC.reduce((a, b) => a + b, 0)
    expect(week).toBeGreaterThan(6.6)
    expect(week).toBeLessThan(7)
  })

  it('labels each weekday’s traffic', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => trafficLabel(weekdayTraffic(d)))).toEqual([
      'Quiet',
      'Quiet',
      'Quiet',
      'Steady',
      'Busy',
      'Rush',
      'Quiet',
    ])
  })

  it('finds the Monday of the week', () => {
    expect(weekStart(1)).toBe(1)
    expect(weekStart(7)).toBe(1)
    expect(weekStart(13)).toBe(8)
  })
})
