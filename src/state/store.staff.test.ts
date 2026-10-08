import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import type { Role } from '../sim/staff'
import { STARTING_CASH, useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = 'customer-a') => game().customers.find((c) => c.id === id)
const employee = (id: string) => game().roster.find((e) => e.id === id)

const shopper = (extra: Partial<Customer> = {}): Customer => ({
  id: 'customer-a',
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 200_000,
  preferredModels: ['sedan'],
  patience: 120,
  patienceLeft: 120,
  browseCarIds: ['lot-car-1'],
  browsed: 1,
  targetCarId: 'lot-car-1',
  offer: null,
  expect: 0.04,
  haggle: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
  vehicle: null,
  selling: null,
  trade: null,
  ...extra,
})

/** Hires today's applicant for `role` and returns their id. */
function hire(role: Role): string {
  const c = game().candidates.find((x) => x.role === role)!
  game().hire(c.id)
  return c.id
}

/** Hires a receptionist and has them sit down at the desk. */
function seatedReceptionist(): string {
  const id = hire('receptionist')
  game().dispatchStaff({ type: 'atPost', id })
  return id
}

/** Closes the doors and walks every customer off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
}

describe('hiring and firing', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('starts with applicants for every role and nobody on the payroll', () => {
    expect(game().roster).toEqual([])
    for (const role of ['sales', 'receptionist', 'finance', 'porter']) {
      expect(game().candidates.some((c) => c.role === role)).toBe(true)
    }
  })

  it('hiring during opening hours sends them straight in', () => {
    const id = hire('receptionist')
    expect(employee(id)?.status).toBe('arriving')
    expect(game().candidates.some((c) => c.id === id)).toBe(false)
    expect(game().notice?.text).toMatch(/joins as receptionist/)
  })

  it('refuses a second receptionist', () => {
    hire('receptionist')
    const extra = { ...game().candidates[0], id: 'staff-x', role: 'receptionist' as const }
    useGame.setState({ candidates: [...game().candidates, extra] })
    game().hire('staff-x')
    expect(game().roster).toHaveLength(1)
    expect(game().notice?.text).toMatch(/already have a receptionist/)
  })

  it('a hire after closing starts the next morning', () => {
    endDay()
    const id = hire('porter')
    expect(employee(id)?.status).toBe('off')
    game().startNextDay()
    expect(employee(id)?.status).toBe('arriving')
  })

  it('firing someone on shift walks them out, then drops them and anything aimed at them', () => {
    const id = seatedReceptionist()
    useGame.setState({ inspectedId: id, hoveredId: id })
    game().fire(id)
    expect(employee(id)).toMatchObject({ fired: true, status: 'leaving' })
    game().dispatchStaff({ type: 'left', id })
    expect(employee(id)).toBeUndefined()
    expect(game().inspectedId).toBeNull()
    expect(game().hoveredId).toBeNull()
  })

  it('sends staff home at closing and back in the next morning, with new applicants', () => {
    const id = seatedReceptionist()
    endDay()
    expect(employee(id)?.status).toBe('leaving')
    game().dispatchStaff({ type: 'left', id })
    expect(employee(id)?.status).toBe('off')
    const dayOne = game().candidates
    game().startNextDay()
    expect(employee(id)?.status).toBe('arriving')
    expect(game().candidates).not.toEqual(dayOne)
    expect(game().candidates.every((c) => c.id.startsWith('staff-2-'))).toBe(true)
  })
})

describe('the receptionist', () => {
  beforeEach(() => useGame.setState({ ...initial, customers: [shopper()] }, true))

  it('halves how fast waiting customers lose patience once seated', () => {
    hire('receptionist')
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 20 })
    expect(customer()?.patienceLeft).toBe(100) // still walking in: full drain
    game().dispatchStaff({ type: 'atPost', id: game().roster[0].id })
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 40 })
    expect(customer()?.patienceLeft).toBe(90)
  })

  it('announces a customer who starts waiting after browsing', () => {
    useGame.setState({ customers: [shopper({ phase: 'browsing', browsed: 0 })] })
    seatedReceptionist()
    game().dispatchCustomer({ type: 'browsed', id: 'customer-a' })
    expect(customer()?.phase).toBe('waiting')
    expect(game().notice?.text).toBe('Alex B. is waiting by the Summit Cruiser.')
  })

  it('stays quiet without a receptionist at the desk', () => {
    useGame.setState({ customers: [shopper({ phase: 'browsing', browsed: 0 })] })
    hire('receptionist') // hired but not seated yet
    const before = game().notice
    game().dispatchCustomer({ type: 'browsed', id: 'customer-a' })
    expect(game().notice).toBe(before)
  })
})

describe('payroll', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('pays wages once, when the day ends, and records them for the summary', () => {
    const id = seatedReceptionist()
    const wage = employee(id)!.wage
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    if (game().customers.length > 0) expect(game().cash).toBe(STARTING_CASH)
    endDay()
    expect(game().cash).toBe(STARTING_CASH - wage)
    expect(game().dayStats).toMatchObject({ wages: wage, commissions: 0, settled: true })
    // Staff walking out afterwards doesn't charge again.
    game().dispatchStaff({ type: 'left', id })
    game().tickClock({ day: 1, minute: CLOSE_MINUTE + 10 })
    expect(game().cash).toBe(STARTING_CASH - wage)
    game().startNextDay()
    expect(game().cash).toBe(STARTING_CASH - wage)
    expect(game().dayStats).toMatchObject({ wages: 0, settled: false })
  })

  it("doesn't pay someone fired during the day", () => {
    const id = seatedReceptionist()
    game().fire(id)
    endDay()
    expect(game().cash).toBe(STARTING_CASH)
  })

  it('costs nothing with no staff', () => {
    endDay()
    expect(game().cash).toBe(STARTING_CASH)
    expect(game().dayStats.settled).toBe(true)
  })
})
