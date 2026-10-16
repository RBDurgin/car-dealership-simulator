import { describe, expect, it } from 'vitest'
import {
  autoRota,
  countStreaks,
  coverageGaps,
  FULL_DAYS,
  gapText,
  offNotice,
  offOn,
  rotaForHire,
  SHOP_SHUT,
  toggleDayOff,
} from './rota'
import type { Employee, Role } from './staff'

type Person = Pick<Employee, 'id' | 'name' | 'role' | 'fired' | 'daysOff' | 'streak'>

let n = 0
const person = (role: Role, extra: Partial<Person> = {}): Person => ({
  id: `staff-1-${++n}`,
  name: `P${n}`,
  role,
  fired: false,
  daysOff: [],
  streak: 0,
  ...extra,
})

const FRIDAY = 4
const SATURDAY = 5
const SUNDAY = 6

describe('autoRota', () => {
  it('gives each a day off on a quiet day, spread over the week', () => {
    const roster = autoRota([person('receptionist'), person('finance'), person('porter')])
    expect(roster.map((e) => e.daysOff)).toEqual([[SUNDAY], [0], [1]])
  })

  it('keeps Friday and Saturday full', () => {
    expect(FULL_DAYS).toEqual([FRIDAY, SATURDAY])
    const roster = autoRota([
      ...Array.from({ length: 4 }, () => person('sales')),
      person('receptionist'),
      person('finance'),
      person('porter'),
      person('porter'),
      person('security'),
    ])
    for (const e of roster) {
      expect(e.daysOff).not.toContain(FRIDAY)
      expect(e.daysOff).not.toContain(SATURDAY)
    }
  })

  it('keeps a role with two or more covered every day, two days off each with spare cover', () => {
    const two = autoRota([person('sales'), person('sales')])
    expect(two.map((e) => e.daysOff.length)).toEqual([1, 1])
    expect(coverageGaps(two)).toEqual([])
    const four = autoRota(Array.from({ length: 4 }, () => person('sales')))
    expect(four.map((e) => e.daysOff.length)).toEqual([2, 2, 2, 2])
    expect(coverageGaps(four)).toEqual([])
  })

  it('gives the garage’s staff the days it’s shut, which leave no gap', () => {
    expect(SHOP_SHUT).toEqual([SUNDAY])
    const roster = autoRota([person('mechanic'), person('mechanic'), person('advisor')])
    expect(roster.map((e) => e.daysOff)).toEqual([[SUNDAY], [SUNDAY], [SUNDAY]])
    expect(coverageGaps(roster)).toEqual([])
  })

  it('leaves the let-go alone, and returns the same roster when nothing changes', () => {
    const gone = person('sales', { fired: true })
    const roster = autoRota([gone, person('sales')])
    expect(roster[0]).toBe(gone)
    expect(autoRota(roster)).toBe(roster)
  })

  it('fits a new hire round everyone else', () => {
    const roster = autoRota([person('receptionist'), person('sales')])
    expect(rotaForHire(roster, { role: 'sales' })).not.toEqual(roster[1].daysOff)
    expect(rotaForHire(roster, { role: 'mechanic' })).toEqual([SUNDAY])
  })
})

describe('coverage', () => {
  it('names the days a role has nobody in', () => {
    const roster = [person('sales', { daysOff: [1] }), person('sales', { daysOff: [1, 2] })]
    const gaps = coverageGaps(roster)
    expect(gaps).toEqual([{ role: 'sales', weekday: 1 }])
    expect(gapText(gaps[0])).toBe('No salesperson on Tuesday')
    expect(coverageGaps([person('mechanic', { daysOff: [0, SUNDAY] })])).toEqual([
      { role: 'mechanic', weekday: 0 },
    ])
  })

  it('toggles a day off, and lists who’s off on a day', () => {
    expect(toggleDayOff([3], 1)).toEqual([1, 3])
    expect(toggleDayOff([1, 3], 1)).toEqual([3])
    const roster = [
      person('sales', { daysOff: [1] }),
      person('porter', { daysOff: [1], fired: true }),
    ]
    // Day 2 is a Tuesday.
    expect(offOn(roster, 2)).toEqual([roster[0]])
    expect(offOn(roster, 3)).toEqual([])
  })
})

describe('streaks', () => {
  it('counts days worked on and resets on a day off', () => {
    const a = person('sales', { streak: 6 })
    const b = person('porter', { streak: 4 })
    const c = person('porter', { streak: 2, fired: true })
    const next = countStreaks([a, b, c], [b.id])
    expect(next.map((e) => e.streak)).toEqual([7, 0, 2])
    expect(countStreaks([b], [b.id]).map((e) => e.streak)).toEqual([0])
    const rested = [person('sales', { streak: 0 })]
    expect(countStreaks(rested, [rested[0].id])).toBe(rested)
  })

  it('says who has the day off', () => {
    expect(offNotice([])).toBeNull()
    expect(offNotice([{ name: 'Ana' }])).toBe('Ana has the day off.')
    expect(offNotice([{ name: 'Ana' }, { name: 'Bo' }, { name: 'Cy' }])).toBe(
      'Ana, Bo and Cy have the day off.',
    )
  })
})
