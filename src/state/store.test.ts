import { beforeEach, describe, expect, it } from 'vitest'
import { OPEN_MINUTE } from '../sim/clock'
import { STARTING_CASH, useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

describe('game store actions', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('closes the menu and clears any move order when an action is chosen', () => {
    game().issueMoveOrder(3, 4)
    game().openMenu('display-1', 10, 10)
    game().requestAction('display-1', 'inspect')
    expect(game().moveOrder).toBeNull()
    expect(game().menu).toBeNull()
    expect(game().activeAction).toMatchObject({ targetId: 'display-1', phase: 'approaching' })
  })

  it('cancels the action when a move order is issued', () => {
    game().requestAction('office-chair', 'sit')
    game().issueMoveOrder(3, 4)
    expect(game().activeAction).toBeNull()
    expect(game().moveOrder).toMatchObject({ tx: 3, tz: 4 })
  })

  it('opens the info panel when an inspect finishes', () => {
    game().requestAction('display-1', 'inspect')
    game().arriveAction(game().activeAction!.id)
    expect(game().activeAction).toBeNull()
    expect(game().inspectedId).toBe('display-1')
  })

  it('shows a notice when a coffee finishes', () => {
    game().requestAction('coffee-machine', 'getCoffee')
    const id = game().activeAction!.id
    game().arriveAction(id)
    expect(game().activeAction?.phase).toBe('performing')
    game().completeAction(id)
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/coffee/i)
  })

  it('Esc closes the menu first, then cancels everything', () => {
    game().requestAction('office-chair', 'sit')
    game().openMenu('display-1', 0, 0)
    game().cancelAll()
    expect(game().menu).toBeNull()
    expect(game().activeAction).not.toBeNull()
    game().cancelAll()
    expect(game().activeAction).toBeNull()
  })
})

describe('clock, cash and inventory', () => {
  beforeEach(() => useGame.setState(initial, true))

  const car = (id: string) => game().inventory.find((c) => c.id === id)!

  it('stores the clock in 10 minute steps and only updates on a new step', () => {
    expect(game().clock).toEqual({ day: 1, minute: OPEN_MINUTE })
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 4.2 })
    const before = game().clock
    expect(before.minute).toBe(OPEN_MINUTE)
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 12 })
    expect(game().clock).toEqual({ day: 1, minute: OPEN_MINUTE + 10 })
  })

  it('sells a car at MSRP by default', () => {
    const msrp = car('lot-car-2').msrp
    expect(game().sellCar('lot-car-2')).toBe(true)
    expect(car('lot-car-2').status).toBe('sold')
    expect(game().cash).toBe(STARTING_CASH + msrp)
    expect(game().sellCar('lot-car-2')).toBe(false)
    expect(game().cash).toBe(STARTING_CASH + msrp)
  })

  it('sells at a given price', () => {
    game().sellCar('display-1', 1000)
    expect(game().cash).toBe(STARTING_CASH + 1000)
  })

  it('drops the menu, inspect panel and action aimed at a sold car', () => {
    game().requestAction('display-1', 'inspect')
    game().setHovered('display-1')
    game().openMenu('display-1', 0, 0)
    game().sellCar('display-1')
    expect(game().activeAction).toBeNull()
    expect(game().menu).toBeNull()
    expect(game().hoveredId).toBeNull()
  })

  it('leaves unrelated state alone when selling', () => {
    game().requestAction('office-chair', 'sit')
    game().sellCar('display-1')
    expect(game().activeAction?.targetId).toBe('office-chair')
  })

  it('dev restock refills sold cars', () => {
    game().sellCar('lot-car-1')
    game().sellCar('lot-car-2')
    game().devRestock((c) => c.id !== 'lot-car-2')
    expect(car('lot-car-1').status).toBe('available')
    expect(car('lot-car-2').status).toBe('sold')
  })
})
