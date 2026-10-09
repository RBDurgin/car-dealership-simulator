import { describe, expect, it } from 'vitest'
import { emptyStats, type DayStats, type Sale } from './deal'
import {
  addDay,
  atTopRank,
  bestMonthSoFar,
  emptyCareer,
  isRankId,
  nextRank,
  rankGross,
  rankOf,
  rankProgress,
  RANKS,
  rankUp,
  rankUpNotice,
  TOP_RANK,
  type Career,
} from './progression'
import { MAX_REPUTATION, START_REPUTATION } from './reputation'

const sale = (price: number, cost: number): Sale => ({
  customerName: 'Alex B.',
  carId: 'lot-car-1',
  model: 'van',
  price,
  msrp: price,
  cost,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
})

const day = (...sales: Sale[]): DayStats => ({ ...emptyStats(), sales })

const career = (gross: number, extra: Partial<Career> = {}): Career => ({
  ...emptyCareer(),
  gross,
  ...extra,
})

describe('ranks', () => {
  it('climb in gross and reputation from a free first rank', () => {
    expect(RANKS[0]).toMatchObject({ id: 'corner-lot', gross: 0, reputation: 0 })
    expect(RANKS[RANKS.length - 1].id).toBe('dealer-of-the-year')
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].gross).toBeGreaterThan(RANKS[i - 1].gross)
      expect(RANKS[i].reputation).toBeGreaterThanOrEqual(RANKS[i - 1].reputation)
      expect(RANKS[i].reputation).toBeLessThanOrEqual(MAX_REPUTATION)
    }
    // The first rank-up can't need more than a new game's reputation.
    expect(RANKS[1].reputation).toBeLessThanOrEqual(START_REPUTATION)
  })

  it('start a new career at Corner Lot', () => {
    expect(rankOf(emptyCareer(), START_REPUTATION).id).toBe('corner-lot')
  })

  it('need both the gross and the reputation', () => {
    const [, main, trusted] = RANKS
    expect(rankOf(career(main.gross), main.reputation).id).toBe('main-street')
    expect(rankOf(career(main.gross - 1), MAX_REPUTATION).id).toBe('corner-lot')
    expect(rankOf(career(trusted.gross), trusted.reputation - 1).id).toBe('main-street')
    expect(rankOf(career(trusted.gross), trusted.reputation).id).toBe('trusted-dealer')
  })

  it('are earned in order: a reputation short of one holds back those above it', () => {
    const top = RANKS[RANKS.length - 1]
    expect(rankOf(career(top.gross * 2), RANKS[1].reputation - 1).id).toBe('corner-lot')
    expect(rankOf(career(top.gross), top.reputation).id).toBe('dealer-of-the-year')
  })

  it('are kept once reached, even if reputation slips', () => {
    const held = career(RANKS[2].gross, { rank: 'trusted-dealer' })
    expect(rankOf(held, 0).id).toBe('trusted-dealer')
  })

  it('scale their gross with the level, not their reputation', () => {
    const main = RANKS[1]
    expect(rankGross(main, 0.75)).toBe(90_000)
    expect(rankGross(main, 1.15)).toBe(138_000)
    expect(rankOf(career(90_000), main.reputation, 0.75).id).toBe('main-street')
    expect(rankOf(career(90_000), main.reputation).id).toBe('corner-lot')
    expect(rankOf(career(main.gross), main.reputation, 1.15).id).toBe('corner-lot')
    expect(rankOf(career(90_000), main.reputation - 1, 0.75).id).toBe('corner-lot')
  })

  it('know their ids', () => {
    expect(RANKS.every((r) => isRankId(r.id))).toBe(true)
    expect(isRankId('emperor')).toBe(false)
    expect(nextRank('corner-lot')?.id).toBe('main-street')
    expect(nextRank('dealer-of-the-year')).toBeNull()
  })
})

describe('career', () => {
  it('adds up the day’s gross, sales and days', () => {
    const next = addDay(emptyCareer(), day(sale(30_000, 27_000), sale(25_000, 23_500)), 50, false)
    expect(next).toMatchObject({ gross: 4_500, sales: 2, days: 1, monthGross: 4_500, bestMonth: 0 })
    expect(addDay(next, day(), 50, false)).toMatchObject({ gross: 4_500, sales: 2, days: 2 })
  })

  it('takes a loss off the gross', () => {
    expect(addDay(career(1_000), day(sale(20_000, 22_000)), 50, false).gross).toBe(-1_000)
  })

  it('weighs the month against the best one on its last day, and starts again', () => {
    const mid = career(50_000, { monthGross: 20_000, bestMonth: 30_000 })
    const end = addDay(mid, day(sale(40_000, 35_000)), 50, true)
    expect(end).toMatchObject({ monthGross: 0, bestMonth: 30_000 })
    const better = addDay({ ...mid, monthGross: 28_000 }, day(sale(40_000, 35_000)), 50, true)
    expect(better).toMatchObject({ monthGross: 0, bestMonth: 33_000 })
  })

  it('brings the rank up to date, at the level’s scale', () => {
    const near = career(RANKS[1].gross - 2_000)
    const sold = day(sale(30_000, 27_000))
    const next = addDay(near, sold, 50, false)
    expect(next.rank).toBe('main-street')
    expect(rankUp(near, next)?.id).toBe('main-street')
    expect(addDay(near, sold, 50, false, 1.3).rank).toBe('corner-lot')
    expect(rankUp(next, addDay(next, day(), 50, false))).toBeNull()
  })
})

describe('rank progress', () => {
  it('measures the gross toward the next rank and whether reputation is there', () => {
    const p = rankProgress(career(20_000), 40)
    expect(p.rank.id).toBe('corner-lot')
    expect(p.next?.id).toBe('main-street')
    expect(p.grossNeeded).toBe(RANKS[1].gross)
    expect(p.share).toBeCloseTo(20_000 / RANKS[1].gross)
    expect(p.reputationMet).toBe(false)
    expect(rankProgress(career(20_000), RANKS[1].reputation).reputationMet).toBe(true)
  })

  it('holds the share between 0 and 1', () => {
    expect(rankProgress(career(-5_000), 50).share).toBe(0)
    expect(rankProgress(career(RANKS[1].gross * 3), 0).share).toBe(1)
  })

  it('is full at the top', () => {
    const top = RANKS[RANKS.length - 1]
    expect(rankProgress(career(top.gross, { rank: top.id }), 0)).toMatchObject({
      next: null,
      share: 1,
      reputationMet: true,
    })
  })

  it('scales the gross needed', () => {
    expect(rankProgress(career(0), 50, 0.75).grossNeeded).toBe(90_000)
  })
})

describe('rank-up notice', () => {
  it('names the rank', () => {
    expect(rankUpNotice(RANKS[1])).toContain('Main Street')
    expect(rankUpNotice(RANKS[RANKS.length - 1])).toContain('Dealer of the Year')
  })
})

describe('the top rank', () => {
  it('is Dealer of the Year, the last rank', () => {
    expect(TOP_RANK.id).toBe('dealer-of-the-year')
    expect(nextRank(TOP_RANK.id)).toBeNull()
    expect(atTopRank({ ...emptyCareer(), rank: TOP_RANK.id })).toBe(true)
    expect(atTopRank({ ...emptyCareer(), rank: 'regional-name' })).toBe(false)
  })

  it('counts the month under way toward the best month', () => {
    expect(bestMonthSoFar({ ...emptyCareer(), bestMonth: 50_000, monthGross: 20_000 })).toBe(50_000)
    expect(bestMonthSoFar({ ...emptyCareer(), bestMonth: 50_000, monthGross: 70_000 })).toBe(70_000)
  })
})
