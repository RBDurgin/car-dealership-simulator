import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APPRECIATION_BOOST, appreciationCost, GUEST_WINDOW } from '../sim/appreciation'
import type { Client, ClientCar } from '../sim/clients'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { REFERRAL_BOOST } from '../sim/referrals'
import type { Role } from '../sim/staff'
import { useGame } from './store'

// Customers' answers are random; these tests always get a yes.
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: () => ({ answer: 'accept' }),
}))

const initial = useGame.getState()
const game = () => useGame.getState()

const sold: ClientCar = {
  model: 'sedan',
  used: false,
  price: 28_000,
  boughtDay: 1,
  year: 2026,
  miles: 0,
  condition: 1,
}

const client = (id: string, extra: Partial<Client> = {}): Client => ({
  id,
  name: `Kim ${id}`,
  variant: 'female-b',
  companion: null,
  archetype: 'regular',
  status: 'client',
  since: 1,
  lastVisit: 1,
  visits: 1,
  bought: 1,
  car: sold,
  budget: 30_000,
  preferredModels: ['sedan'],
  lastDeal: null,
  satisfaction: 80,
  reasons: [],
  dueDay: 40,
  expires: null,
  lastCall: null,
  callsThisCycle: 0,
  appointment: null,
  referredBy: null,
  referrals: 0,
  friendsSent: 0,
  thanked: false,
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

function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

const noArrivals = { minutes: [], sources: [], spawned: 0 }

/** A friend sent by client `by` turns up at opening on day 1. */
function friendArrives(by: string) {
  useGame.setState({
    customers: [],
    arrivals: noArrivals,
    clientVisits: [{ clientId: by, minute: OPEN_MINUTE + 30, reason: 'friend' }],
  })
  game().tickClock({ day: 1, minute: OPEN_MINUTE + 30 })
  return game().customers.find((c) => c.referredBy === by)!
}

/** Salesperson sells customer `id` the first car on the lot. */
function sell(id: string) {
  const car = game().inventory.find((c) => c.status === 'available' && !c.used)!
  game().dispatchCustomer({ type: 'arrive', id })
  useGame.setState({
    customers: game().customers.map((c) =>
      c.id === id
        ? { ...c, phase: 'waiting', browseCarIds: [car.id], browsed: 1, targetCarId: car.id }
        : c,
    ),
  })
  const sam = hired('sales')
  expect(game().staffClaim(sam, id)).toBe(true)
  game().staffGreet(sam)
  game().staffOffer(sam)
  game().answerOffer(id)
  game().staffLead(sam)
  game().dispatchCustomer({ type: 'seat', id })
  game().staffSign(sam, id)
}

describe('referrals by name', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
    useGame.setState({ helpOpen: false, clients: [client('a')] })
  })

  it('brings in a stranger sent by the client, as a referral', () => {
    const friend = friendArrives('a')
    expect(friend).toMatchObject({ source: 'referral', clientId: null, guest: false })
    expect(friend.name).not.toBe('Kim a')
    expect(game().dayStats.bySource.referral).toBe(1)
  })

  it('pays the referral fee only when the friend buys, and credits the client', () => {
    game().setReferralFee(250)
    const friend = friendArrives('a')
    const cash = game().cash
    sell(friend.id)
    const sale = game().dayStats.sales[0]
    expect(sale.source).toBe('referral')
    expect(game().dayStats.clients).toMatchObject({ referralFees: 250, referrals: 1 })
    expect(game().cash).toBe(cash + sale.price - 250)
    const [a, newcomer] = game().clients
    expect(a).toMatchObject({ referrals: 1, satisfaction: 80 + REFERRAL_BOOST })
    expect(newcomer).toMatchObject({ status: 'client', referredBy: 'a' })
    // The fee comes off the day's net.
    const without = { ...game().dayStats, clients: { ...game().dayStats.clients, referralFees: 0 } }
    expect(netIncome(game().dayStats)).toBe(netIncome(without) - 250)
  })

  it('pays nothing for a friend who walks out, nor without a fee', () => {
    game().setReferralFee(100)
    const friend = friendArrives('a')
    game().dispatchCustomer({ type: 'arrive', id: friend.id })
    endDay()
    expect(game().dayStats.clients.referralFees).toBe(0)
    game().setReferralFee(0)
    expect(game().clientPerks.referralFee).toBe(0)
  })

  it('sends friends from happy recent buyers, counted against them', () => {
    const book = Array.from({ length: 80 }, (_, i) =>
      client(`c${i}`, { satisfaction: 100, car: { ...sold, boughtDay: 1 } }),
    )
    useGame.setState({ clients: book, reputation: 100 })
    game().setReferralFee(250)
    endDay()
    game().startNextDay()
    const friends = game().clientVisits.filter((v) => v.reason === 'friend')
    expect(friends.length).toBeGreaterThan(0)
    const sent = game().clients.filter((c) => c.friendsSent > 0)
    expect(sent.length).toBe(new Set(friends.map((v) => v.clientId)).size)
    // No strangers come as referrals any more.
    expect(game().arrivals.sources).not.toContain('referral')
  })
})

describe('client appreciation day', () => {
  const happy = Array.from({ length: 60 }, (_, i) => client(`c${i}`, { satisfaction: 95 }))

  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
    useGame.setState({ helpOpen: false, clients: happy, cash: 50_000 })
  })

  it('is booked ahead and paid for now, once at a time', () => {
    const cost = appreciationCost(happy)
    expect(game().bookAppreciation(2)).toBe(false)
    expect(game().bookAppreciation(6)).toBe(true)
    expect(game().appreciation).toEqual({ day: 6, month: 0 })
    expect(game().cash).toBe(50_000 - cost)
    expect(game().dayStats.clients.appreciation).toBe(cost)
    expect(netIncome(game().dayStats)).toBeLessThanOrEqual(-cost)
    expect(game().bookAppreciation(7)).toBe(false)
    expect(game().cash).toBe(50_000 - cost)
  })

  it('brings guests over lunch, happier, and one nobody greets just visits', () => {
    useGame.setState({ appreciation: { day: 2, month: 0 } })
    endDay()
    game().startNextDay()
    expect(game().notice?.text).toMatch(/Client appreciation day/)
    const guests = game().clientVisits.filter((v) => v.reason === 'appreciation')
    expect(guests.length).toBeGreaterThan(3)
    expect(guests.every((v) => v.minute >= GUEST_WINDOW.from)).toBe(true)
    useGame.setState({ arrivals: noArrivals })
    game().tickClock({ day: 2, minute: GUEST_WINDOW.to + 10 })
    const came = game().customers.filter((c) => c.guest)
    expect(came.length).toBeGreaterThan(0)
    const first = game().clients.find((c) => c.id === came[0].clientId)!
    expect(first.satisfaction).toBe(Math.min(100, 95 + APPRECIATION_BOOST))
    // Nobody gets to them: they eat, look around and go home.
    for (const c of came) {
      game().dispatchCustomer({ type: 'arrive', id: c.id })
      useGame.setState({
        customers: game().customers.map((x) =>
          x.id === c.id ? { ...x, phase: 'waiting' as const } : x,
        ),
      })
    }
    game().tickClock({ day: 2, minute: CLOSE_MINUTE - 5 })
    const left = game().customers.filter((c) => c.guest && c.phase === 'leaving')
    expect(left.length).toBe(came.length)
    expect(left.every((c) => c.leaveReason === 'visited')).toBe(true)
    expect(game().dayStats.impatient).toBe(0)
    expect(game().dayStats.refused).toBe(0)
  })
})
