import { describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH } from './calendar'
import { PLAYER_ID } from './customers'
import { emptyStats, netIncome, type DayStats, type Sale } from './deal'
import type { CarModel } from './layout'
import type { Source } from './marketing'
import {
  addDay,
  amendDay,
  dayRecord,
  emptyLifetime,
  emptyRecords,
  LOG_FIELDS,
  monthIndexOf,
  periodGross,
  recordToTuple,
  tupleToRecord,
  updateRecords,
  weekIndex,
  type DayRecord,
  type Records,
} from './stats'

const sale = (
  price: number,
  cost: number,
  extra: Partial<Sale> & { model?: CarModel; source?: Source } = {},
): Sale => ({
  customerName: 'Alex B.',
  carId: 'gone',
  model: 'sedan',
  price,
  msrp: price,
  cost,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
  ...extra,
})

const stats = (extra: Partial<DayStats> = {}): DayStats => ({ ...emptyStats(), ...extra })

describe('day records', () => {
  it('boils a settled day down to whole numbers', () => {
    const day = stats({
      sales: [sale(30_000, 27_000), sale(14_000, 11_500.4, { used: true })],
      visitors: 12,
      refused: 2,
      impatient: 1,
      closing: 1,
      wages: 800,
      marketing: 600,
    })
    expect(dayRecord(day, 5, 51.6, 40_250.7)).toEqual({
      day: 5,
      sales: 2,
      usedSales: 1,
      gross: 5_500,
      net: Math.round(netIncome(day)),
      visitors: 12,
      walkOuts: 4,
      reputation: 52,
      cash: 40_251,
      marketing: 600,
    })
  })

  it('round-trips through a tuple in field order', () => {
    const r = dayRecord(stats({ visitors: 3 }), 2, 50, 10_000)
    expect(recordToTuple(r)).toHaveLength(LOG_FIELDS.length)
    expect(recordToTuple(r)[0]).toBe(2)
    expect(tupleToRecord(recordToTuple(r))).toEqual(r)
  })
})

describe('lifetime totals', () => {
  it('adds up by model, source and seller', () => {
    let life = addDay(
      emptyLifetime(),
      stats({
        visitors: 10,
        sales: [
          sale(30_000, 27_000, { model: 'truck', source: 'tv' }),
          sale(20_000, 18_000, { soldBy: 'Sam T.', sellerId: 'staff-1-1', source: 'tv' }),
        ],
      }),
    )
    life = addDay(
      life,
      stats({
        visitors: 5,
        sales: [
          sale(15_000, 12_000, {
            used: true,
            soldBy: 'Sam T.',
            sellerId: 'staff-1-1',
            trade: {} as Sale['trade'],
          }),
        ],
        nazma: { ...emptyStats().nazma, runOff: 'player', foiled: true },
      }),
    )
    expect(life).toMatchObject({
      sales: 3,
      usedSales: 1,
      gross: 8_000,
      visitors: 15,
      byModel: { truck: 1, sedan: 2 },
      bySource: { tv: 2, regular: 1 },
      bySeller: {
        [PLAYER_ID]: { sales: 1, gross: 3_000 },
        'staff-1-1': { sales: 2, gross: 5_000 },
      },
      trades: 1,
      nazmaRunOffs: 1,
      theftsFoiled: 1,
    })
  })

  it('takes money spent after settling into the day’s record and the lifetime net', () => {
    const day = stats({ sales: [sale(30_000, 27_000)] })
    const log = [dayRecord(day, 3, 50, 10_000)]
    const life = addDay(emptyLifetime(), day)
    const spent = { ...day, marketing: 500 }
    const amended = amendDay(log, life, spent, 3)
    expect(amended.log[0]).toMatchObject({ net: 2_500, marketing: 500, cash: 10_000 })
    expect(amended.lifetime.net).toBe(2_500)
    expect(amendDay(amended.log, amended.lifetime, spent, 3).log).toBe(amended.log)
    expect(amendDay(log, life, spent, 4).log).toBe(log)
  })
})

/** Settles `days` (gross, sales) in turn from `from`, returning the records and each day's broken. */
function play(days: [number, number][], from = 1, start: Records = emptyRecords()) {
  let records = start
  const log: DayRecord[] = []
  const broken: string[][] = []
  days.forEach(([gross, sales], i) => {
    const day = stats({ sales: Array.from({ length: sales }, () => sale(gross / sales, 0)) })
    log.push({ ...dayRecord(day, from + i, 50, 0), gross })
    const r = updateRecords(records, log, day)
    records = r.records
    broken.push(r.broken)
  })
  return { records, log, broken }
}

describe('records', () => {
  it('sets the first of each without calling it broken', () => {
    const { records, broken } = play([[5_000, 2]])
    expect(records.bestDay).toEqual({ value: 5_000, day: 1 })
    expect(records.bestSalesDay).toEqual({ value: 2, day: 1 })
    expect(records.biggestDeal).toEqual({ value: 2_500, day: 1, model: 'sedan' })
    expect(records.streak).toBe(1)
    expect(broken[0]).toEqual([])
  })

  it('replaces the best day only with a strictly higher one', () => {
    const { records, broken } = play([
      [5_000, 2],
      [5_000, 2],
      [6_000, 2],
    ])
    expect(records.bestDay).toEqual({ value: 6_000, day: 3 })
    expect(broken[1]).not.toContain('bestDay')
    expect(broken[2]).toContain('bestDay')
    expect(records.bestSalesDay).toEqual({ value: 2, day: 1 })
  })

  it('sets nothing on a day with no sales or a loss', () => {
    const { records } = play([[-2_000, 0]])
    expect(records).toEqual(emptyRecords())
  })

  it('breaks a streak on a day with no sales, and keeps the longest', () => {
    const { records, broken } = play([
      [1_000, 1],
      [1_000, 1],
      [0, 0],
      [1_000, 1],
      [1_000, 1],
      [1_000, 1],
    ])
    expect(records.streak).toBe(3)
    expect(records.longestStreak).toEqual({ value: 3, day: 6 })
    // Overtaking the old streak breaks it once; going on doesn't again.
    expect(broken[4]).not.toContain('longestStreak')
    expect(broken[5]).toContain('longestStreak')
    const { broken: running } = play([
      [1_000, 1],
      [1_000, 1],
      [1_000, 1],
    ])
    expect(running.flat()).not.toContain('longestStreak')
  })

  it('sums weeks and months from the log, across a month boundary', () => {
    const days: [number, number][] = Array.from({ length: 10 }, () => [1_000, 1])
    const { log, records } = play(days, DAYS_PER_MONTH - 4)
    // Days 24–28 are the month's last week; 29–33 the next month's first.
    expect(periodGross(log, DAYS_PER_MONTH, weekIndex)).toBe(5_000)
    expect(periodGross(log, DAYS_PER_MONTH, monthIndexOf)).toBe(5_000)
    expect(periodGross(log, DAYS_PER_MONTH + 5, monthIndexOf)).toBe(5_000)
    // The new month only ties the old one, which keeps the record.
    expect(records.bestMonth).toEqual({ value: 5_000, day: DAYS_PER_MONTH })
    expect(records.bestWeek).toEqual({ value: 5_000, day: DAYS_PER_MONTH })
  })

  it('breaks a week or month only when it beats another one', () => {
    const week: [number, number][] = Array.from({ length: 7 }, () => [1_000, 1])
    const { broken, records } = play([...week, [3_000, 1], [3_000, 1], [3_000, 1]])
    // The first week raising its own record isn't a break.
    expect(broken.slice(0, 7).flat()).not.toContain('bestWeek')
    // Week 2 passes 7,000 on its third day, once.
    expect(broken[8]).not.toContain('bestWeek')
    expect(broken[9]).toContain('bestWeek')
    expect(records.bestWeek).toEqual({ value: 9_000, day: 10 })
    expect(broken.flat()).not.toContain('bestMonth')
  })

  it('keeps the biggest single deal, and breaks it with a bigger one', () => {
    const start = {
      ...emptyRecords(),
      biggestDeal: { value: 3_000, day: 1, model: 'van' as const },
    }
    const day = stats({ sales: [sale(20_000, 17_000), sale(40_000, 36_500, { model: 'truck' })] })
    const log = [dayRecord(day, 2, 50, 0)]
    const r = updateRecords(start, log, day)
    expect(r.records.biggestDeal).toEqual({ value: 3_500, day: 2, model: 'truck' })
    expect(r.broken).toContain('biggestDeal')
    const same = stats({ sales: [sale(20_000, 17_000)] })
    expect(updateRecords(start, log, same).records.biggestDeal).toBe(start.biggestDeal)
  })
})
