import { describe, expect, it } from 'vitest'
import {
  autoRota,
  countStreaks,
  courseDay,
  courseGaps,
  courseGapText,
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

type Person = Pick<Employee, 'id' | 'name' | 'role' | 'fired' | 'daysOff' | 'streak' | 'training'>

let n = 0
const person = (role: Role, extra: Partial<Person> = {}): Person => ({
  id: `staff-1-${++n}`,
  name: `P${n}`,
  role,
  fired: false,
  daysOff: [],
  streak: 0,
  training: null,
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

describe('courses', () => {
  // Day 1 is a Monday.
  const MONDAY = 1

  it('books their next working day, clear of Friday and Saturday', () => {
    expect(courseDay(person('porter'), MONDAY)).toBe(MONDAY + 1)
    expect(courseDay(person('porter', { daysOff: [1] }), MONDAY)).toBe(MONDAY + 2)
    // From a Thursday: past the busy days to Sunday.
    expect(courseDay(person('porter'), MONDAY + 3)).toBe(MONDAY + 6)
    const busyOnly = person('porter', { daysOff: [0, 1, 2, 3, 6] })
    expect(courseDay(busyOnly, MONDAY)).toBe(MONDAY + 4)
  })

  it('pays a day away on a course, and leaves them off the floor', () => {
    const away = person('porter', { training: { day: MONDAY, course: 'basic' } })
    expect(offOn([away], MONDAY)).toEqual([])
    expect(offOn([{ ...away, daysOff: [0] }], MONDAY)).toEqual([])
  })

  it('finds a role left with nobody on a course day', () => {
    const away = person('receptionist', { name: 'Dana', training: { day: 9, course: 'basic' } })
    const gaps = courseGaps([away], MONDAY)
    expect(gaps).toEqual([{ role: 'receptionist', day: 9, name: 'Dana' }])
    expect(courseGapText(gaps[0])).toBe("No receptionist on Tue 9 Jan (Dana's course)")
    // Someone else in, a day gone by, or a gap the rota leaves anyway: none.
    expect(courseGaps([away, person('receptionist')], MONDAY)).toEqual([])
    expect(courseGaps([away], 10)).toEqual([])
    expect(courseGaps([{ ...away, daysOff: [1] }], MONDAY)).toEqual([])
  })
})
