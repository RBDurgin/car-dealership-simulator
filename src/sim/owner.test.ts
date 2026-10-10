import { describe, expect, it } from 'vitest'
import { emptyStats, type DayStats, type Sale } from './deal'
import { buildInventory, sellCar } from './inventory'
import {
  FIRST_OWNER_DAY,
  EVENT_SALES_EXTRA,
  generateGoal,
  goalLabel,
  goalProgress,
  isOwnerDay,
  judgeDay,
  OWNER_BONUS,
  OWNER_GAP_DAYS,
  type OwnerGoal,
} from './owner'
import { MAX_DAILY_CHANGE, REPUTATION_POINTS } from './reputation'
import { createRng } from './rng'
import { emptyServiceStats } from './service'

const inventory = buildInventory(createRng(42))
const formatMoney = (n: number) => `$${n.toLocaleString('en-US')}`

const sale = (model: Sale['model'], price: number): Sale => ({
  customerName: 'Alex B.',
  carId: 'lot-car-1',
  model,
  price,
  msrp: price,
  cost: price - 4_000,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
})

const withSales = (...sales: Sale[]): DayStats => ({ ...emptyStats(), sales })

describe('isOwnerDay', () => {
  it('first visits on day 2, then every two or three days', () => {
    const visits = Array.from({ length: 60 }, (_, i) => i + 1).filter(isOwnerDay)
    expect(visits[0]).toBe(FIRST_OWNER_DAY)
    for (let i = 1; i < visits.length; i++) {
      const gap = visits[i] - visits[i - 1]
      expect(gap).toBeGreaterThanOrEqual(OWNER_GAP_DAYS.min)
      expect(gap).toBeLessThanOrEqual(OWNER_GAP_DAYS.max)
    }
    // Both gaps turn up.
    const gaps = new Set(visits.slice(1).map((v, i) => v - visits[i]))
    expect(gaps.size).toBe(2)
    expect(isOwnerDay(1)).toBe(false)
  })
})

describe('generateGoal', () => {
  it('rolls every kind of goal, each sensible', () => {
    const goals = Array.from({ length: 200 }, (_, i) => generateGoal(createRng(i), inventory, 0))
    expect(new Set(goals.map((g) => g.kind)).size).toBe(6)
    for (const g of goals) {
      if (g.kind === 'sales') expect(g.count).toBeGreaterThanOrEqual(2)
      if (g.kind === 'revenue') expect(g.amount % 10_000).toBe(0)
      if (g.kind === 'profit') expect(g.amount % 1_000).toBe(0)
      if (g.kind === 'model') expect(inventory.some((c) => c.model === g.model)).toBe(true)
      if (g.kind === 'reputation') expect(g.points).toBeGreaterThanOrEqual(3)
    }
  })

  it('never asks for more reputation than a day can earn', () => {
    for (let i = 0; i < 100; i++) {
      const g = generateGoal(createRng(i), inventory, 6)
      if (g.kind === 'reputation') expect(g.points).toBeLessThanOrEqual(MAX_DAILY_CHANGE)
    }
  })

  it('asks more of a bigger sales team', () => {
    const count = (staff: number) =>
      Array.from({ length: 100 }, (_, i) => generateGoal(createRng(i), inventory, staff))
        .filter((g) => g.kind === 'sales')
        .reduce((sum, g) => sum + (g.kind === 'sales' ? g.count : 0), 0)
    expect(count(2)).toBeGreaterThan(count(0))
  })

  it('sets more and bigger sales goals on a sale weekend', () => {
    const goals = (onSale: boolean) =>
      Array.from({ length: 200 }, (_, i) => generateGoal(createRng(i), inventory, 1, onSale))
    const sales = (onSale: boolean) => goals(onSale).filter((g) => g.kind === 'sales')
    expect(sales(true).length).toBeGreaterThan(sales(false).length)
    for (const g of sales(true)) {
      if (g.kind === 'sales') expect(g.count).toBeGreaterThanOrEqual(2 + 1 + EVENT_SALES_EXTRA)
    }
  })

  it('asks for service jobs only with the garage open, more with more bays', () => {
    const goals = (bays: number) =>
      Array.from({ length: 200 }, (_, i) => generateGoal(createRng(i), inventory, 1, false, bays))
    expect(goals(0).some((g) => g.kind === 'serviced')).toBe(false)
    // Without a garage, the day's goal rolls as it always did.
    expect(goals(0)).toEqual(
      Array.from({ length: 200 }, (_, i) => generateGoal(createRng(i), inventory, 1)),
    )
    const counts = goals(2).flatMap((g) => (g.kind === 'serviced' ? [g.count] : []))
    expect(counts.length).toBeGreaterThan(0)
    expect(new Set(counts)).toEqual(new Set([3, 4]))
  })

  it("never asks for a body type that isn't for sale", () => {
    const empty = inventory.reduce((inv, c) => sellCar(inv, c.id), inventory)
    for (let i = 0; i < 50; i++) {
      expect(generateGoal(createRng(i), empty, 0).kind).not.toBe('model')
    }
  })
})

describe('goalLabel', () => {
  it('reads like an instruction', () => {
    expect(goalLabel({ kind: 'sales', count: 2 }, formatMoney)).toBe('Sell 2 cars')
    expect(goalLabel({ kind: 'model', model: 'suv' }, formatMoney)).toBe('Sell a Summit Ridge')
    expect(goalLabel({ kind: 'noImpatient' }, formatMoney)).toBe('No impatient walk-outs')
    expect(goalLabel({ kind: 'revenue', amount: 80_000 }, formatMoney)).toBe('$80,000 revenue')
    expect(goalLabel({ kind: 'profit', amount: 8_000 }, formatMoney)).toBe('$8,000 gross profit')
    expect(goalLabel({ kind: 'reputation', points: 4 }, formatMoney)).toBe('Gain 4 reputation')
  })
})

describe('goalProgress', () => {
  it('counts finished service jobs toward a service goal', () => {
    const goal: OwnerGoal = { kind: 'serviced', count: 3 }
    const stats = (jobs: number) => ({
      ...emptyStats(),
      service: { ...emptyServiceStats(), jobs },
    })
    expect(goalProgress(goal, stats(2))).toEqual({ current: 2, target: 3, met: false })
    expect(goalProgress(goal, stats(3)).met).toBe(true)
    expect(goalLabel(goal, String)).toBe('Finish 3 service jobs')
  })

  it('counts sales toward a sales goal', () => {
    const goal: OwnerGoal = { kind: 'sales', count: 2 }
    expect(goalProgress(goal, withSales(sale('van', 30_000)))).toEqual({
      current: 1,
      target: 2,
      met: false,
    })
    expect(goalProgress(goal, withSales(sale('van', 1), sale('suv', 1))).met).toBe(true)
  })

  it('wants the right body type', () => {
    const goal: OwnerGoal = { kind: 'model', model: 'suv' }
    expect(goalProgress(goal, withSales(sale('van', 1))).met).toBe(false)
    expect(goalProgress(goal, withSales(sale('van', 1), sale('suv', 1))).met).toBe(true)
  })

  it('adds up revenue', () => {
    const goal: OwnerGoal = { kind: 'revenue', amount: 60_000 }
    expect(goalProgress(goal, withSales(sale('van', 35_000))).current).toBe(35_000)
    expect(goalProgress(goal, withSales(sale('van', 35_000), sale('suv', 25_000))).met).toBe(true)
  })

  it('adds up gross profit', () => {
    const goal: OwnerGoal = { kind: 'profit', amount: 7_000 }
    expect(goalProgress(goal, withSales(sale('van', 35_000))).current).toBe(4_000)
    expect(goalProgress(goal, withSales(sale('van', 35_000), sale('suv', 25_000))).met).toBe(true)
    const serviced = {
      ...withSales(sale('van', 35_000)),
      service: { ...emptyServiceStats(), labor: 600 },
    }
    expect(goalProgress(goal, serviced).current).toBe(4_600)
  })

  it('is met until somebody walks out impatient', () => {
    const goal: OwnerGoal = { kind: 'noImpatient' }
    expect(goalProgress(goal, { ...emptyStats(), refused: 3, closing: 1 }).met).toBe(true)
    expect(goalProgress(goal, { ...emptyStats(), impatient: 1 })).toEqual({
      current: 1,
      target: 0,
      met: false,
    })
  })

  it('tracks the day’s reputation change, walk-outs and all', () => {
    const goal: OwnerGoal = { kind: 'reputation', points: 3 }
    const twoSales = withSales(sale('van', 1), sale('suv', 1))
    expect(goalProgress(goal, twoSales)).toEqual({
      current: 2 * REPUTATION_POINTS.sale,
      target: 3,
      met: true,
    })
    expect(goalProgress(goal, { ...twoSales, impatient: 1 }).met).toBe(false)
    // On Easy the walk-out costs less, so the goal holds.
    expect(goalProgress(goal, { ...twoSales, impatient: 1 }, { gain: 1, loss: 0.6 }).met).toBe(true)
  })
})

describe('judgeDay', () => {
  it('pays a bonus for a goal met, and nothing but a grumble for one missed', () => {
    const goal: OwnerGoal = { kind: 'sales', count: 1 }
    const met = judgeDay(goal, withSales(sale('van', 1)), 4)
    expect(met).toMatchObject({ goal, met: true, bonus: OWNER_BONUS })
    const missed = judgeDay(goal, emptyStats(), 4)
    expect(missed).toMatchObject({ goal, met: false, bonus: 0 })
    expect(missed.line).not.toBe(met.line)
  })

  it('pays the level’s bonus, rounded to $100', () => {
    const goal: OwnerGoal = { kind: 'sales', count: 1 }
    const day = withSales(sale('van', 1))
    expect(judgeDay(goal, day, 4, 1).bonus).toBe(OWNER_BONUS)
    expect(judgeDay(goal, day, 4, 1.33).bonus).toBe(2_000)
    expect(judgeDay(goal, day, 4, 0.67).bonus).toBe(1_000)
    expect(judgeDay(goal, emptyStats(), 4, 1.33).bonus).toBe(0)
  })
})
