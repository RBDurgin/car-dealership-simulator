import { describe, expect, it } from 'vitest'
import { CUSTOMER_VARIANTS, STAFF_VARIANTS } from './characters'
import { createRng } from './rng'
import {
  canHire,
  generateCandidates,
  MAX_SKILL,
  MIN_SKILL,
  patienceFactor,
  payroll,
  RECEPTION_PATIENCE_FACTOR,
  reduceStaff,
  ROLES,
  wageFor,
  type Employee,
  type Role,
} from './staff'

let nextId = 1
const hand = (role: Role, over: Partial<Employee> = {}): Employee => ({
  id: `e${nextId++}`,
  name: 'Kim P.',
  variant: 'male-c',
  role,
  skill: 3,
  wage: wageFor(role, 3),
  status: 'off',
  fired: false,
  ...over,
})

describe('candidates', () => {
  it('offers every role each day, with valid skills, wages and staff-only models', () => {
    for (let day = 1; day <= 20; day++) {
      const cands = generateCandidates(createRng(day), day)
      expect(cands.length).toBeGreaterThanOrEqual(4)
      expect(cands.length).toBeLessThanOrEqual(5)
      for (const role of ROLES) expect(cands.some((c) => c.role === role)).toBe(true)
      for (const c of cands) {
        expect(c.skill).toBeGreaterThanOrEqual(MIN_SKILL)
        expect(c.skill).toBeLessThanOrEqual(MAX_SKILL)
        expect(c.wage).toBe(wageFor(c.role, c.skill))
        expect(STAFF_VARIANTS).toContain(c.variant)
        expect(CUSTOMER_VARIANTS).not.toContain(c.variant)
        expect(c.status).toBe('off')
      }
      expect(new Set(cands.map((c) => c.id)).size).toBe(cands.length)
    }
  })

  it('is deterministic for a seed and gives each day distinct ids', () => {
    expect(generateCandidates(createRng(5), 3)).toEqual(generateCandidates(createRng(5), 3))
    const a = generateCandidates(createRng(5), 3).map((c) => c.id)
    const b = generateCandidates(createRng(5), 4).map((c) => c.id)
    expect(a.some((id) => b.includes(id))).toBe(false)
  })

  it('pays more for more skill', () => {
    for (const role of ROLES) expect(wageFor(role, 5)).toBeGreaterThan(wageFor(role, 1))
  })
})

describe('hiring limits', () => {
  it('allows one receptionist and two salespeople', () => {
    expect(canHire([], 'receptionist')).toBeNull()
    expect(canHire([hand('receptionist')], 'receptionist')).toMatch(/already/)
    expect(canHire([hand('sales')], 'sales')).toBeNull()
    expect(canHire([hand('sales'), hand('sales')], 'sales')).toMatch(/2 salespeople/)
  })

  it("doesn't count someone already fired", () => {
    expect(canHire([hand('receptionist', { fired: true })], 'receptionist')).toBeNull()
  })
})

describe('payroll', () => {
  it('sums the wages of everyone still employed', () => {
    const roster = [hand('sales', { wage: 150 }), hand('porter', { wage: 75 })]
    expect(payroll(roster)).toEqual({ wages: 225, commissions: 0 })
    expect(payroll([...roster, hand('finance', { wage: 200, fired: true })]).wages).toBe(225)
    expect(payroll([])).toEqual({ wages: 0, commissions: 0 })
  })
})

describe('patienceFactor', () => {
  it('slows patience drain only while a receptionist is at the desk', () => {
    expect(patienceFactor([])).toBe(1)
    expect(patienceFactor([hand('receptionist', { status: 'arriving' })])).toBe(1)
    expect(patienceFactor([hand('sales', { status: 'atPost' })])).toBe(1)
    expect(patienceFactor([hand('receptionist', { status: 'atPost' })])).toBe(
      RECEPTION_PATIENCE_FACTOR,
    )
  })
})

describe('reduceStaff', () => {
  it('walks an employee through a working day', () => {
    const e = hand('receptionist')
    let r = reduceStaff([], { type: 'hire', employee: e, open: false })
    expect(r[0].status).toBe('off')
    r = reduceStaff(r, { type: 'open' })
    expect(r[0].status).toBe('arriving')
    r = reduceStaff(r, { type: 'atPost', id: e.id })
    expect(r[0].status).toBe('atPost')
    r = reduceStaff(r, { type: 'close' })
    expect(r[0].status).toBe('leaving')
    r = reduceStaff(r, { type: 'left', id: e.id })
    expect(r[0].status).toBe('off')
  })

  it('sends a mid-day hire straight in', () => {
    const r = reduceStaff([], { type: 'hire', employee: hand('porter'), open: true })
    expect(r[0].status).toBe('arriving')
  })

  it('ignores stale events and returns the same roster', () => {
    const r = [hand('sales', { status: 'off' }), hand('porter', { status: 'atPost' })]
    expect(reduceStaff(r, { type: 'atPost', id: r[0].id })).toBe(r)
    expect(reduceStaff(r, { type: 'left', id: r[1].id })).toBe(r)
    expect(reduceStaff(r, { type: 'left', id: 'nobody' })).toBe(r)
    expect(reduceStaff(r, { type: 'hire', employee: r[0], open: true })).toBe(r)
    const off = [hand('sales')]
    expect(reduceStaff(off, { type: 'close' })).toBe(off)
    const working = [hand('sales', { status: 'atPost' })]
    expect(reduceStaff(working, { type: 'open' })).toBe(working)
  })

  it('removes someone fired while off the lot at once', () => {
    const r = [hand('sales')]
    expect(reduceStaff(r, { type: 'fire', id: r[0].id })).toEqual([])
  })

  it('walks someone fired on shift out, then removes them', () => {
    const e = hand('receptionist', { status: 'atPost' })
    let r = reduceStaff([e], { type: 'fire', id: e.id })
    expect(r[0]).toMatchObject({ fired: true, status: 'leaving' })
    expect(reduceStaff(r, { type: 'fire', id: e.id })).toBe(r)
    // Doors opening again before they're gone doesn't bring them back.
    expect(reduceStaff(r, { type: 'open' })).toEqual([])
    r = reduceStaff(r, { type: 'left', id: e.id })
    expect(r).toEqual([])
  })

  it('sends someone still walking out back to work when the doors open', () => {
    const r = [hand('receptionist', { status: 'leaving' })]
    expect(reduceStaff(r, { type: 'open' })[0].status).toBe('arriving')
  })
})
