import { washCar } from '../../sim/cleanliness'
import { expansionsUp } from '../../sim/expansions'
import { payoffOnSale } from '../../sim/floorPlan'
import { formatMoney } from '../../sim/format'
import { carName } from '../../sim/interactables'
import { buildInventory, restock, roundTo100, sellCar as markSold } from '../../sim/inventory'
import { CHANNELS, launchCampaign } from '../../sim/marketing'
import { cancelOrder, claimedByOrder, freeSlots, placeOrder } from '../../sim/ordering'
import { emptyMonthSales } from '../../sim/quota'
import { createRng } from '../../sim/rng'
import { reservedSlots } from '../../sim/sellers'
import { nextUsedId, rollUsedCar, stockValue, usedStockCar } from '../../sim/usedCars'
import { dispatch, notify, type Kit } from '../core'
import { orderInvoice } from '../derived'
import { INVENTORY_SEED } from '../rng'
import type { GameState } from '../types'
import { amendLog } from './career'

type EconomyKeys =
  | 'inventory'
  | 'orders'
  | 'campaigns'
  | 'monthSales'
  | 'sellCar'
  | 'orderCar'
  | 'launchCampaign'
  | 'cancelOrder'
  | 'payOff'
  | 'devRestock'
  | 'devUsedCar'

/**
 * Cash, stock, orders, the floor plan, ads and the month's sales. (Cash,
 * the quota, purchases and the franchise tier start with `dayOne`.)
 */
export function economySlice(k: Kit): Pick<GameState, EconomyKeys> {
  const { get, set } = k
  return {
    inventory: buildInventory(createRng(INVENTORY_SEED)),
    orders: [],
    campaigns: [],
    monthSales: emptyMonthSales(),
    sellCar: (id, price) => {
      const s = get()
      const car = s.inventory.find((c) => c.id === id)
      const inventory = markSold(s.inventory, id)
      if (!car || inventory === s.inventory) return false
      // The car is gone: drop anything that still points at it.
      if (s.activeAction?.targetId === id) dispatch(k, { type: 'cancel' })
      // The bank takes back what it lent on a floored car; the rest is ours.
      set({
        inventory,
        cash: s.cash + (price ?? car.msrp) - payoffOnSale(car),
        menu: s.menu?.targetId === id ? null : s.menu,
        hoveredId: s.hoveredId === id ? null : s.hoveredId,
        inspectedId: s.inspectedId === id ? null : s.inspectedId,
      })
      return true
    },
    orderCar: (model, financing) => {
      const s = get()
      const book = { ...s, reserved: reservedSlots(s.purchases), tier: s.franchise }
      const result = placeOrder(book, model, financing, s.clock.day, orderInvoice(s))
      if (!result.ok) {
        notify(k, result.reason)
        return false
      }
      set({ orders: result.orders, cash: result.cash })
      const how = financing === 'cash' ? 'paid cash' : 'on the floor plan'
      notify(
        k,
        `Ordered a ${carName(model)} for ${formatMoney(result.order.cost)} (${how}). It arrives tomorrow.`,
      )
      return true
    },
    launchCampaign: (channel) => {
      const s = get()
      const day = s.clock.day
      const n = s.campaigns.filter((c) => c.channel === channel && c.startDay === day + 1).length
      const result = launchCampaign(s, channel, day, `${channel}-${day}-${n + 1}`)
      if (!result.ok) {
        notify(k, result.reason)
        return false
      }
      const { label, cost, days } = CHANNELS[channel]
      set({
        cash: result.cash,
        campaigns: result.campaigns,
        dayStats: { ...s.dayStats, marketing: s.dayStats.marketing + cost },
      })
      amendLog(k)
      notify(k, `${label} booked for ${formatMoney(cost)}. It runs for ${days} days from tomorrow.`)
      return true
    },
    cancelOrder: (id) => {
      const s = get()
      const order = s.orders.find((o) => o.id === id)
      if (!order) return
      set(cancelOrder(s, id))
      notify(k, `Cancelled the ${carName(order.model)}.`)
    },
    payOff: (carId) => {
      const s = get()
      const car = s.inventory.find((c) => c.id === carId)
      if (!car || car.status !== 'available' || !car.floored) return
      if (s.cash < car.cost) return notify(k, 'Not enough cash to pay it off.')
      set({
        cash: s.cash - car.cost,
        inventory: s.inventory.map((c) => (c === car ? { ...c, floored: false } : c)),
      })
      notify(k, `Paid off the ${carName(car.model)}.`)
    },
    devRestock: (canPlace) => {
      // A sold car's space may since have been ordered into.
      const { orders } = get()
      const inventory = restock(
        get().inventory,
        (car) => !claimedByOrder(car.rect, orders) && (canPlace?.(car) ?? true),
      )
      if (inventory !== get().inventory) set({ inventory })
    },
    devUsedCar: (canPlace) => {
      const s = get()
      const day = s.clock.day
      const spec = rollUsedCar(createRng(Date.now()), day)
      const id = nextUsedId([...s.inventory, ...s.purchases], day)
      const cars = freeSlots(s.inventory, s.orders, reservedSlots(s.purchases), expansionsUp(s))
        .filter((slot) => slot.location === 'lot')
        .map((slot) => usedStockCar(id, spec, slot, 0, day, 0.5))
      const car = cars.find((c) => canPlace?.(c) ?? true)
      if (!car) return notify(k, 'No free lot space for a used car.')
      set({
        inventory: [...s.inventory, { ...car, cost: roundTo100(stockValue(car, day)! * 0.9) }],
      })
    },
  }
}

/** Car `id` washed by the player. */
export function wash(k: Kit, id: string): void {
  const inventory = washCar(k.get().inventory, id)
  if (inventory === k.get().inventory) return
  const stats = k.get().dayStats
  k.set({ inventory, dayStats: { ...stats, washes: stats.washes + 1 } })
  const car = inventory.find((c) => c.id === id)
  if (car) notify(k, `The ${carName(car.model)} is spotless.`)
}
