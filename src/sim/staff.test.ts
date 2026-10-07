import { describe, expect, it } from 'vitest'
import { CUSTOMER_VARIANTS, GUARD_VARIANT, STAFF_VARIANTS } from './characters'
import { DESK_CHAIR_ID, RECEPTION_CHAIR_ID, SALES_DESKS } from './layout'
import { createRng } from './rng'
import {
  canHire,
  FINANCE_FEE,
  FINANCE_SECONDS,
  financeOnDuty,
  financeSeconds,
  generateCandidates,
  isGuarded,
  isPoachable,
  MAX_SKILL,
  MIN_COMMISSION,
  MIN_SKILL,
  patienceFactor,
  payroll,
  postChairId,
  salesCommission,
  salesDeskOf,
  skillSeconds,
  RECEPTION_PATIENCE_FACTOR,
  reduceStaff,
  retentionRaise,
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
  quitting: false,
  ...over,
})

describe('candidates', () => {
  it('offers every role each day, with valid skills, wages and staff-only models', () => {
    for (let day = 1; day <= 20; day++) {
      const cands = generateCandidates(createRng(day), day)
      expect(cands.length).toBeGreaterThanOrEqual(ROLES.length)
      expect(cands.length).toBeLessThanOrEqual(ROLES.length + 1)
      for (const role of ROLES) expect(cands.some((c) => c.role === role)).toBe(true)
      for (const c of cands) {
        expect(c.skill).toBeGreaterThanOrEqual(MIN_SKILL)
        expect(c.skill).toBeLessThanOrEqual(MAX_SKILL)
        expect(c.wage).toBe(wageFor(c.role, c.skill))
        expect(STAFF_VARIANTS).toContain(c.variant)
        expect(CUSTOMER_VARIANTS).not.toContain(c.variant)
        expect(c.variant === GUARD_VARIANT).toBe(c.role === 'security')
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
    expect(payroll(roster, [])).toEqual({ wages: 225, commissions: 0 })
    expect(payroll([...roster, hand('finance', { wage: 200, fired: true })], []).wages).toBe(225)
    expect(payroll([], [])).toEqual({ wages: 0, commissions: 0 })
  })

  it("adds up what staff earned on the day's sales", () => {
    const sale = {
      customerName: 'A',
      carId: 'x',
      model: 'sedan' as const,
      price: 30_000,
      msrp: 30_000,
      cost: 27_000,
      minute: 600,
      soldBy: null,
      source: 'regular' as const,
    }
    const sales = [
      { ...sale, signedBy: null, commission: 0 },
      { ...sale, signedBy: 'Jordan K.', commission: FINANCE_FEE },
      { ...sale, signedBy: 'Jordan K.', commission: FINANCE_FEE },
    ]
    expect(payroll([], sales).commissions).toBe(2 * FINANCE_FEE)
  })

  it("pays salespeople a quarter of the sale's gross, never less than a mini", () => {
    expect(salesCommission(30_000, 27_000)).toBe(750)
    expect(salesCommission(30_000, 29_800)).toBe(MIN_COMMISSION)
    // Sold at a loss still pays the mini.
    expect(salesCommission(30_000, 31_000)).toBe(MIN_COMMISSION)
  })
})

describe('finance', () => {
  it('takes about 6 seconds a deal, quicker with skill', () => {
    expect(financeSeconds(3)).toBe(FINANCE_SECONDS)
    expect(financeSeconds(1)).toBeGreaterThan(financeSeconds(3))
    expect(financeSeconds(5)).toBeLessThan(financeSeconds(3))
    expect(financeSeconds(5)).toBeGreaterThan(0)
  })

  it('is on duty only on shift and not let go', () => {
    expect(financeOnDuty([])).toBeNull()
    expect(financeOnDuty([hand('finance', { status: 'atPost' })])).not.toBeNull()
    expect(financeOnDuty([hand('finance', { status: 'arriving' })])).not.toBeNull()
    for (const status of ['off', 'leaving'] as const) {
      expect(financeOnDuty([hand('finance', { status })])).toBeNull()
    }
    expect(financeOnDuty([hand('finance', { status: 'atPost', fired: true })])).toBeNull()
    expect(financeOnDuty([hand('sales', { status: 'atPost' })])).toBeNull()
  })
})

describe('sales desks', () => {
  it('hands out a desk each to the salespeople on the lot, in hiring order', () => {
    const a = hand('sales', { status: 'atPost' })
    const b = hand('sales', { status: 'arriving' })
    const home = hand('sales', { status: 'off' })
    const fm = hand('finance', { status: 'atPost' })
    const roster = [home, fm, a, b]
    expect(salesDeskOf(roster, a.id)).toBe(SALES_DESKS[0])
    expect(salesDeskOf(roster, b.id)).toBe(SALES_DESKS[1])
    expect(salesDeskOf(roster, home.id)).toBeNull()
    expect(salesDeskOf(roster, fm.id)).toBeNull()
    // A third (one let go, still finishing up) has no desk.
    const c = hand('sales', { status: 'atPost' })
    expect(salesDeskOf([...roster, c], c.id)).toBeNull()
  })

  it('gives every role its chair to work from', () => {
    const a = hand('sales', { status: 'atPost' })
    expect(postChairId(a, [a])).toBe(SALES_DESKS[0].chairId)
    expect(postChairId(hand('finance'), [])).toBe(DESK_CHAIR_ID)
    expect(postChairId(hand('receptionist'), [])).toBe(RECEPTION_CHAIR_ID)
    expect(postChairId(hand('porter'), [])).toBeNull()
  })

  it('scales task times by skill', () => {
    expect(skillSeconds(4, 3)).toBe(4)
    expect(skillSeconds(4, 1)).toBeGreaterThan(skillSeconds(4, 5))
    expect(skillSeconds(4, 5)).toBeGreaterThan(0)
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

describe('isGuarded', () => {
  it('is true with a security guard on the payroll who has not been let go', () => {
    expect(isGuarded([hand('sales'), hand('porter')])).toBe(false)
    expect(isGuarded([hand('security')])).toBe(true)
    expect(isGuarded([hand('security', { status: 'atPost' })])).toBe(true)
    expect(isGuarded([hand('security', { fired: true })])).toBe(false)
  })

  it('pays a guard more as their skill goes up', () => {
    expect(wageFor('security', 1)).toBe(100)
    expect(wageFor('security', 5)).toBe(180)
  })
})

describe('poaching', () => {
  it('only targets staff on the payroll, not guards or anyone already quitting', () => {
    expect(isPoachable(hand('sales'))).toBe(true)
    expect(isPoachable(hand('porter'))).toBe(true)
    expect(isPoachable(hand('security'))).toBe(false)
    expect(isPoachable(hand('sales', { fired: true }))).toBe(false)
    expect(isPoachable(hand('sales', { quitting: true }))).toBe(false)
  })

  it('has someone at work think of quitting, but not a guard or someone off shift', () => {
    const e = hand('sales', { status: 'atPost' })
    const r = reduceStaff([e], { type: 'poached', id: e.id })
    expect(r[0].quitting).toBe(true)
    expect(reduceStaff(r, { type: 'poached', id: e.id })).toBe(r)
    const guard = [hand('security', { status: 'atPost' })]
    expect(reduceStaff(guard, { type: 'poached', id: guard[0].id })).toBe(guard)
    const off = [hand('sales')]
    expect(reduceStaff(off, { type: 'poached', id: off[0].id })).toBe(off)
  })

  it('keeps a quitter with a raise, and ignores a keep for anyone else', () => {
    const e = hand('sales', { status: 'atPost', quitting: true })
    const r = reduceStaff([e], { type: 'keep', id: e.id, wage: e.wage + 36 })
    expect(r[0]).toMatchObject({ quitting: false, wage: e.wage + 36 })
    expect(reduceStaff(r, { type: 'keep', id: e.id, wage: 999 })).toBe(r)
  })

  it('sends a quitter home for good at closing, still paid for the day', () => {
    const q = hand('sales', { status: 'atPost', quitting: true })
    const stay = hand('porter', { status: 'atPost' })
    let r = reduceStaff([q, stay], { type: 'close' })
    expect(r[0]).toMatchObject({ fired: true, status: 'leaving' })
    expect(r[1]).toMatchObject({ fired: false, status: 'leaving' })
    expect(payroll(r, []).wages).toBe(q.wage + stay.wage)
    // The slot is free again for a new hire.
    expect(canHire([...r, hand('sales')], 'sales')).toBeNull()
    r = reduceStaff(r, { type: 'left', id: q.id })
    expect(r.map((e) => e.id)).toEqual([stay.id])
  })

  it('does not pay a quitter who is let go before closing', () => {
    const q = hand('sales', { status: 'atPost', quitting: true })
    const r = reduceStaff([q], { type: 'fire', id: q.id })
    expect(r[0]).toMatchObject({ fired: true, quitting: false })
    expect(payroll(r, []).wages).toBe(0)
  })

  it('raises a wage by a fifth to keep someone, at least $20', () => {
    expect(retentionRaise(180)).toBe(36)
    expect(retentionRaise(80)).toBe(20)
  })
})
