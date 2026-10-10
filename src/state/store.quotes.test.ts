import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Customer } from '../sim/customers'
import { emptyStats } from '../sim/deal'
import type { AskResponse } from '../sim/negotiation'
import { emptyRivalStats } from '../sim/rival'
import { useGame } from './store'

// Customers' answers are random; these tests pick them.
const answer = vi.hoisted(() => ({ queue: [] as AskResponse[] }))
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: (): AskResponse => answer.queue.shift() ?? { answer: 'accept' },
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = () => game().customers.find((c) => c.id === 'customer-a')
const car = () => game().inventory.find((c) => c.id === 'lot-car-1')!

/** A shopper who was quoted `price` by the rival on lot-car-1's model. */
const shopper = (price: number): Customer => ({
  id: 'customer-a',
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 200_000,
  preferredModels: [car().model],
  patience: 60,
  patienceLeft: 60,
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
  rivalQuote: { model: car().model, price },
  service: null,
})

/** Runs an action to the end, as the player and the timers would. */
function perform(targetId: string, action: Parameters<typeof initial.requestAction>[1]) {
  game().requestAction(targetId, action)
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
}

/** Greets them, asks `price` and hears their answer. */
function askAt(price: number) {
  perform('customer-a', 'greet')
  game().ask(price)
  game().answerOffer('customer-a')
}

function closeDeal() {
  game().requestAction('office-chair', 'closeDeal')
  const id = game().activeAction!.id
  game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
  game().arriveAction(id)
  game().completeAction(id)
}

describe("customers who know the rival's price", () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    useGame.setState({ dayStats: { ...emptyStats(), rival: emptyRivalStats(0.2) } })
    answer.queue = []
  })

  it('counts a sale at or under his quote as matched', () => {
    const quote = car().msrp - 1_000
    useGame.setState({ customers: [shopper(quote)] })
    askAt(quote)
    closeDeal()
    expect(game().dayStats.sales).toHaveLength(1)
    expect(game().dayStats.rival).toMatchObject({ matched: 1, lost: 0 })
  })

  it('does not count a sale over his quote', () => {
    const quote = car().msrp - 1_000
    useGame.setState({ customers: [shopper(quote)] })
    askAt(quote + 500)
    closeDeal()
    expect(game().dayStats.sales).toHaveLength(1)
    expect(game().dayStats.rival?.matched).toBe(0)
  })

  it('counts a buyer who walks out to him as lost, and says where they went', () => {
    useGame.setState({ customers: [shopper(car().msrp - 3_000)] })
    answer.queue = [{ answer: 'walk', reason: 'rival' }]
    askAt(car().msrp)
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'refused' })
    expect(game().dayStats.rival?.lost).toBe(1)
    expect(game().notice?.text).toMatch(/Nazma/)
  })

  it('does not count other walk-outs', () => {
    useGame.setState({ customers: [shopper(car().msrp - 3_000)] })
    answer.queue = [{ answer: 'walk', reason: 'pass' }]
    askAt(car().msrp)
    expect(game().dayStats.rival?.lost).toBe(0)
  })

  it('counts nothing while he is not open', () => {
    useGame.setState({ customers: [shopper(car().msrp)], dayStats: emptyStats() })
    askAt(car().msrp)
    closeDeal()
    expect(game().dayStats.rival).toBeNull()
  })
})
