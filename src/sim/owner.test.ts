import { describe, expect, it } from 'vitest'
import { emptyStats, type DayStats, type Sale } from './deal'
import { buildInventory, sellCar } from './inventory'
import {
  FIRST_OWNER_DAY,
  generateGoal,
  goalLabel,
  goalProgress,
  isOwnerDay,
  judgeDay,
  OWNER_BONUS,
  OWNER_GAP_DAYS,
  type OwnerGoal,
} from './owner'
import { createRng } from './rng'

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
    expect(new Set(goals.map((g) => g.kind)).size).toBe(5)
    for (const g of goals) {
      if (g.kind === 'sales') expect(g.count).toBeGreaterThanOrEqual(2)
      if (g.kind === 'revenue') expect(g.amount % 10_000).toBe(0)
      if (g.kind === 'profit') expect(g.amount % 1_000).toBe(0)
      if (g.kind === 'model') expect(inventory.some((c) => c.model === g.model)).toBe(true)
    }
  })

  it('asks more of a bigger sales team', () => {
    const count = (staff: number) =>
      Array.from({ length: 100 }, (_, i) => generateGoal(createRng(i), inventory, staff))
        .filter((g) => g.kind === 'sales')
        .reduce((sum, g) => sum + (g.kind === 'sales' ? g.count : 0), 0)
    expect(count(2)).toBeGreaterThan(count(0))
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
  })
})

describe('goalProgress', () => {
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
})
