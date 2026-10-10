import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallResult } from '../sim/calls'
import type { Client } from '../sim/clients'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { generateCustomer, type Customer } from '../sim/customers'
import { createRng, type Rng } from '../sim/rng'
import { DESK_PHONE_ID } from '../sim/layout'
import type { Role } from '../sim/staff'
import { useGame } from './store'

// How a call goes is random; these tests pick the outcome.
const outcome = vi.hoisted(() => ({ next: { outcome: 'booked', change: 0 } as CallResult }))
vi.mock('../sim/calls', async (importOriginal) => {
  const calls = await importOriginal<typeof import('../sim/calls')>()
  return {
    ...calls,
    callOutcome: () => outcome.next,
    // Everyone booked turns up.
    planClientVisits: (book: Client[], day: number, rng: Rng) =>
      calls.planClientVisits(book, day, rng, 100),
  }
})

const initial = useGame.getState()
const game = () => useGame.getState()

const prospect = (id: string, extra: Partial<Client> = {}): Client => ({
  id,
  name: `Kim ${id}`,
  variant: 'female-b',
  companion: null,
  archetype: 'regular',
  status: 'prospect',
  since: 1,
  lastVisit: 1,
  visits: 1,
  bought: 0,
  car: null,
  budget: 30_000,
  preferredModels: ['sedan'],
  lastDeal: { model: 'sedan', ask: 26_000, counter: 24_000 },
  satisfaction: 60,
  reasons: [],
  dueDay: null,
  expires: 14,
  lastCall: null,
  callsThisCycle: 0,
  appointment: null,
  referredBy: null,
  referrals: 0,
  serviceDue: null,
  ...extra,
})

let nextHire = 1
function hired(role: Role, skill = 3): string {
  const template = initial.candidates.find((c) => c.role === role)!
  const id = `hire-${nextHire++}`
  useGame.setState({ candidates: [{ ...template, id, skill, name: `${role} ${id}` }] })
  game().hire(id)
  game().dispatchStaff({ type: 'atPost', id })
  return id
}

/** The player finishes the call they started. */
function finishCall() {
  const a = game().activeAction!
  expect(a).toMatchObject({ targetId: DESK_PHONE_ID, action: 'call' })
  game().arriveAction(a.id)
  game().completeAction(a.id)
}

function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

const waiting = (): Customer => ({
  ...generateCustomer('customer-w', [], createRng(1)),
  phase: 'waiting',
})

describe('calls and appointments', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
    useGame.setState({ helpOpen: false, clients: [prospect('a'), prospect('b')] })
    outcome.next = { outcome: 'booked', change: 0 }
  })

  it('calls the top of the list from the phone, and books them for tomorrow', () => {
    game().requestAction(DESK_PHONE_ID, 'call')
    expect(game().playerCall).toBe('a')
    finishCall()
    const [a] = game().clients
    expect(a.appointment).toMatchObject({ day: 2, reason: 'beBack' })
    expect(a).toMatchObject({ lastCall: 1, callsThisCycle: 1 })
    expect(game().dayStats.clients).toMatchObject({ calls: 1, booked: 1 })
    expect(game().notice?.text).toMatch(/will come in tomorrow/)
    // Booked: not called again.
    game().requestAction(DESK_PHONE_ID, 'call')
    expect(game().playerCall).toBe('b')
  })

  it('calls the one picked in the Clients tab, and refuses one not to call', () => {
    useGame.setState({ stockOpen: true })
    expect(game().phoneClient('b')).toBe(true)
    expect(game().stockOpen).toBe(false)
    finishCall()
    expect(game().clients[1].appointment).not.toBeNull()
    expect(game().phoneClient('b')).toBe(false)
    expect(game().activeAction).toBeNull()
  })

  it("doesn't count a call cut short, and tries nobody twice a day", () => {
    game().phoneClient('a')
    game().walkAway()
    expect(game().clients[0].lastCall).toBeNull()
    outcome.next = { outcome: 'noAnswer', change: 0 }
    game().phoneClient('a')
    finishCall()
    expect(game().clients[0].lastCall).toBeNull()
    expect(game().phoneClient('a')).toBe(false)
  })

  it('brings a booked client in the next day at their time, as they were', () => {
    game().phoneClient('a')
    finishCall()
    const minute = game().clients[0].appointment!.minute
    endDay()
    game().startNextDay()
    expect(game().notice?.text).toContain(`1 appointment today: Kim a at`)
    expect(game().clientVisits).toEqual([{ clientId: 'a', minute }])
    game().tickClock({ day: 2, minute: minute - 10 })
    expect(game().customers.some((c) => c.clientId === 'a')).toBe(false)
    game().tickClock({ day: 2, minute })
    const kim = game().customers.find((c) => c.clientId === 'a')!
    expect(kim).toMatchObject({ name: 'Kim a', source: 'client' })
    // They drive in, while there's a space.
    expect(kim.vehicle).not.toBeNull()
    expect(game().clientVisits).toEqual([])
    // A be-back hopes to pay about their last counter.
    expect(kim.expect).toBeGreaterThan(0.05)
  })

  it('drops an appointment nobody kept, the morning after', () => {
    game().phoneClient('a')
    finishCall()
    endDay()
    game().startNextDay()
    useGame.setState({ clientVisits: [] })
    endDay()
    game().startNextDay()
    expect(game().clients[0].appointment).toBeNull()
  })

  it('has the receptionist call only while nobody waits, and tell only of bookings', () => {
    hired('receptionist', 5)
    const start = OPEN_MINUTE
    game().tickClock({ day: 1, minute: start + 10 })
    expect(game().receptionCall).toMatchObject({ clientId: 'a' })
    game().tickClock({ day: 1, minute: start + 20 })
    game().tickClock({ day: 1, minute: start + 30 })
    expect(game().clients[0].appointment).not.toBeNull()
    expect(game().notice?.text).toMatch(/booked Kim a for/)
    // The next call is cut off by someone waiting.
    game().tickClock({ day: 1, minute: start + 40 })
    expect(game().receptionCall).toMatchObject({ clientId: 'b' })
    useGame.setState({ customers: [...game().customers, waiting()] })
    game().tickClock({ day: 1, minute: start + 50 })
    expect(game().receptionCall).toBeNull()
    expect(game().clients[1].lastCall).toBeNull()
  })

  it('stops the receptionist calling when turned off', () => {
    hired('receptionist')
    game().setReceptionCalls(false)
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 10 })
    expect(game().receptionCall).toBeNull()
    expect(game().clientPerks.receptionCalls).toBe(false)
  })

  it('makes no calls and plans no visits with an empty book', () => {
    useGame.setState({ clients: [] })
    hired('receptionist')
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 10 })
    expect(game().receptionCall).toBeNull()
    expect(game().phoneClient()).toBe(false)
    expect(game().notice?.text).toBe('Nobody to call right now.')
  })
})
