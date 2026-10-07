import { describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from './clock'
import type { OwnedImprovement } from './improvements'
import { buildInventory } from './inventory'
import type { Campaign } from './marketing'
import type { Order } from './ordering'
import { START_REPUTATION } from './reputation'
import { ALL_SLOTS } from './ordering'
import { monthlyQuota } from './quota'
import { createRng } from './rng'
import { createSave, parseSave, SAVE_VERSION } from './save'
import type { Employee } from './staff'

const employee = (id: string, extra: Partial<Employee> = {}): Employee => ({
  id,
  name: 'Sam T.',
  variant: 'female-e',
  role: 'receptionist',
  skill: 3,
  wage: 130,
  status: 'leaving',
  fired: false,
  quitting: false,
  ...extra,
})

const source = () => ({
  clock: { day: 3, minute: CLOSE_MINUTE },
  cash: 31_500,
  inventory: buildInventory(createRng(1)),
  roster: [employee('staff-1-1'), employee('staff-2-1', { fired: true })],
  orders: [order],
  campaigns: [campaign, expired],
  improvements: [improvement],
  reputation: 62,
  // As a v8 save upgrades, so the older upgrades compare equal.
  monthSales: { count: 0, msrp: 0 },
  quota: monthlyQuota(0, ALL_SLOTS.length, 62),
  // As a v9 save upgrades, so the older upgrades compare equal.
  difficulty: 'medium' as const,
})

const order: Order = {
  id: 'order-3-1',
  model: 'truck',
  cost: 45_800,
  financing: 'floor',
  slot: { location: 'lot', index: 2 },
  day: 3,
}

// Bought on day 3, running days 4–6; and one that ended today.
const campaign: Campaign = { id: 'tv-3-1', channel: 'tv', startDay: 4, endDay: 6 }
const improvement: OwnedImprovement = { id: 'tube-man', day: 3 }
const expired: Campaign = { id: 'online-1-1', channel: 'online', startDay: 1, endDay: 3 }

describe('save data', () => {
  it('keeps the day, cash and inventory, drops the fired and sends everyone home', () => {
    const save = createSave(source(), 123)
    expect(save).toMatchObject({ version: SAVE_VERSION, savedAt: 123, day: 3, cash: 31_500 })
    expect(save.inventory).toEqual(source().inventory)
    expect(save.roster.map((e) => [e.id, e.status])).toEqual([['staff-1-1', 'off']])
    expect(save.orders).toEqual([order])
  })

  it('keeps only the ad campaigns that carry on tomorrow', () => {
    expect(createSave(source(), 123).campaigns).toEqual([campaign])
  })

  it('round-trips through JSON', () => {
    const save = createSave(source(), 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save)
  })

  it('upgrades a version 2 save, costing each car from its MSRP', () => {
    const save = createSave(source(), 123)
    const v2 = {
      ...save,
      version: 2,
      orders: undefined,
      campaigns: undefined,
      improvements: undefined,
      reputation: undefined,
      inventory: save.inventory.map((car) => ({
        ...car,
        cost: undefined,
        arrivedDay: undefined,
        floored: undefined,
      })),
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v2)))
    expect(upgraded).toMatchObject({
      version: SAVE_VERSION,
      day: 3,
      cash: 31_500,
      orders: [],
      campaigns: [],
      improvements: [],
      reputation: START_REPUTATION,
    })
    expect(upgraded?.roster).toEqual(save.roster)
    upgraded?.inventory.forEach((car, i) => {
      expect(car).toEqual({ ...save.inventory[i], cost: Math.round((car.msrp * 0.89) / 100) * 100 })
    })
  })

  it('upgrades a version 3 save: opening stock, owned outright, and no orders', () => {
    const save = createSave(source(), 123)
    const v3 = {
      ...save,
      version: 3,
      orders: undefined,
      campaigns: undefined,
      improvements: undefined,
      reputation: undefined,
      inventory: save.inventory.map((car) => ({
        ...car,
        arrivedDay: undefined,
        floored: undefined,
      })),
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v3)))
    expect(upgraded).toEqual({
      ...save,
      orders: [],
      campaigns: [],
      improvements: [],
      reputation: START_REPUTATION,
    })
  })

  it('upgrades a version 4 save with no ad campaigns', () => {
    const save = createSave(source(), 123)
    const v4 = {
      ...save,
      version: 4,
      campaigns: undefined,
      improvements: undefined,
      reputation: undefined,
    }
    expect(parseSave(JSON.parse(JSON.stringify(v4)))).toEqual({
      ...save,
      campaigns: [],
      improvements: [],
      reputation: START_REPUTATION,
    })
  })

  it('upgrades a version 5 save with no improvements', () => {
    const save = createSave(source(), 123)
    const v5 = { ...save, version: 5, improvements: undefined, reputation: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v5)))).toEqual({
      ...save,
      improvements: [],
      reputation: START_REPUTATION,
    })
  })

  it('upgrades a version 6 save to the starting reputation', () => {
    const save = createSave(source(), 123)
    const v6 = { ...save, version: 6, reputation: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v6)))).toEqual({
      ...save,
      reputation: START_REPUTATION,
    })
  })

  it('upgrades a version 7 save: nobody is thinking of quitting', () => {
    const save = createSave(source(), 123)
    const v7 = {
      ...save,
      version: 7,
      roster: save.roster.map((e) => ({ ...e, quitting: undefined })),
    }
    expect(parseSave(JSON.parse(JSON.stringify(v7)))).toEqual(save)
  })

  it('upgrades a version 8 save: the month starts afresh, with a target from reputation', () => {
    const save = createSave(source(), 123)
    const v8 = { ...save, version: 8, monthSales: undefined, quota: undefined }
    expect(save.quota).toBeGreaterThan(0)
    expect(parseSave(JSON.parse(JSON.stringify(v8)))).toEqual({
      ...save,
      monthSales: { count: 0, msrp: 0 },
      quota: monthlyQuota(0, ALL_SLOTS.length, 62),
    })
  })

  it('upgrades a version 9 save to Medium', () => {
    const save = createSave({ ...source(), difficulty: 'hard' }, 123)
    const v9 = { ...save, version: 9, difficulty: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v9)))).toEqual({ ...save, difficulty: 'medium' })
  })

  it('keeps the difficulty level, and rejects one it doesn’t know', () => {
    const save = createSave({ ...source(), difficulty: 'easy' }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.difficulty).toBe('easy')
    expect(parseSave({ ...save, difficulty: 'nightmare' })).toBeNull()
    expect(parseSave({ ...save, difficulty: undefined })).toBeNull()
  })

  it('keeps the month’s sales and quota', () => {
    const monthSales = { count: 5, msrp: 180_000 }
    expect(createSave({ ...source(), monthSales, quota: 16 }, 123)).toMatchObject({
      monthSales: { count: 5, msrp: 180_000 },
      quota: 16,
    })
  })

  it('dresses staff in a dropped model in one still in use, and guards in uniform', () => {
    const save = createSave(source(), 123)
    const roster = [
      { ...save.roster[0], variant: 'female-a' },
      { ...save.roster[0], id: 'staff-1-2', variant: 'male-c' },
      { ...save.roster[0], id: 'staff-1-3', role: 'security', variant: 'female-e' },
    ]
    const loaded = parseSave(JSON.parse(JSON.stringify({ ...save, roster })))
    expect(loaded?.roster.map((e) => e.variant)).toEqual(['male-e', 'male-e', 'male-c'])
  })

  it('saves nobody as thinking of quitting', () => {
    const s = source()
    const save = createSave({ ...s, roster: [employee('staff-1-1', { quitting: true })] }, 123)
    expect(save.roster[0].quitting).toBe(false)
  })

  it('keeps the reputation', () => {
    expect(createSave(source(), 123).reputation).toBe(62)
  })

  it('keeps every improvement bought, including today’s', () => {
    expect(createSave(source(), 123).improvements).toEqual([improvement])
  })

  it('rejects anything that is not a save of this version', () => {
    const save = createSave(source(), 123)
    expect(parseSave(null)).toBeNull()
    expect(parseSave('save')).toBeNull()
    expect(parseSave({ ...save, version: SAVE_VERSION + 1 })).toBeNull()
    expect(parseSave({ ...save, cash: undefined })).toBeNull()
    expect(parseSave({ ...save, day: 0 })).toBeNull()
    expect(parseSave({ ...save, inventory: [{ id: 'x' }] })).toBeNull()
    // A car saved before cars got dirty (version 1).
    const { cleanliness: _, ...unwashed } = save.inventory[0]
    expect(parseSave({ ...save, inventory: [unwashed] })).toBeNull()
    expect(parseSave({ ...save, version: 1 })).toBeNull()
    const { cost: __, ...uncosted } = save.inventory[0]
    expect(parseSave({ ...save, inventory: [uncosted] })).toBeNull()
    expect(parseSave({ ...save, roster: 'nobody' })).toBeNull()
    expect(parseSave({ ...save, roster: [{ ...save.roster[0], role: 'janitor' }] })).toBeNull()
    const guard = { ...save.roster[0], role: 'security' }
    expect(parseSave({ ...save, roster: [guard] })?.roster).toEqual([guard])
    expect(parseSave({ ...save, orders: undefined })).toBeNull()
    expect(parseSave({ ...save, orders: [{ ...order, financing: 'lease' }] })).toBeNull()
    expect(
      parseSave({ ...save, orders: [{ ...order, slot: { location: 'lot', index: 27 } }] }),
    ).toBeNull()
    const { floored: ___, ...unfloored } = save.inventory[0]
    expect(parseSave({ ...save, inventory: [unfloored] })).toBeNull()
    expect(parseSave({ ...save, campaigns: undefined })).toBeNull()
    expect(parseSave({ ...save, campaigns: [{ ...campaign, channel: 'blimp' }] })).toBeNull()
    expect(parseSave({ ...save, improvements: undefined })).toBeNull()
    expect(parseSave({ ...save, improvements: [{ id: 'statue', day: 2 }] })).toBeNull()
    expect(parseSave({ ...save, reputation: undefined })).toBeNull()
    expect(parseSave({ ...save, reputation: 101 })).toBeNull()
    expect(parseSave({ ...save, reputation: -1 })).toBeNull()
    expect(parseSave({ ...save, monthSales: undefined })).toBeNull()
    expect(parseSave({ ...save, monthSales: { count: 1 } })).toBeNull()
    expect(parseSave({ ...save, quota: 0 })).toBeNull()
  })
})
