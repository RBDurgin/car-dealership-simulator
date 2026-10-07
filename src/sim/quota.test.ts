import { describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH } from './calendar'
import {
  addSale,
  daysLeft,
  emptyMonthSales,
  holdback,
  HOLDBACK_PARTIAL,
  HOLDBACK_RATE,
  HOLDBACK_STRETCH,
  holdbackRate,
  monthlyQuota,
  QUOTA_RANGE,
  quotaLine,
  quotaStatus,
} from './quota'
import { MAX_REPUTATION, START_REPUTATION } from './reputation'

const SLOTS = 30

describe('monthly quota', () => {
  it('is about half a car per slot, more in busy months', () => {
    expect(monthlyQuota(2, SLOTS, START_REPUTATION)).toBe(15)
    expect(monthlyQuota(0, SLOTS, START_REPUTATION)).toBeLessThan(15)
    expect(monthlyQuota(11, SLOTS, START_REPUTATION)).toBeGreaterThan(15)
  })

  it('goes up with reputation and down without it, within range', () => {
    expect(monthlyQuota(2, SLOTS, 80)).toBeGreaterThan(15)
    expect(monthlyQuota(2, SLOTS, 20)).toBeLessThan(15)
    for (let month = 0; month < 12; month++) {
      for (const rep of [0, START_REPUTATION, MAX_REPUTATION]) {
        const q = monthlyQuota(month, SLOTS, rep)
        expect(q).toBeGreaterThanOrEqual(QUOTA_RANGE.min)
        expect(q).toBeLessThanOrEqual(QUOTA_RANGE.max)
      }
    }
  })
})

describe('holdback', () => {
  it('pays nothing below 80% of quota, a little from there, more at and past it', () => {
    expect(holdbackRate(12, 16)).toBe(0)
    expect(holdbackRate(13, 16)).toBe(HOLDBACK_PARTIAL)
    expect(holdbackRate(15, 16)).toBe(HOLDBACK_PARTIAL)
    expect(holdbackRate(16, 16)).toBe(HOLDBACK_RATE)
    expect(holdbackRate(19, 16)).toBe(HOLDBACK_RATE)
    expect(holdbackRate(20, 16)).toBe(HOLDBACK_STRETCH)
  })

  it('is a share of the sold MSRP, rounded to $10', () => {
    expect(holdback(12, 16, 480_000)).toBe(0)
    expect(holdback(16, 16, 560_000)).toBe(7000)
    expect(holdback(20, 16, 700_000)).toBe(14_000)
    expect(holdback(13, 16, 451_234) % 10).toBe(0)
  })

  it('on a 16-car month comes to about $5–8k', () => {
    const payout = holdback(16, 16, 16 * 38_000)
    expect(payout).toBeGreaterThanOrEqual(5000)
    expect(payout).toBeLessThanOrEqual(8000)
  })
})

describe('month sales', () => {
  it('add up', () => {
    const sales = addSale(addSale(emptyMonthSales(), 30_000), 40_000)
    expect(sales).toEqual({ count: 2, msrp: 70_000 })
  })

  it('count the days left after today', () => {
    expect(daysLeft(1)).toBe(DAYS_PER_MONTH - 1)
    expect(daysLeft(DAYS_PER_MONTH)).toBe(0)
  })
})

describe('quota status', () => {
  it('is hit once sold reaches the quota', () => {
    expect(quotaStatus(16, 16, 10)).toBe('hit')
  })

  it('is on track at the pace that reaches it, behind otherwise', () => {
    // Halfway through the month.
    expect(quotaStatus(8, 16, 14)).toBe('onTrack')
    expect(quotaStatus(7, 16, 14)).toBe('behind')
    // Nothing sold yet on the 1st is fine.
    expect(quotaStatus(0, 16, 27)).toBe('onTrack')
    expect(quotaStatus(15, 16, 0)).toBe('behind')
  })

  it('reads as a line', () => {
    expect(quotaLine(9, 16, 6)).toBe('9 of 16 this month, 6 days left')
    expect(quotaLine(9, 16, 1)).toBe('9 of 16 this month, 1 day left')
    expect(quotaLine(9, 16, 0)).toBe('9 of 16 this month, last day')
  })
})
