import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientCarInfo, LOYALTY_ACCEPT, type Client, type ClientCar } from '../sim/clients'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { CUSTOMER_PARKING } from '../sim/layout'
import type { Role } from '../sim/staff'
import { sellerBonusFor, useGame } from './store'

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

const due = (id: string, extra: Partial<Client> = {}): Client => ({
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
  dueDay: 2,
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

/** Day 2, with `book` in the client book, the loyalty discount at `discount` and `ids` due in at opening. */
function dayTwo(book: Client[], ids: string[], discount: 0 | 0.02 | 0.04 = 0) {
  useGame.setState({ clients: book, arrivals: { minutes: [], sources: [], spawned: 0 } })
  game().setLoyaltyDiscount(discount)
  endDay()
  game().startNextDay()
  useGame.setState({
    customers: [],
    arrivals: { minutes: [], sources: [], spawned: 0 },
    clientVisits: ids.map((clientId) => ({
      clientId,
      minute: OPEN_MINUTE + 30,
      reason: 'appointment' as const,
    })),
  })
  game().tickClock({ day: 2, minute: OPEN_MINUTE + 30 })
}

describe('trade-ups', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('a due client drives in with the car we sold them, to trade, at the loyalty price', () => {
    dayTwo([due('a')], ['a'], 0.02)
    const kim = game().customers.find((c) => c.clientId === 'a')!
    expect(kim).toMatchObject({ source: 'client', loyaltyCut: 0.02 })
    expect(kim.preferredModels[0]).toBe('sedan')
    expect(kim.vehicle!.car).toEqual({ model: 'sedan', ...clientCarInfo(sold, 2) })
    expect(kim.trade).not.toBeNull()
    expect(game().dayStats.bySource.client).toBe(1)
  })

  it('comes on foot, without the trade, when parking is full', () => {
    const book = Array.from({ length: CUSTOMER_PARKING.length + 1 }, (_, i) => due(`c${i}`))
    dayTwo(
      book,
      book.map((c) => c.id),
    )
    const back = game().customers.filter((c) => c.clientId)
    expect(back).toHaveLength(book.length)
    const walked = back.filter((c) => !c.vehicle)
    expect(walked).toHaveLength(1)
    expect(walked[0].trade).toBeNull()
  })

  it('makes a happy client keener to say yes', () => {
    useGame.setState({ clients: [due('a', { satisfaction: 100 }), due('b', { satisfaction: 0 })] })
    const bonus = (clientId: string | null) =>
      sellerBonusFor(game(), { handlerId: 'player', clientId })
    expect(bonus('a') - bonus(null)).toBeCloseTo(LOYALTY_ACCEPT)
    expect(bonus('b') - bonus(null)).toBeCloseTo(-LOYALTY_ACCEPT)
  })

  it('marks a sale to a returning client, and rolls their next trade-up', () => {
    useGame.setState({ clients: [due('a', { dueDay: 1 })] })
    const kim: Customer = {
      id: 'customer-k',
      name: 'Kim a',
      variant: 'female-b',
      archetype: 'regular',
      source: 'client',
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
      rivalQuote: null,
      clientId: 'a',
      loyaltyCut: 0.02,
      referredBy: null,
      guest: false,
      credit: null,
      service: null,
    }
    useGame.setState({ customers: [kim] })
    const sam = hired('sales')
    expect(game().staffClaim(sam, kim.id)).toBe(true)
    game().staffGreet(sam)
    game().staffOffer(sam)
    game().answerOffer(kim.id)
    game().staffLead(sam)
    game().dispatchCustomer({ type: 'seat', id: kim.id })
    game().staffSign(sam, kim.id)
    const sale = game().dayStats.sales[0]
    expect(sale.returning).toBe(true)
    // Asked at the loyalty price, never the full sticker.
    expect(sale.price).toBeLessThan(sale.msrp)
    expect(game().dayStats.clients.returned).toBe(1)
    expect(game().clients[0].dueDay).toBeGreaterThan(30)
  })
})
