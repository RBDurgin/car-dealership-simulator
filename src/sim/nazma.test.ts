import { describe, expect, it } from 'vitest'
import { buildInventory, sellCar } from './inventory'
import {
  ARRIVAL_WINDOW,
  confrontBlocker,
  emptyNazmaStats,
  FIRST_NAZMA_DAY,
  FIRST_THEFT_DAY,
  isNazmaDay,
  isTheftNight,
  lastTheftNight,
  nazmaSummary,
  nextTarget,
  planTheft,
  planVisit,
  POACH_CHANCE,
  SMUDGE_TARGETS,
  stolenRecord,
  THEFT_CHANCE,
  THEFT_GAP_DAYS,
  theftNightAfter,
  VISIT_CHANCE,
  type NazmaVisit,
} from './nazma'
import { createRng } from './rng'
import { wageFor, type Employee, type Role } from './staff'

const inventory = buildInventory(createRng(42))
const days = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('isNazmaDay', () => {
  it('first visits on day 4, never before', () => {
    const visits = days(200).filter((d) => isNazmaDay(d, false))
    expect(visits[0]).toBe(FIRST_NAZMA_DAY)
    expect(isNazmaDay(FIRST_NAZMA_DAY, true)).toBe(true)
  })

  it('is the same for the same day', () => {
    for (const d of days(50)) expect(isNazmaDay(d, false)).toBe(isNazmaDay(d, false))
  })

  it('comes about every third day without a guard', () => {
    const later = days(1000).filter((d) => d > FIRST_NAZMA_DAY)
    const share = later.filter((d) => isNazmaDay(d, false)).length / later.length
    expect(share).toBeGreaterThan(VISIT_CHANCE - 0.06)
    expect(share).toBeLessThan(VISIT_CHANCE + 0.06)
  })

  it('comes less often with a guard, and only on days he would have anyway', () => {
    const later = days(1000).filter((d) => d > FIRST_NAZMA_DAY)
    const guarded = later.filter((d) => isNazmaDay(d, true))
    expect(guarded.length).toBeLessThan(later.filter((d) => isNazmaDay(d, false)).length * 0.6)
    for (const d of guarded) expect(isNazmaDay(d, false)).toBe(true)
  })

  it('follows the level’s first day and odds', () => {
    const later = days(1000).filter((d) => d > 7)
    const share = (chance: number) =>
      later.filter((d) => isNazmaDay(d, false, { chance, firstDay: 7 })).length / later.length
    expect(days(6).some((d) => isNazmaDay(d, false, { chance: 0.5, firstDay: 7 }))).toBe(false)
    expect(isNazmaDay(7, true, { chance: 0.5, firstDay: 7 })).toBe(true)
    expect(share(0.5)).toBeGreaterThan(VISIT_CHANCE * 0.5 - 0.05)
    expect(share(0.5)).toBeLessThan(VISIT_CHANCE * 0.5 + 0.05)
    expect(share(1.4)).toBeGreaterThan(VISIT_CHANCE * 1.4 - 0.06)
    expect(isNazmaDay(3, false, { chance: 1.4, firstDay: 3 })).toBe(true)
  })
})

describe('planVisit', () => {
  it('aims at two or three cars, lot cars first, while he is still to come', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const v = planVisit(createRng(seed), inventory)!
      expect(v.scheme).toBe('smudge')
      expect(v.status).toBe('coming')
      expect(v.progress).toBe(0)
      expect(v.targets.length).toBeGreaterThanOrEqual(SMUDGE_TARGETS.min)
      expect(v.targets.length).toBeLessThanOrEqual(SMUDGE_TARGETS.max)
      expect(new Set(v.targets).size).toBe(v.targets.length)
      const where = v.targets.map((id) => inventory.find((c) => c.id === id)!.location)
      const firstShowroom = where.indexOf('showroom')
      if (firstShowroom >= 0) expect(where.slice(firstShowroom)).not.toContain('lot')
      expect(v.arrivalMinute).toBeGreaterThanOrEqual(ARRIVAL_WINDOW.from)
      expect(v.arrivalMinute).toBeLessThanOrEqual(ARRIVAL_WINDOW.to)
      expect(v.arrivalMinute % 10).toBe(0)
    }
  })

  it('is the same for the same seed', () => {
    expect(planVisit(createRng(7), inventory)).toEqual(planVisit(createRng(7), inventory))
  })

  it('skips sold cars, and stays home with nothing to spoil', () => {
    const lot = inventory.filter((c) => c.location === 'lot')
    let inv = inventory
    for (const c of lot.slice(1)) inv = sellCar(inv, c.id)
    for (let seed = 1; seed <= 10; seed++) {
      const v = planVisit(createRng(seed), inv)!
      expect(v.targets[0]).toBe(lot[0].id)
      for (const id of v.targets) expect(inv.find((c) => c.id === id)!.status).toBe('available')
    }
    const none = inventory.reduce((acc, c) => sellCar(acc, c.id), inventory)
    expect(planVisit(createRng(1), none)).toBeNull()
  })
})

const hand = (id: string, role: Role, skill: number, over: Partial<Employee> = {}): Employee => ({
  id,
  name: id,
  variant: 'male-e',
  role,
  skill,
  wage: wageFor(role, skill),
  status: 'off',
  fired: false,
  quitting: false,
  ...over,
})

describe('planVisit with staff', () => {
  const seeds = days(400)

  it('plans the same visits as before with nobody he could poach', () => {
    const guard = [hand('g', 'security', 5), hand('f', 'sales', 4, { fired: true })]
    for (const seed of seeds.slice(0, 20)) {
      expect(planVisit(createRng(seed), inventory, guard)).toEqual(
        planVisit(createRng(seed), inventory),
      )
    }
  })

  it('sometimes comes to poach one employee, never a guard or a quitter', () => {
    const roster = [
      hand('s', 'sales', 3),
      hand('g', 'security', 5),
      hand('q', 'porter', 5, { quitting: true }),
    ]
    const visits = seeds.map((seed) => planVisit(createRng(seed), inventory, roster)!)
    const poach = visits.filter((v) => v.scheme === 'poach')
    expect(poach.length / visits.length).toBeGreaterThan(POACH_CHANCE - 0.07)
    expect(poach.length / visits.length).toBeLessThan(POACH_CHANCE + 0.07)
    const rare = seeds.filter(
      (seed) => planVisit(createRng(seed), inventory, roster, 0.5)!.scheme === 'poach',
    )
    expect(rare.length / seeds.length).toBeGreaterThan(POACH_CHANCE * 0.5 - 0.07)
    expect(rare.length / seeds.length).toBeLessThan(POACH_CHANCE * 0.5 + 0.07)
    for (const v of poach) {
      expect(v.targets).toEqual(['s'])
      expect(v).toMatchObject({ status: 'coming', progress: 0, chatting: false })
      expect(v.arrivalMinute).toBeGreaterThanOrEqual(ARRIVAL_WINDOW.from)
      expect(v.arrivalMinute).toBeLessThanOrEqual(ARRIVAL_WINDOW.to)
    }
  })

  it('goes for the seasoned staff over the green', () => {
    const roster = [hand('green', 'sales', 1), hand('pro', 'sales', 5)]
    const targets = seeds
      .map((seed) => planVisit(createRng(seed), inventory, roster)!)
      .filter((v) => v.scheme === 'poach')
      .map((v) => v.targets[0])
    expect(targets.filter((t) => t === 'pro').length).toBeGreaterThan(
      targets.filter((t) => t === 'green').length * 5,
    )
  })

  it('can still come to poach with nothing in stock to spoil', () => {
    const none = inventory.reduce((acc, c) => sellCar(acc, c.id), inventory)
    const visits = seeds.map((seed) => planVisit(createRng(seed), none, [hand('s', 'sales', 3)]))
    expect(visits.some((v) => v?.scheme === 'poach')).toBe(true)
    expect(visits.every((v) => v === null || v.scheme === 'poach')).toBe(true)
  })
})

const visit = (patch: Partial<NazmaVisit> = {}): NazmaVisit => ({
  scheme: 'smudge',
  targets: ['a', 'b'],
  arrivalMinute: 600,
  status: 'onLot',
  progress: 0,
  chatting: false,
  ...patch,
})

describe('nextTarget', () => {
  it('works through the list, then has nothing left', () => {
    expect(nextTarget(visit())).toBe('a')
    expect(nextTarget(visit({ progress: 1 }))).toBe('b')
    expect(nextTarget(visit({ progress: 2 }))).toBeNull()
  })
})

describe('confrontBlocker', () => {
  it('lets the player confront him only while he is on the lot', () => {
    expect(confrontBlocker(visit())).toBeNull()
    expect(confrontBlocker(visit({ status: 'runOff' }))).toMatch(/leaving/)
    expect(confrontBlocker(visit({ status: 'done' }))).toMatch(/leaving/)
    expect(confrontBlocker(visit({ status: 'coming' }))).toMatch(/isn't here/)
    expect(confrontBlocker(null)).toMatch(/isn't here/)
  })
})

describe('isTheftNight', () => {
  const nights = days(2000).filter((d) => isTheftNight(d))

  it('starts on day 6 at the earliest and is the same for the same day', () => {
    expect(nights[0]).toBeGreaterThanOrEqual(FIRST_THEFT_DAY)
    for (const d of days(60)) expect(isTheftNight(d)).toBe(isTheftNight(d))
  })

  it('leaves a gap between tries', () => {
    for (let i = 1; i < nights.length; i++) {
      expect(nights[i] - nights[i - 1]).toBeGreaterThanOrEqual(THEFT_GAP_DAYS)
    }
  })

  it('comes up a little less often than the raw chance, because of the gap', () => {
    const share = nights.length / (2000 - FIRST_THEFT_DAY)
    expect(share).toBeLessThan(THEFT_CHANCE)
    expect(share).toBeGreaterThan(THEFT_CHANCE / 2)
  })

  it('comes up more often at a higher chance, and the same with none given', () => {
    expect(days(2000).filter((d) => isTheftNight(d, 1))).toEqual(nights)
    const hard = days(2000).filter((d) => isTheftNight(d, 1.5))
    const easy = days(2000).filter((d) => isTheftNight(d, 0.5))
    expect(hard.length).toBeGreaterThan(nights.length)
    expect(easy.length).toBeLessThan(nights.length)
    expect(easy[0]).toBeGreaterThanOrEqual(FIRST_THEFT_DAY)
  })
})

describe('theftNightAfter', () => {
  it('matches the replay when given the last night', () => {
    for (const d of days(300)) {
      expect(theftNightAfter(d, lastTheftNight(d - 1))).toBe(isTheftNight(d))
    }
  })

  it('keeps the gap after the night given, at any chance', () => {
    for (const d of days(300)) {
      for (let gap = 1; gap < THEFT_GAP_DAYS; gap++) {
        expect(theftNightAfter(d, d - gap, 5)).toBe(false)
      }
    }
  })

  it('comes up more often at a higher chance, and never at none', () => {
    const count = (chance: number) => days(1000).filter((d) => theftNightAfter(d, 0, chance)).length
    expect(count(2)).toBeGreaterThan(count(1))
    expect(count(0)).toBe(0)
  })
})

describe('lastTheftNight', () => {
  it('is the latest theft night up to the day, or 0 before the first', () => {
    const nights = days(200).filter((d) => isTheftNight(d))
    expect(lastTheftNight(nights[0] - 1)).toBe(0)
    for (const d of days(200)) {
      const before = nights.filter((n) => n <= d)
      expect(lastTheftNight(d)).toBe(before.length > 0 ? before[before.length - 1] : 0)
    }
  })

  it('replays at the level’s chance', () => {
    const hard = days(200).filter((d) => isTheftNight(d, 1.5))
    expect(lastTheftNight(200, 1.5)).toBe(hard[hard.length - 1])
  })
})

describe('planTheft', () => {
  const night = days(200).find((d) => isTheftNight(d))!
  const quiet = days(200).find((d) => d > FIRST_THEFT_DAY && !isTheftNight(d))!
  const lot = inventory.filter((c) => c.location === 'lot')

  it('takes an available lot car on a theft night, never from the showroom', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = planTheft(createRng(seed), night, inventory, false)
      expect(t?.outcome).toBe('stolen')
      if (t?.outcome === 'stolen') expect(t.car.location).toBe('lot')
    }
    const showroomOnly = lot.reduce((acc, c) => sellCar(acc, c.id), inventory)
    expect(planTheft(createRng(1), night, showroomOnly, false)).toBeNull()
  })

  it('does nothing on a quiet night', () => {
    expect(planTheft(createRng(1), quiet, inventory, false)).toBeNull()
    expect(planTheft(createRng(1), FIRST_THEFT_DAY - 1, inventory, false)).toBeNull()
  })

  it('is foiled by a guard', () => {
    expect(planTheft(createRng(1), night, inventory, true)).toEqual({ outcome: 'foiled' })
  })

  it('goes for the pricier cars more often', () => {
    const byPrice = [...lot].sort((a, b) => a.msrp - b.msrp)
    const [cheap, dear] = [byPrice[0], byPrice[byPrice.length - 1]]
    const two = inventory.filter((c) => c.location === 'showroom' || c === cheap || c === dear)
    let dearTaken = 0
    for (let seed = 1; seed <= 400; seed++) {
      const t = planTheft(createRng(seed), night, two, false)
      if (t?.outcome === 'stolen' && t.car === dear) dearTaken++
    }
    expect(dearTaken / 400).toBeGreaterThan(0.5)
  })

  it('records what was taken', () => {
    expect(stolenRecord({ ...lot[0], floored: true })).toEqual({
      model: lot[0].model,
      cost: lot[0].cost,
      floored: true,
    })
  })
})

describe('nazmaSummary', () => {
  const stats = emptyNazmaStats()
  it('says what he got up to', () => {
    expect(nazmaSummary(stats)).toBeNull()
    const stolen = [{ model: 'suv' as const, cost: 30_000, floored: false }]
    expect(nazmaSummary({ ...stats, stolen })).toMatch(/^Stole the .+ overnight$/)
    expect(nazmaSummary({ ...stats, stolen, visited: true, smudged: 2 })).toMatch(
      /overnight; smudged 2 cars$/,
    )
    expect(nazmaSummary({ ...stats, foiled: true })).toMatch(/guard ran him off/)
    expect(nazmaSummary({ ...stats, stolen, rival: "Nazma's Motors" })).toMatch(
      /overnight \(now for sale at Nazma's Motors\)$/,
    )
    const joined = [{ name: 'Dana R.', role: 'porter' as const }]
    expect(nazmaSummary({ ...stats, joined, rival: 'N-Z Auto Outlet' })).toBe(
      'Dana R. now works for N-Z Auto Outlet',
    )
    expect(nazmaSummary({ ...stats, visited: true, smudged: 2 })).toBe('Smudged 2 cars')
    expect(nazmaSummary({ ...stats, visited: true, smudged: 1, runOff: 'player' })).toBe(
      'Run off by you (smudged 1 car first)',
    )
    expect(nazmaSummary({ ...stats, visited: true, runOff: 'guard' })).toBe(
      'Run off by your guard before he did harm',
    )
    expect(nazmaSummary({ ...stats, visited: true })).toBe('Came and went')
  })

  it('says who he poached, and who was kept with a raise', () => {
    const poached = ['Dana R.']
    expect(nazmaSummary({ ...stats, visited: true, poached })).toBe('Poached Dana R.')
    expect(
      nazmaSummary({ ...stats, visited: true, poached, kept: [{ name: 'Dana R.', raise: 25 }] }),
    ).toBe('Tried to poach Dana R.; you kept Dana R. (+$25/day)')
    expect(nazmaSummary({ ...stats, visited: true, poached, runOff: 'guard' })).toBe(
      'Run off by your guard (poached Dana R. first)',
    )
  })
})
