import { describe, expect, it } from 'vitest'
import {
  advance,
  CLOSE_MINUTE,
  dayOver,
  DEFAULT_DAY_MS,
  formatTime,
  isClosed,
  OPEN_MINUTE,
  startOfDay,
  toStep,
} from './clock'

describe('game clock', () => {
  it('starts each day at opening', () => {
    expect(startOfDay(3)).toEqual({ day: 3, minute: OPEN_MINUTE })
    expect(isClosed(startOfDay(1))).toBe(false)
  })

  it('covers the business day in the configured real time', () => {
    const half = advance(startOfDay(1), DEFAULT_DAY_MS / 2)
    expect(half.minute).toBeCloseTo((OPEN_MINUTE + CLOSE_MINUTE) / 2)
    // 9 hours in 1 real second at a custom speed.
    expect(advance(startOfDay(1), 1000, 1000).minute).toBe(CLOSE_MINUTE)
  })

  it('accumulates small steps', () => {
    let t = startOfDay(1)
    for (let i = 0; i < 60; i++) t = advance(t, 1000 / 60)
    // 1 real second of a 6 minute day is 1.5 game minutes.
    expect(t.minute - OPEN_MINUTE).toBeCloseTo(1.5)
  })

  it('stops at closing and stays on the same day', () => {
    const t = advance(startOfDay(2), DEFAULT_DAY_MS * 3)
    expect(t).toEqual({ day: 2, minute: CLOSE_MINUTE })
    expect(isClosed(t)).toBe(true)
    expect(advance(t, 5000)).toBe(t)
  })

  it('ignores zero and negative deltas', () => {
    const t = startOfDay(1)
    expect(advance(t, 0)).toBe(t)
    expect(advance(t, -50)).toBe(t)
  })

  it('snaps to 10 minute steps', () => {
    expect(toStep({ day: 1, minute: 647.9 })).toEqual({ day: 1, minute: 640 })
    expect(toStep({ day: 1, minute: 650 })).toEqual({ day: 1, minute: 650 })
  })

  it('formats 12-hour times', () => {
    expect(formatTime(OPEN_MINUTE)).toBe('9:00 AM')
    expect(formatTime(10 * 60 + 40)).toBe('10:40 AM')
    expect(formatTime(12 * 60 + 5)).toBe('12:05 PM')
    expect(formatTime(CLOSE_MINUTE)).toBe('6:00 PM')
    expect(formatTime(0)).toBe('12:00 AM')
    expect(formatTime(OPEN_MINUTE + 0.99)).toBe('9:00 AM')
  })
})

describe('dayOver', () => {
  const closed = { day: 1, minute: CLOSE_MINUTE }
  it('waits for closing and for the last customer to leave', () => {
    expect(dayOver({ clock: startOfDay(1), customers: [] })).toBe(false)
    expect(dayOver({ clock: closed, customers: [{}] })).toBe(false)
    expect(dayOver({ clock: closed, customers: [] })).toBe(true)
  })
})
