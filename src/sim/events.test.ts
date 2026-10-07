import { describe, expect, it } from 'vitest'
import { calendarOf, DAYS_PER_MONTH, DAYS_PER_WEEK, MONTHS_PER_YEAR } from './calendar'
import {
  closeoutOn,
  EVENT_DAYS,
  EVENTS,
  eventNotice,
  eventOn,
  eventOpens,
  nextEvent,
  upcomingEvents,
} from './events'

const YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR
/** The first day (Friday) of `month`'s sale in year 1. */
const opening = (month: number, week: number) => month * DAYS_PER_MONTH + (week - 1) * 7 + 5

describe('eventOn', () => {
  it('runs each sale Friday to Sunday of its week', () => {
    for (const e of EVENTS) {
      const fri = opening(e.month, e.week)
      expect(calendarOf(fri).weekday).toBe(4)
      expect(eventOn(fri - 1)).toBeNull()
      for (let i = 0; i < EVENT_DAYS; i++) expect(eventOn(fri + i)).toBe(e)
      expect(eventOn(fri + EVENT_DAYS)).toBeNull()
    }
  })

  it('comes round every year, six weekends of three days', () => {
    expect(upcomingEvents(1, YEAR)).toHaveLength(EVENTS.length * EVENT_DAYS)
    for (const e of EVENTS) expect(eventOn(opening(e.month, e.week) + YEAR)).toBe(e)
  })

  it('brings more visitors who hope for a bigger discount and lean to bargains', () => {
    for (const e of EVENTS) {
      expect(e.traffic).toBeGreaterThanOrEqual(1.5)
      expect(e.traffic).toBeLessThanOrEqual(2)
      expect(e.extraDiscount).toBeGreaterThan(0)
      expect(e.skew.bargain).toBeGreaterThan(1)
    }
  })

  it('opens on the Friday only', () => {
    const memorial = EVENTS.find((e) => e.id === 'memorial')!
    const fri = opening(memorial.month, memorial.week)
    expect(eventOpens(fri)).toBe(true)
    expect(eventOpens(fri + 1)).toBe(false)
  })
})

describe('nextEvent', () => {
  it("finds the next sale's opening day, after today", () => {
    const first = EVENTS[0]
    expect(nextEvent(1)).toEqual({ day: opening(first.month, first.week), event: first })
    const fri = opening(first.month, first.week)
    expect(nextEvent(fri).event).toBe(EVENTS[1])
  })

  it('wraps round to next year after the last', () => {
    const last = EVENTS[EVENTS.length - 1]
    const next = nextEvent(opening(last.month, last.week))
    expect(next.event).toBe(EVENTS[0])
    expect(next.day).toBe(opening(EVENTS[0].month, EVENTS[0].week) + YEAR)
  })
})

describe('eventNotice', () => {
  it('warns a week ahead and announces the opening day', () => {
    const e = EVENTS.find((x) => x.id === 'labor')!
    const fri = opening(e.month, e.week)
    expect(eventNotice(fri - DAYS_PER_WEEK)).toContain('Labor Day sale starts next Friday')
    expect(eventNotice(fri)).toContain('Labor Day sale starts today')
    expect(eventNotice(fri + 1)).toBeNull()
    expect(eventNotice(fri - 1)).toBeNull()
  })
})

describe('closeoutOn', () => {
  it('names one model for the last three days of the month only', () => {
    for (let month = 0; month < 6; month++) {
      const start = month * DAYS_PER_MONTH + 1
      for (let d = start; d < start + DAYS_PER_MONTH - 3; d++) expect(closeoutOn(d)).toBeNull()
      const end = start + DAYS_PER_MONTH - 3
      const model = closeoutOn(end)
      expect(model).not.toBeNull()
      expect(closeoutOn(end + 1)).toBe(model)
      expect(closeoutOn(end + 2)).toBe(model)
    }
  })

  it('changes model from month to month', () => {
    const models = Array.from({ length: 12 }, (_, m) => closeoutOn((m + 1) * DAYS_PER_MONTH))
    expect(new Set(models).size).toBeGreaterThan(1)
  })
})
