import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { netIncome, salesBySeller } from '../sim/deal'
import type { AskResponse } from '../sim/negotiation'
import { freeSlots, slotPlacement } from '../sim/ordering'
import { vehicleTargetId } from '../sim/sellers'
import { marketValue } from '../sim/usedCars'
import { useGame } from './store'

// Answers are random; these tests pick them, and see what was asked or offered.
const answer = vi.hoisted(() => ({
  queue: [] as AskResponse[],
  asks: [] as { ask: number; allowance?: number }[],
  offers: [] as number[],
}))
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: (
    _c: Customer,
    _car: unknown,
    ask: number,
    _rng: unknown,
    _bonus: number,
    allowance?: number,
  ): AskResponse => {
    answer.asks.push({ ask, allowance })
    return answer.queue.shift() ?? { answer: 'accept' }
  },
  respondToBuyOffer: (_c: Customer, offer: number): AskResponse => {
    answer.offers.push(offer)
    return answer.queue.shift() ?? { answer: 'accept' }
  },
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = 'buyer-a') => game().customers.find((c) => c.id === id)
const car = (id: string) => game().inventory.find((c) => c.id === id)!

const OLD_CAR = { model: 'van', year: 2019, miles: 80_000, condition: 0.6, acquiredDay: 1 } as const

const buyer = (extra: Partial<Customer> = {}): Customer => ({
  id: 'buyer-a',
  name: 'Robin T.',
  variant: 'female-b',
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
  vehicle: { car: OLD_CAR, spot: 0, parked: true },
  selling: null,
  trade: { hope: 12_000, estimate: { estimate: 10_000, margin: 2_500 }, appraised: false },
  rivalQuote: null,
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

/** Has the buyer sit down at the office desk and sign. */
function closeDeal() {
  game().requestAction('office-chair', 'closeDeal')
  const id = game().activeAction!.id
  game().dispatchCustomer({ type: 'seat', id: 'buyer-a' })
  game().arriveAction(id)
  game().completeAction(id)
}

/** Fills every free lot space, so there's no room for a used car. */
function fillLot() {
  const inv = game().inventory
  const filled = freeSlots(inv, [])
    .filter((s) => s.location === 'lot')
    .map((slot, i) => ({
      ...inv[0],
      id: `fill-${i}`,
      location: 'lot' as const,
      rect: slotPlacement(slot).rect,
    }))
  useGame.setState({ inventory: [...inv, ...filled] })
}

describe('a sale with a trade-in', () => {
  beforeEach(() => {
    useGame.setState({ ...initial, screen: 'playing', customers: [buyer()], cash: 50_000 }, true)
    answer.queue = []
    answer.asks = []
    answer.offers = []
  })

  it('asks a price and an allowance, which the buyer weighs together', () => {
    const msrp = car('lot-car-1').msrp
    perform('buyer-a', 'greet')
    game().ask(msrp, 11_000)
    expect(answer.asks).toEqual([])
    expect(customer()!.offer).toEqual({ carId: 'lot-car-1', price: msrp, allowance: 11_000 })
    game().answerOffer('buyer-a')
    expect(answer.asks).toEqual([{ ask: msrp, allowance: 11_000 }])
  })

  it('opens at the suggested allowance from the menu', () => {
    perform('buyer-a', 'greet')
    perform('buyer-a', 'offer')
    // 95% of our 10,000 estimate.
    expect(customer()!.offer).toMatchObject({ price: car('lot-car-1').msrp, allowance: 9_500 })
  })

  it('a counter keeps score in what they pay after the trade', () => {
    const msrp = car('lot-car-1').msrp
    answer.queue = [
      { answer: 'counter', counter: 15_000 },
      { answer: 'counter', counter: 16_000 },
    ]
    perform('buyer-a', 'greet')
    game().ask(msrp, 10_000)
    game().answerOffer('buyer-a')
    expect(customer()!.haggle).toEqual({
      round: 2,
      lastAsk: msrp - 10_000,
      counter: 15_000,
      allowance: 10_000,
    })
    expect(game().notice?.text).toMatch(/15,000 after my trade/)
    // Asks stay between their counter and our last ask, net of the allowance.
    game().ask(msrp + 5_000, 10_000)
    expect(customer()!.offer).toMatchObject({ price: msrp, allowance: 10_000 })
    game().answerOffer('buyer-a')
    // And never under their counter, with a smaller allowance added back.
    game().ask(1_000, 9_000)
    expect(customer()!.offer).toMatchObject({ price: 25_000, allowance: 9_000 })
  })

  it('an insulted counter costs them a round', () => {
    answer.queue = [{ answer: 'counter', counter: 15_000, insulted: true }]
    perform('buyer-a', 'greet')
    game().ask(25_000, 3_000)
    game().answerOffer('buyer-a')
    expect(customer()!.haggle?.round).toBe(3)
  })

  it('signing takes the price less the allowance, and their car goes on the lot tonight', () => {
    const msrp = car('lot-car-1').msrp
    const free = freeSlots(game().inventory, game().orders).filter((s) => s.location === 'lot')
    perform('buyer-a', 'greet')
    game().ask(msrp, 11_000)
    game().answerOffer('buyer-a')
    closeDeal()
    expect(game().cash).toBe(50_000 + msrp - 11_000)
    const value = marketValue('van', OLD_CAR, 1)
    expect(game().dayStats.sales[0]).toMatchObject({
      price: msrp,
      trade: { model: 'van', allowance: 11_000, value },
    })
    expect(salesBySeller(game().dayStats)[0]).toMatchObject({
      trades: 1,
      tradeOver: 11_000 - value,
    })
    // They walk off; the car stays, holding its parking space and a lot space.
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'bought', vehicle: null })
    const [p] = game().purchases
    expect(p).toMatchObject({ customerId: 'buyer-a', price: 11_000, spot: 0, slot: free[0] })
    expect(game().dayStats.bought).toEqual([
      expect.objectContaining({ model: 'van', price: 11_000, trade: true }),
    ])
    // The allowance is a stock purchase, not an expense.
    expect(netIncome(game().dayStats)).toBe(msrp - car('lot-car-1').cost)
    // A new car sold: it counts toward the quota.
    expect(game().monthSales.count).toBe(1)

    useGame.setState({ clock: { day: 1, minute: CLOSE_MINUTE } })
    game().dispatchCustomer({ type: 'despawn', id: 'buyer-a' })
    expect(game().purchases).toEqual([])
    expect(car(p.id)).toMatchObject({ model: 'van', cost: 11_000, location: 'lot', used: {} })
  })

  it('with no room on the lot the trade is left out, and they drive their car home', () => {
    const msrp = car('lot-car-1').msrp
    fillLot()
    perform('buyer-a', 'greet')
    game().ask(msrp, 11_000)
    expect(customer()!.offer).toEqual({ carId: 'lot-car-1', price: msrp })
    game().answerOffer('buyer-a')
    closeDeal()
    expect(game().cash).toBe(50_000 + msrp)
    expect(game().purchases).toEqual([])
    expect(customer()!.vehicle).not.toBeNull()
    expect(game().dayStats.sales[0].trade).toBeUndefined()
  })

  it('the deal falls through if the last lot space goes before they sign', () => {
    perform('buyer-a', 'greet')
    game().ask(30_000, 11_000)
    game().answerOffer('buyer-a')
    fillLot()
    closeDeal()
    expect(game().notice?.text).toBe('The deal fell through.')
    expect(car('lot-car-1').status).toBe('available')
    expect(game().cash).toBe(50_000)
  })

  it('appraising their car narrows the estimate', () => {
    perform(vehicleTargetId('buyer-a'), 'appraise')
    const c = customer()!
    expect(c.trade!.appraised).toBe(true)
    expect(c.trade!.estimate.margin).toBeLessThan(2_500)
  })
})

describe('salespeople with trade-ins and sellers', () => {
  const hireSales = () => {
    const c = game().candidates.find((x) => x.role === 'sales')!
    game().hire(c.id)
    game().dispatchStaff({ type: 'atPost', id: c.id })
    return game().roster.find((e) => e.id === c.id)!
  }

  beforeEach(() => {
    useGame.setState({ ...initial, screen: 'playing', customers: [buyer()], cash: 50_000 }, true)
    answer.queue = []
    answer.asks = []
    answer.offers = []
  })

  it('offer an allowance with the price, never over their appraisal unless green', () => {
    const e = hireSales()
    expect(game().staffClaim(e.id, 'buyer-a')).toBe(true)
    game().staffGreet(e.id)
    game().staffOffer(e.id)
    const offer = customer()!.offer!
    expect(offer.allowance).toBeDefined()
    if (e.skill <= 2) expect(offer.allowance).toBe(12_000)
    else expect(offer.allowance).toBeLessThanOrEqual(marketValue('van', OLD_CAR, 1) * 1.25)
  })

  it('buy from sellers, paying cash for the car', () => {
    const seller = buyer({
      id: 'seller-b',
      browseCarIds: [],
      targetCarId: null,
      trade: null,
      rivalQuote: null,
      selling: { hope: 9_000, estimate: { estimate: 9_000, margin: 2_000 }, appraised: false },
    })
    useGame.setState({ customers: [seller] })
    const e = hireSales()
    expect(game().staffClaim(e.id, 'seller-b')).toBe(true)
    game().staffGreet(e.id)
    expect(customer('seller-b')).toMatchObject({ phase: 'talking', handlerId: e.id })
    game().staffOffer(e.id)
    const bid = customer('seller-b')!.offer!.price
    expect(bid).toBeLessThan(marketValue('van', OLD_CAR, 1) * 1.25)
    game().answerOffer('seller-b')
    expect(answer.offers).toEqual([bid])
    expect(game().cash).toBe(50_000 - bid)
    expect(game().purchases).toHaveLength(1)
    expect(game().notice?.text).toMatch(new RegExp(`^${e.name} bought`))
  })

  it("leave sellers alone when there's no room to buy", () => {
    useGame.setState({
      customers: [
        buyer({
          id: 'seller-b',
          trade: null,
          rivalQuote: null,
          selling: { hope: 9_000, estimate: { estimate: 9_000, margin: 2_000 }, appraised: false },
        }),
      ],
    })
    fillLot()
    const e = hireSales()
    expect(game().staffClaim(e.id, 'seller-b')).toBe(false)
  })
})
