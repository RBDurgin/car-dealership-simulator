import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { BROWSE_DIRT, NIGHTLY_DIRT } from '../sim/cleanliness'
import type { Customer } from '../sim/customers'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const car = (id: string) => game().inventory.find((c) => c.id === id)!

const browser: Customer = {
  id: 'customer-a',
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  companion: null,
  budget: 40_000,
  preferredModels: ['sedan'],
  patience: 120,
  patienceLeft: 120,
  browseCarIds: ['lot-car-1', 'lot-car-2'],
  browsed: 0,
  targetCarId: 'lot-car-2',
  offer: null,
  phase: 'browsing',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
}

/** Sets car `id`'s cleanliness directly. */
function soil(id: string, cleanliness: number) {
  useGame.setState({
    inventory: game().inventory.map((c) => (c.id === id ? { ...c, cleanliness } : c)),
  })
}

/** Hires today's porter applicant and has them reach their spot on the lot. */
function porterAtWork(): string {
  const c = game().candidates.find((x) => x.role === 'porter')!
  game().hire(c.id)
  game().dispatchStaff({ type: 'atPost', id: c.id })
  return c.id
}

describe('car cleanliness', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('gathers dust overnight', () => {
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
    game().startNextDay()
    expect(game().clock.day).toBe(2)
    expect(car('lot-car-1').cleanliness).toBeCloseTo(1 - NIGHTLY_DIRT.lot)
    expect(car('display-1').cleanliness).toBeCloseTo(1 - NIGHTLY_DIRT.showroom)
  })

  it('gets a little dirtier each time a customer looks it over', () => {
    useGame.setState({ customers: [browser] })
    game().dispatchCustomer({ type: 'browsed', id: 'customer-a' })
    expect(car('lot-car-1').cleanliness).toBeCloseTo(1 - BROWSE_DIRT)
    expect(car('lot-car-2').cleanliness).toBe(1)
  })

  it('the player can wash a dirty car', () => {
    soil('lot-car-1', 0.3)
    game().requestAction('lot-car-1', 'wash')
    const a = game().activeAction!
    game().arriveAction(a.id)
    expect(game().activeAction?.phase).toBe('performing')
    game().completeAction(a.id)
    expect(car('lot-car-1').cleanliness).toBe(1)
    expect(game().notice?.text).toMatch(/spotless/)
  })

  it("won't wash a car that's already spotless", () => {
    game().requestAction('lot-car-1', 'wash')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/already spotless/)
  })

  it('stops washing a car that sells', () => {
    soil('lot-car-1', 0.3)
    game().requestAction('lot-car-1', 'wash')
    game().sellCar('lot-car-1')
    expect(game().activeAction).toBeNull()
  })

  it('the porter washes cars while at work', () => {
    soil('lot-car-1', 0.3)
    const id = porterAtWork()
    game().staffWash(id, 'lot-car-1')
    expect(car('lot-car-1').cleanliness).toBe(1)
  })

  it('only a porter at work washes cars', () => {
    soil('lot-car-1', 0.3)
    const c = game().candidates.find((x) => x.role === 'porter')!
    game().hire(c.id)
    // Still on the way in.
    game().staffWash(c.id, 'lot-car-1')
    expect(car('lot-car-1').cleanliness).toBe(0.3)
    const sales = game().candidates.find((x) => x.role === 'sales')!
    game().hire(sales.id)
    game().dispatchStaff({ type: 'atPost', id: sales.id })
    game().staffWash(sales.id, 'lot-car-1')
    expect(car('lot-car-1').cleanliness).toBe(0.3)
  })
})
