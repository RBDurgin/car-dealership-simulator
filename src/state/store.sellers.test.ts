import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { netIncome } from '../sim/deal'
import type { AskResponse } from '../sim/negotiation'
import { freeSlots, slotPlacement, type Slot } from '../sim/ordering'
import { vehicleTargetId } from '../sim/sellers'
import { marketValue } from '../sim/usedCars'
import { useGame } from './store'

// Sellers' answers are random; these tests pick them, and see what was offered.
const answer = vi.hoisted(() => ({
  queue: [] as AskResponse[],
  offers: [] as number[],
}))
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToBuyOffer: (_c: Customer, offer: number): AskResponse => {
    answer.offers.push(offer)
    return answer.queue.shift() ?? { answer: 'accept' }
  },
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = 'seller-a') => game().customers.find((c) => c.id === id)

const CAR = { model: 'sedan', year: 2021, miles: 60_000, condition: 0.7, acquiredDay: 1 } as const

const seller = (extra: Partial<Customer> = {}): Customer => ({
  id: 'seller-a',
  name: 'Sam K.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 30_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: [],
  browsed: 0,
  targetCarId: null,
  offer: null,
  expect: 0.04,
  haggle: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
  vehicle: { car: CAR, spot: 1, parked: true },
  selling: { hope: 11_000, estimate: { estimate: 10_000, margin: 2_500 }, appraised: false },
  trade: null,
  rivalQuote: null,
  service: null,
  ...extra,
})

/** Runs an action to the end, as the player and the timers would. */
function perform(targetId: string, action: Parameters<typeof initial.requestAction>[1]) {
  game().requestAction(targetId, action)
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
}

/** Makes an offer and has the seller answer it. */
function offer(price: number) {
  game().ask(price)
  game().answerOffer('seller-a')
}

describe('buying a car from a seller', () => {
  beforeEach(() => {
    useGame.setState({ ...initial, screen: 'playing', customers: [seller()], cash: 50_000 }, true)
    answer.queue = []
    answer.offers = []
  })

  it('offers Make offer, not Greet, and starts talking about their car', () => {
    perform('seller-a', 'makeOffer')
    expect(customer()).toMatchObject({ phase: 'talking', handlerId: 'player', targetCarId: null })
  })

  it('appraising narrows the estimate without ending the conversation', () => {
    perform('seller-a', 'makeOffer')
    perform(vehicleTargetId('seller-a'), 'appraise')
    const c = customer()!
    expect(c.phase).toBe('talking')
    expect(c.selling!.appraised).toBe(true)
    expect(c.selling!.estimate.margin).toBeLessThan(2_500)
    const truth = marketValue('sedan', CAR, game().clock.day)
    expect(Math.abs(c.selling!.estimate.estimate - truth)).toBeLessThanOrEqual(
      c.selling!.estimate.margin + 100,
    )
    // Only once.
    game().requestAction(vehicleTargetId('seller-a'), 'appraise')
    expect(game().notice?.text).toMatch(/already appraised/)
  })

  it('a yes pays cash, holds a lot space and sends the seller off on foot', () => {
    const free = freeSlots(game().inventory, game().orders).filter((s) => s.location === 'lot')
    perform('seller-a', 'makeOffer')
    offer(9_000)
    expect(answer.offers).toEqual([9_000])
    expect(game().cash).toBe(41_000)
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'sold', vehicle: null })
    const [p] = game().purchases
    expect(p).toMatchObject({ customerId: 'seller-a', price: 9_000, spot: 1, slot: free[0] })
    expect(game().dayStats.bought).toEqual([
      expect.objectContaining({ model: 'sedan', price: 9_000, sellerName: 'Sam K.' }),
    ])
    // A stock purchase, not an expense.
    expect(netIncome(game().dayStats)).toBe(0)
    // Orders can't take the held space.
    const after = freeSlots(game().inventory, game().orders, [p.slot])
    expect(after).not.toContainEqual(p.slot)
    game().orderCar('sedan', 'cash')
    expect(
      game().orders.every((o) => o.slot.index !== p.slot.index || o.slot.location !== 'lot'),
    ).toBe(true)
  })

  it('a counter keeps the haggle going, between our offer and their price', () => {
    answer.queue = [{ answer: 'counter', counter: 11_300 }]
    perform('seller-a', 'makeOffer')
    offer(8_500)
    expect(customer()).toMatchObject({
      phase: 'talking',
      haggle: { round: 2, lastAsk: 8_500, counter: 11_300 },
    })
    expect(game().notice?.text).toMatch(/11,300/)
    // Clamped to between the two.
    offer(20_000)
    expect(answer.offers).toEqual([8_500, 11_300])
  })

  it('a walk sends them back to their car to drive off', () => {
    answer.queue = [{ answer: 'walk', reason: 'insulted' }]
    perform('seller-a', 'makeOffer')
    offer(2_000)
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'refused' })
    expect(customer()!.vehicle).not.toBeNull()
    expect(game().purchases).toEqual([])
  })

  it("can't offer without the cash or a free lot space", () => {
    useGame.setState({ cash: 1_000 })
    perform('seller-a', 'makeOffer')
    offer(9_000)
    expect(customer()!.phase).toBe('talking')
    expect(game().notice?.text).toBe('Not enough cash.')

    const lotFull = game().inventory.map((c) => ({ ...c, status: 'available' as const }))
    const filled = freeSlots(lotFull, [])
      .filter((s) => s.location === 'lot')
      .map((slot, i) => ({
        ...lotFull[0],
        id: `fill-${i}`,
        location: 'lot' as const,
        rect: rectOf(slot),
      }))
    useGame.setState({ cash: 50_000, inventory: [...lotFull, ...filled] })
    offer(9_000)
    expect(game().notice?.text).toBe('No room on the lot.')
    expect(answer.offers).toEqual([])
  })

  it('the car goes into stock when the day is settled, costing what we paid', () => {
    perform('seller-a', 'makeOffer')
    offer(9_000)
    const p = game().purchases[0]
    useGame.setState({ clock: { day: 1, minute: CLOSE_MINUTE } })
    game().dispatchCustomer({ type: 'despawn', id: 'seller-a' })
    expect(game().purchases).toEqual([])
    const car = game().inventory.find((c) => c.id === p.id)!
    expect(car).toMatchObject({
      model: 'sedan',
      cost: 9_000,
      location: 'lot',
      spaceIndex: p.slot.index,
      floored: false,
      status: 'available',
      used: { year: 2021, miles: 60_000 },
    })
    expect(car.cleanliness).toBeLessThan(1)
    // And the next morning it's still there.
    game().startNextDay()
    expect(game().clock).toMatchObject({ day: 2, minute: OPEN_MINUTE })
    expect(game().inventory.some((c) => c.id === p.id)).toBe(true)
  })
})

function rectOf(slot: Slot) {
  return slotPlacement(slot).rect
}
