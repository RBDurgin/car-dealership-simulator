import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { FLOOR_PLAN_DAILY_RATE } from '../sim/floorPlan'
import { DISPLAY_CARS } from '../sim/layout'
import { dailyIncentive, invoicePrice, orderCost } from '../sim/ordering'
import { createSave, parseSave } from '../sim/save'
import { STARTING_CASH, useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('ordering stock', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('takes cash for a cash order and gives it back on cancel', () => {
    expect(game().orderCar('sedan', 'cash')).toBe(true)
    const cost = orderCost('sedan', 1)
    expect(game().cash).toBe(STARTING_CASH - cost)
    expect(game().orders).toMatchObject([{ model: 'sedan', financing: 'cash', cost }])
    game().cancelOrder(game().orders[0].id)
    expect(game()).toMatchObject({ cash: STARTING_CASH, orders: [] })
  })

  it('refuses a cash order it can’t pay for, with the reason', () => {
    expect(game().orderCar('suv-luxury', 'cash')).toBe(false)
    expect(game().orders).toEqual([])
    expect(game().notice?.text).toBe('Not enough cash.')
  })

  it('orders on the floor plan → resume → delivers into the right slots → sells and pays interest', () => {
    // Day 1: sell a showroom car so its platform is free, then order one car of each kind.
    game().sellCar('display-2')
    const cashAfterSale = game().cash
    expect(game().orderCar('sedan', 'cash')).toBe(true)
    expect(game().orderCar('truck', 'floor')).toBe(true)
    const [cashOrder, floorOrder] = game().orders
    expect(cashOrder.slot).toEqual({ location: 'showroom', index: 1 })
    expect(floorOrder.slot).toEqual({ location: 'lot', index: 2 })
    expect(game().cash).toBe(cashAfterSale - cashOrder.cost)
    endDay()
    // Nothing floored is in stock yet, so no interest on day 1.
    expect(game().dayStats.interest).toBe(0)
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    expect(save.orders).toEqual(game().orders)

    // Day 2 played straight through, then resumed from the save: the same morning.
    game().startNextDay()
    const straight = game()
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().clock).toEqual({ day: 2, minute: OPEN_MINUTE })
    expect(game().inventory).toEqual(straight.inventory)
    expect(game().cash).toBe(straight.cash)
    expect(game().orders).toEqual([])
    expect(game().notice?.text).toBe('2 cars delivered: 1 on the lot, 1 in the showroom.')

    // The sold car is gone and the new ones are parked, clean.
    const inventory = game().inventory
    expect(inventory.some((c) => c.id === 'display-2')).toBe(false)
    expect(inventory.every((c) => c.status === 'available')).toBe(true)
    const sedan = inventory.find((c) => c.id === 'stock-2-1')!
    const truck = inventory.find((c) => c.id === 'stock-2-2')!
    expect(sedan).toMatchObject({
      model: 'sedan',
      location: 'showroom',
      rect: DISPLAY_CARS[1].rect,
      cost: cashOrder.cost,
      floored: false,
      cleanliness: 1,
      arrivedDay: 2,
    })
    expect(truck).toMatchObject({
      model: 'truck',
      location: 'lot',
      spaceIndex: 2,
      cost: floorOrder.cost,
      floored: true,
      cleanliness: 1,
    })

    // Selling the floored truck repays the bank out of the price.
    const before = game().cash
    expect(game().sellCar(truck.id, truck.msrp)).toBe(true)
    expect(game().cash).toBe(before + truck.msrp - truck.cost)
    expect(game().dayStats.interest).toBe(0)
  })

  it('charges a day’s interest on floored cars still in stock, and nets it', () => {
    game().orderCar('truck', 'floor')
    const cost = game().orders[0].cost
    endDay()
    game().startNextDay()
    const cash = game().cash
    endDay()
    const interest = Math.round(cost * FLOOR_PLAN_DAILY_RATE)
    expect(game().dayStats.interest).toBe(interest)
    expect(game().cash).toBe(cash - interest)
    expect(netIncome(game().dayStats)).toBe(-interest)
  })

  it('pays off a floored car from cash, so it stops accruing interest', () => {
    useGame.setState({ cash: 100_000 })
    game().orderCar('truck', 'floor')
    endDay()
    game().startNextDay()
    const truck = game().inventory.find((c) => c.floored)!
    game().payOff(truck.id)
    expect(game().cash).toBe(100_000 - truck.cost)
    expect(game().inventory.find((c) => c.id === truck.id)?.floored).toBe(false)
    endDay()
    expect(game().dayStats.interest).toBe(0)
  })

  it('won’t pay off a car without the cash', () => {
    game().orderCar('truck', 'floor')
    endDay()
    game().startNextDay()
    useGame.setState({ cash: 1_000 })
    const truck = game().inventory.find((c) => c.floored)!
    game().payOff(truck.id)
    expect(game().cash).toBe(1_000)
    expect(game().notice?.text).toBe('Not enough cash to pay it off.')
  })

  it('doesn’t restock a sold car into a space that has been ordered into', () => {
    game().sellCar('display-1')
    game().sellCar('display-2')
    game().orderCar('hatchback-sports', 'floor')
    game().devRestock()
    expect(game().inventory.find((c) => c.id === 'display-1')?.status).toBe('sold')
    expect(game().inventory.find((c) => c.id === 'display-2')?.status).toBe('available')
  })

  it('counts walk-ins who want a body type that isn’t in stock', () => {
    // Sell every truck and van on the lot.
    for (const c of game().inventory) if (c.model === 'truck') game().sellCar(c.id)
    let missedTrucks = 0
    for (let i = 0; i < 30; i++) {
      const id = game().walkIn('male-a')!
      const c = game().customers.find((x) => x.id === id)!
      if (c.preferredModels.every((m) => m === 'truck')) missedTrucks++
    }
    expect(missedTrucks).toBeGreaterThan(0)
    expect(game().dayStats.missed.truck).toBe(missedTrucks)
  })

  it('orders at the day’s incentive price', () => {
    const model = dailyIncentive(1)
    useGame.setState({ cash: 100_000 })
    game().orderCar(model, 'cash')
    expect(game().orders[0].cost).toBeLessThan(invoicePrice(model))
  })

  it('keeps yesterday’s missed demand for the stock panel', () => {
    useGame.setState({ dayStats: { ...game().dayStats, missed: { van: 2 } } })
    endDay()
    game().startNextDay()
    expect(game().missedYesterday).toEqual({ van: 2 })
    expect(game().dayStats.missed).toEqual({})
  })
})

describe('the stock panel', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('opens from the office computer', () => {
    game().requestAction('office-monitor', 'orderStock')
    game().arriveAction(game().activeAction!.id)
    expect(game().activeAction).toBeNull()
    expect(game().stockOpen).toBe(true)
  })

  it('shares the left edge with the staff panel: opening one closes the other', () => {
    game().toggleStaffPanel(true)
    game().toggleStockPanel()
    expect(game()).toMatchObject({ stockOpen: true, staffOpen: false })
    game().toggleStaffPanel()
    expect(game()).toMatchObject({ stockOpen: false, staffOpen: true })
  })

  it('closes on Esc', () => {
    game().toggleHelp(false)
    game().toggleStockPanel(true)
    game().cancelAll()
    expect(game().stockOpen).toBe(false)
  })
})
