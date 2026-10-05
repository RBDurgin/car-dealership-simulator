import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { STARTING_CASH, useGame } from './store'

// Customers' answers are random; these tests pick them.
const answer = vi.hoisted(() => ({ accept: true }))
vi.mock('../sim/customers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/customers')>()),
  decide: () => answer.accept,
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = 'customer-a') => game().customers.find((c) => c.id === id)
const car = (id: string) => game().inventory.find((c) => c.id === id)!

const shopper = (extra: Partial<Customer> = {}): Customer => ({
  id: 'customer-a',
  name: 'Alex B.',
  variant: 'male-a',
  budget: 200_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: ['lot-car-1'],
  browsed: 1,
  targetCarId: 'lot-car-1',
  offer: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
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

function greetAndOffer(id = 'customer-a') {
  perform(id, 'greet')
  perform(id, 'offer')
  game().answerOffer(id)
}

describe('selling to a customer', () => {
  beforeEach(() => {
    useGame.setState({ ...initial, customers: [shopper()] }, true)
    answer.accept = true
  })

  it('greeting starts a conversation about the car they want', () => {
    game().requestAction('customer-a', 'greet')
    const id = game().activeAction!.id
    game().arriveAction(id)
    expect(customer()?.phase).toBe('waiting')
    game().completeAction(id)
    expect(customer()).toMatchObject({ phase: 'talking', targetCarId: 'lot-car-1' })
  })

  it('asks about another car if theirs has sold', () => {
    game().sellCar('lot-car-1')
    perform('customer-a', 'greet')
    expect(customer()?.phase).toBe('talking')
    expect(customer()?.targetCarId).not.toBe('lot-car-1')
  })

  it('offers at MSRP, and an accepted offer makes them follow', () => {
    perform('customer-a', 'greet')
    perform('customer-a', 'offer')
    expect(customer()).toMatchObject({
      phase: 'considering',
      offer: { carId: 'lot-car-1', price: car('lot-car-1').msrp },
    })
    game().answerOffer('customer-a')
    expect(customer()?.phase).toBe('following')
    expect(game().notice?.text).toMatch(/Deal/)
  })

  it('a refused offer sends them home unhappy and counts the walk-out', () => {
    answer.accept = false
    greetAndOffer()
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'refused' })
    expect(game().dayStats.refused).toBe(1)
  })

  it('closing the deal sells the car, banks the money and logs the sale', () => {
    greetAndOffer()
    const price = car('lot-car-1').msrp
    game().requestAction('office-chair', 'closeDeal')
    const id = game().activeAction!.id
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    expect(customer()?.phase).toBe('signing')
    game().arriveAction(id)
    game().completeAction(id)
    expect(car('lot-car-1').status).toBe('sold')
    expect(game().cash).toBe(STARTING_CASH + price)
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'bought' })
    expect(game().dayStats.sales).toEqual([
      expect.objectContaining({ carId: 'lot-car-1', price, customerName: 'Alex B.' }),
    ])
    expect(game().dayStats.refused + game().dayStats.impatient).toBe(0)
  })

  it("won't close a deal without a buyer", () => {
    game().requestAction('office-chair', 'closeDeal')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/ready to sign/)
  })

  it("won't greet a customer who is leaving", () => {
    useGame.setState({ customers: [shopper({ phase: 'leaving', leaveReason: 'impatient' })] })
    game().requestAction('customer-a', 'greet')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/left/)
  })
})

describe('walking away from a deal', () => {
  beforeEach(() => {
    useGame.setState(
      { ...initial, customers: [shopper(), shopper({ id: 'customer-b', name: 'Sam C.' })] },
      true,
    )
    answer.accept = true
  })

  it('Esc mid-conversation leaves them waiting', () => {
    perform('customer-a', 'greet')
    game().cancelAll()
    expect(customer()?.phase).toBe('waiting')
  })

  it('walking off mid-conversation leaves them waiting', () => {
    perform('customer-a', 'greet')
    game().issueMoveOrder(3, 4)
    expect(customer()?.phase).toBe('waiting')
    perform('customer-a', 'greet')
    game().walkAway()
    expect(customer()?.phase).toBe('waiting')
  })

  it('a follower keeps following while the player walks about', () => {
    greetAndOffer()
    game().issueMoveOrder(3, 4)
    expect(customer()?.phase).toBe('following')
    perform('coffee-machine', 'getCoffee')
    expect(customer()?.phase).toBe('following')
  })

  it('Esc stops the walk first, then lets the follower wait', () => {
    greetAndOffer()
    game().issueMoveOrder(3, 4)
    game().cancelAll()
    expect(customer()?.phase).toBe('following')
    game().cancelAll()
    expect(customer()?.phase).toBe('waiting')
    expect(game().notice?.text).toMatch(/wait/)
  })

  it('greeting someone else drops the current deal', () => {
    greetAndOffer()
    game().requestAction('customer-b', 'greet')
    expect(customer()?.phase).toBe('waiting')
    expect(customer('customer-b')?.phase).toBe('waiting')
    expect(game().activeAction?.targetId).toBe('customer-b')
  })

  it('getting up mid-paperwork leaves them waiting and the car unsold', () => {
    greetAndOffer()
    game().requestAction('office-chair', 'closeDeal')
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    game().arriveAction(game().activeAction!.id)
    game().cancelAll()
    expect(customer()?.phase).toBe('waiting')
    expect(car('lot-car-1').status).toBe('available')
    expect(game().cash).toBe(STARTING_CASH)
  })

  it('cancelling the walk to the desk keeps the follower following', () => {
    greetAndOffer()
    game().requestAction('office-chair', 'closeDeal')
    game().cancelAll()
    expect(customer()?.phase).toBe('following')
  })
})

describe('the day loop', () => {
  beforeEach(() => {
    useGame.setState({ ...initial, customers: [shopper()] }, true)
    answer.accept = true
  })

  it("doesn't wear down the patience of the customer the player is heading to", () => {
    useGame.setState({ customers: [shopper(), shopper({ id: 'customer-b' })] })
    game().requestAction('customer-a', 'greet')
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 20 })
    expect(customer()?.patienceLeft).toBe(60)
    expect(customer('customer-b')?.patienceLeft).toBe(40)
  })

  it('drops the action when its customer leaves on the way', () => {
    game().requestAction('customer-a', 'greet')
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    expect(customer()?.phase).toBe('leaving')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/left/)
  })

  it('counts visitors as they arrive', () => {
    const first = game().arrivals.minutes[0]
    game().tickClock({ day: 1, minute: first + 10 })
    expect(game().dayStats.visitors).toBeGreaterThan(0)
    expect(game().dayStats.visitors).toBe(game().arrivals.spawned)
  })

  it('a deal dropped after closing sends the customer home', () => {
    greetAndOffer()
    game().requestAction('office-chair', 'closeDeal')
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    expect(customer()?.phase).toBe('signing')
    game().cancelAll()
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'closing' })
  })

  it('a signature in progress at closing still goes through', () => {
    greetAndOffer()
    game().requestAction('office-chair', 'closeDeal')
    const id = game().activeAction!.id
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    game().arriveAction(id)
    game().completeAction(id)
    expect(customer()?.leaveReason).toBe('bought')
    expect(game().dayStats.sales).toHaveLength(1)
  })

  it('starts the next day only once closed and empty, with a fresh plan and tally', () => {
    game().startNextDay()
    expect(game().clock.day).toBe(1)
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
    expect(game().dayStats.closing).toBeGreaterThan(0)
    const dayOne = game().arrivals
    game().startNextDay()
    expect(game().clock).toEqual({ day: 2, minute: OPEN_MINUTE })
    expect(game().arrivals.spawned).toBe(0)
    expect(game().arrivals).not.toBe(dayOne)
    expect(game().dayStats).toMatchObject({ visitors: 0, sales: [], closing: 0 })
  })
})
