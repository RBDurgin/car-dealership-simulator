import { describe, expect, it } from 'vitest'
import { emptyStats, type DayStats, type Sale } from './deal'
import {
  applyChange,
  campaignScale,
  MAX_DAILY_CHANGE,
  MAX_REFERRALS,
  referralVisitors,
  REPUTATION_POINTS,
  reputationChange,
  reputationLabel,
  START_REPUTATION,
  visitorScale,
} from './reputation'

const sale: Sale = {
  customerName: 'Alex B.',
  carId: 'lot-car-1',
  model: 'van',
  price: 30_000,
  msrp: 30_000,
  cost: 26_000,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
}

const stats = (extra: Partial<DayStats>): DayStats => ({ ...emptyStats(), ...extra })

describe('reputationChange', () => {
  it('is nothing on a quiet day', () => {
    expect(reputationChange(emptyStats())).toBe(0)
  })

  it('rises with buyers and falls with unhappy customers', () => {
    expect(reputationChange(stats({ sales: [sale, sale] }))).toBe(2 * REPUTATION_POINTS.sale)
    expect(reputationChange(stats({ refused: 1 }))).toBe(REPUTATION_POINTS.refused)
    expect(reputationChange(stats({ impatient: 1 }))).toBe(REPUTATION_POINTS.impatient)
    expect(reputationChange(stats({ missed: { van: 2, suv: 1 } }))).toBe(
      3 * REPUTATION_POINTS.missed,
    )
    expect(reputationChange(stats({ sales: [sale, sale], impatient: 1 }))).toBe(
      2 * REPUTATION_POINTS.sale + REPUTATION_POINTS.impatient,
    )
  })

  it('ignores customers sent home at closing', () => {
    expect(reputationChange(stats({ closing: 4 }))).toBe(0)
  })

  it('scales gains and losses separately for the level, then rounds', () => {
    const day = stats({ sales: [sale, sale], impatient: 1, refused: 1 })
    expect(reputationChange(day, { gain: 1, loss: 1 })).toBe(reputationChange(day))
    // Easy: +4 gained, −3 lost × 0.6.
    expect(reputationChange(day, { gain: 1, loss: 0.6 })).toBe(Math.round(4 - 3 * 0.6))
    // Hard: +4 × 0.85, −3 × 1.3.
    expect(reputationChange(day, { gain: 0.85, loss: 1.3 })).toBe(Math.round(4 * 0.85 - 3 * 1.3))
  })

  it('caps a scaled change too', () => {
    expect(reputationChange(stats({ impatient: 4 }), { gain: 1, loss: 1.3 })).toBe(
      -MAX_DAILY_CHANGE,
    )
  })

  it('caps a day’s change either way', () => {
    expect(reputationChange(stats({ sales: Array(20).fill(sale) }))).toBe(MAX_DAILY_CHANGE)
    expect(reputationChange(stats({ impatient: 20 }))).toBe(-MAX_DAILY_CHANGE)
  })
})

describe('applyChange', () => {
  it('stays between 0 and 100', () => {
    expect(applyChange(50, 5)).toBe(55)
    expect(applyChange(98, 5)).toBe(100)
    expect(applyChange(3, -5)).toBe(0)
  })
})

describe('what reputation does', () => {
  it('leaves traffic as it is at the start', () => {
    expect(visitorScale(START_REPUTATION)).toBe(1)
    expect(campaignScale(START_REPUTATION)).toBe(1)
    expect(referralVisitors(START_REPUTATION)).toBe(0)
  })

  it('brings more visitors, referrals and ad traffic as it rises', () => {
    expect(visitorScale(100)).toBeCloseTo(1.3)
    expect(visitorScale(0)).toBeCloseTo(0.7)
    expect(campaignScale(100)).toBeCloseTo(1.5)
    expect(campaignScale(0)).toBeCloseTo(0.5)
    expect(referralVisitors(75)).toBeCloseTo(MAX_REFERRALS / 2)
    expect(referralVisitors(100)).toBe(MAX_REFERRALS)
    expect(referralVisitors(20)).toBe(0)
  })

  it('names each band', () => {
    expect([0, 30, 50, 70, 90].map(reputationLabel)).toEqual([
      'Poor',
      'Fair',
      'Good',
      'Great',
      'Excellent',
    ])
  })
})
