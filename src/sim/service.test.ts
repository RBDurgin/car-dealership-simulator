import { describe, expect, it } from 'vitest'
import { emptyCareer } from './progression'
import { createRng } from './rng'
import {
  bayCount,
  comebackChance,
  emptySchedule,
  GARAGE_BAYS,
  GARAGE_EXPANSION,
  isRateLevel,
  JOB_KINDS,
  jobMinutes,
  JOBS,
  JOBS_PER_BAY,
  LAST_SERVICE_MINUTE,
  PARTS_MARKUP,
  planServiceVisits,
  quote,
  RATE_LEVELS,
  serviceDemand,
  takeDueVisits,
  TOWN_SERVICE,
} from './service'
import { OPEN_MINUTE } from './clock'

const sold = (sales: number) => ({ ...emptyCareer(), sales })
// Day 1 is a Monday, day 7 a Sunday.
const MONDAY = 1
const THURSDAY = 4
const SUNDAY = 7
const opts = { bays: GARAGE_BAYS, rate: 'standard' as const }

describe('jobs', () => {
  it('book 30 to 150 minutes each, with a parts range and a label', () => {
    for (const kind of JOB_KINDS) {
      const { minutes, parts, label } = JOBS[kind]
      expect(minutes).toBeGreaterThanOrEqual(30)
      expect(minutes).toBeLessThanOrEqual(150)
      expect(parts.min).toBeLessThanOrEqual(parts.max)
      expect(label).not.toBe('')
    }
  })

  it('go faster with a better mechanic, at book time for a middling one', () => {
    expect(jobMinutes('brakes', 3)).toBe(JOBS.brakes.minutes)
    expect(jobMinutes('brakes', 5)).toBeLessThan(jobMinutes('brakes', 3))
    expect(jobMinutes('brakes', 1)).toBeGreaterThan(jobMinutes('brakes', 3))
  })
})

describe('quotes', () => {
  it('charge book time at the shop rate and mark the parts up', () => {
    const q = quote('brakes', 'standard', createRng(1))
    expect(q.labor).toBe(1.5 * RATE_LEVELS.standard.hourly)
    expect(q.partsCost).toBeGreaterThanOrEqual(JOBS.brakes.parts.min)
    expect(q.partsCost).toBeLessThanOrEqual(JOBS.brakes.parts.max)
    expect(q.parts).toBe(Math.round(q.partsCost * (1 + PARTS_MARKUP)))
  })

  it('cost more at a dearer rate, for the same parts', () => {
    const budget = quote('repair', 'budget', createRng(2))
    const standard = quote('repair', 'standard', createRng(2))
    const premium = quote('repair', 'premium', createRng(2))
    expect(budget.labor).toBeLessThan(standard.labor)
    expect(standard.labor).toBeLessThan(premium.labor)
    expect(budget.partsCost).toBe(premium.partsCost)
  })

  it('gross about $150–400 on a customer-pay job at the standard rate', () => {
    const rng = createRng(3)
    const gross = (['tires', 'brakes', 'repair'] as const).map((kind) => {
      const q = quote(kind, 'standard', rng)
      return q.labor + q.parts - q.partsCost
    })
    for (const g of gross) {
      expect(g).toBeGreaterThan(150)
      expect(g).toBeLessThan(500)
    }
  })

  it('know their rate levels', () => {
    expect(isRateLevel('premium')).toBe(true)
    expect(isRateLevel('free')).toBe(false)
  })
})

describe('service demand', () => {
  it('needs a garage', () => {
    expect(bayCount([])).toBe(0)
    expect(bayCount(['east-lot'])).toBe(0)
    expect(bayCount(['east-lot', GARAGE_EXPANSION])).toBe(GARAGE_BAYS)
    expect(serviceDemand(THURSDAY, sold(200), { ...opts, bays: 0 })).toBe(0)
  })

  it('rises with the cars sold over the game', () => {
    expect(serviceDemand(THURSDAY, sold(0), opts)).toBe(TOWN_SERVICE)
    expect(serviceDemand(THURSDAY, sold(200), opts)).toBeGreaterThan(
      serviceDemand(THURSDAY, sold(40), opts),
    )
  })

  it('follows the week: Monday busiest, nobody on Sunday', () => {
    const career = sold(100)
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => serviceDemand(d, career, opts))
    expect(Math.max(...week)).toBe(serviceDemand(MONDAY, career, opts))
    expect(serviceDemand(SUNDAY, career, opts)).toBe(0)
  })

  it('scales with the shop rate and the level', () => {
    const career = sold(100)
    const standard = serviceDemand(THURSDAY, career, opts)
    expect(serviceDemand(THURSDAY, career, { ...opts, rate: 'budget' })).toBeGreaterThan(standard)
    expect(serviceDemand(THURSDAY, career, { ...opts, rate: 'premium' })).toBeLessThan(standard)
    expect(serviceDemand(THURSDAY, career, { ...opts, factor: 0.8 })).toBeCloseTo(standard * 0.8)
  })

  it('is capped by the bays', () => {
    expect(serviceDemand(MONDAY, sold(10_000), opts)).toBe(GARAGE_BAYS * JOBS_PER_BAY)
  })
})

describe('service visits', () => {
  it('plan nothing when none are expected', () => {
    expect(planServiceVisits(createRng(1), 0)).toEqual(emptySchedule())
  })

  it('plan about the expected number within opening hours, in order', () => {
    const plan = planServiceVisits(createRng(4), 5)
    expect(plan.minutes).toHaveLength(5)
    expect(plan.kinds).toHaveLength(5)
    expect([...plan.minutes].sort((a, b) => a - b)).toEqual(plan.minutes)
    for (const m of plan.minutes) {
      expect(m).toBeGreaterThanOrEqual(OPEN_MINUTE)
      expect(m).toBeLessThanOrEqual(LAST_SERVICE_MINUTE)
    }
    for (const kind of plan.kinds) expect(['oil', 'tires', 'brakes', 'repair']).toContain(kind)
  })

  it('roll the fraction', () => {
    const counts = new Set(
      Array.from({ length: 40 }, (_, i) => planServiceVisits(createRng(i), 2.5).minutes.length),
    )
    expect(counts).toEqual(new Set([2, 3]))
  })

  it('are deterministic per seed', () => {
    expect(planServiceVisits(createRng(9), 4)).toEqual(planServiceVisits(createRng(9), 4))
  })

  it('are released as they fall due, once each', () => {
    const plan = planServiceVisits(createRng(5), 4)
    const first = takeDueVisits(plan, plan.minutes[1])
    expect(first.due).toEqual(plan.kinds.slice(0, 2))
    const again = takeDueVisits(first.schedule, plan.minutes[1])
    expect(again.due).toEqual([])
    expect(again.schedule).toBe(first.schedule)
    expect(takeDueVisits(first.schedule, LAST_SERVICE_MINUTE).due).toEqual(plan.kinds.slice(2))
  })
})

describe('comebacks', () => {
  it('are about 15% at skill 1 and 2% at skill 5, falling with skill', () => {
    expect(comebackChance(1)).toBeCloseTo(0.15)
    expect(comebackChance(5)).toBeCloseTo(0.02)
    for (let s = 1; s < 5; s++) expect(comebackChance(s + 1)).toBeLessThan(comebackChance(s))
    expect(comebackChance(9)).toBeCloseTo(0.02)
  })
})
