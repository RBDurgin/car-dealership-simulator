import { describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from './clock'
import { buildInventory } from './inventory'
import { createRng } from './rng'
import { createSave, parseSave, SAVE_VERSION } from './save'
import type { Employee } from './staff'

const employee = (id: string, extra: Partial<Employee> = {}): Employee => ({
  id,
  name: 'Sam T.',
  variant: 'female-a',
  role: 'receptionist',
  skill: 3,
  wage: 130,
  status: 'leaving',
  fired: false,
  ...extra,
})

const source = () => ({
  clock: { day: 3, minute: CLOSE_MINUTE },
  cash: 31_500,
  inventory: buildInventory(createRng(1)),
  roster: [employee('staff-1-1'), employee('staff-2-1', { fired: true })],
})

describe('save data', () => {
  it('keeps the day, cash and inventory, drops the fired and sends everyone home', () => {
    const save = createSave(source(), 123)
    expect(save).toMatchObject({ version: SAVE_VERSION, savedAt: 123, day: 3, cash: 31_500 })
    expect(save.inventory).toEqual(source().inventory)
    expect(save.roster.map((e) => [e.id, e.status])).toEqual([['staff-1-1', 'off']])
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
      inventory: save.inventory.map((car) => ({ ...car, cost: undefined })),
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v2)))
    expect(upgraded).toMatchObject({ version: SAVE_VERSION, day: 3, cash: 31_500 })
    expect(upgraded?.roster).toEqual(save.roster)
    upgraded?.inventory.forEach((car, i) => {
      expect(car).toEqual({ ...save.inventory[i], cost: Math.round((car.msrp * 0.89) / 100) * 100 })
    })
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
  })
})
