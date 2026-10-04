import { create } from 'zustand'
import { reduceAction, type ActionEvent, type ActiveAction } from '../sim/actions'
import { isClosed, startOfDay, toStep, type GameTime } from '../sim/clock'
import {
  chooseTarget,
  decide,
  generateCustomer,
  reduceCustomers,
  type Customer,
  type CustomerEvent,
  type CustomerPhase,
} from '../sim/customers'
import {
  actionBlocker,
  CONVERSATION_PHASES,
  customerActions,
  DEAL_PHASES,
  dealCustomer,
  emptyStats,
  isCustomerAction,
  recordDepartures,
  type DayStats,
} from '../sim/deal'
import { carName, type ActionId } from '../sim/interactables'
import {
  availableCars,
  buildInventory,
  restock,
  sellCar as markSold,
  type InventoryCar,
} from '../sim/inventory'
import { createRng, type Rng } from '../sim/rng'
import { planArrivals, takeDue, type ArrivalSchedule } from '../sim/spawner'
import { WALL_MODES, type WallMode } from '../sim/walls'
import { formatMoney } from '../ui/format'

export interface MoveOrder {
  id: number
  tx: number
  tz: number
}

export interface ActionMenu {
  targetId: string
  /** Screen position (CSS px) the menu opens at. */
  x: number
  y: number
}

export interface Notice {
  id: number
  text: string
}

export const STARTING_CASH = 25_000
const INVENTORY_SEED = 2026
const CUSTOMER_SEED = 7_000
const DEAL_SEED = 9_000
/** Dev-only game speeds, cycled with a key. 1 is normal. */
export const DEV_TIME_SCALES = [1, 4, 16] as const

// Discrete events only. Per-frame values live in refs / scene/runtime.ts.
interface GameState {
  moveOrder: MoveOrder | null
  showGrid: boolean
  wallMode: WallMode
  /** Target camera yaw; changes only on a Q/E rotation (the eased value lives in runtime). */
  viewYaw: number
  /** Click-to-move and actions are mutually exclusive: setting one clears the other. */
  activeAction: ActiveAction | null
  hoveredId: string | null
  menu: ActionMenu | null
  /** Car whose info panel is open. */
  inspectedId: string | null
  notice: Notice | null
  /** Game time in 10-minute steps; the precise running time lives in scene/runtime. */
  clock: GameTime
  cash: number
  /** Changes only when a car is sold or restocked. */
  inventory: InventoryCar[]
  /** Everyone on the lot. Changes on phase changes and 10-minute patience ticks. */
  customers: Customer[]
  /** Today's arrival times and how many have shown up. */
  arrivals: ArrivalSchedule
  /** Today's visitors, sales and walk-outs, for the end-of-day summary. */
  dayStats: DayStats
  /** Game speed multiplier for the clock and customers (dev only; always 1 otherwise). */
  timeScale: number
  issueMoveOrder: (tx: number, tz: number) => void
  clearMoveOrder: () => void
  toggleGrid: () => void
  cycleWallMode: () => void
  setViewYaw: (yaw: number) => void
  setHovered: (id: string | null) => void
  openMenu: (targetId: string, x: number, y: number) => void
  closeMenu: () => void
  requestAction: (targetId: string, action: ActionId) => void
  arriveAction: (id: number) => void
  completeAction: (id: number) => void
  cancelAction: () => void
  /** Esc: close the menu if open, otherwise stop what the player is doing, then the deal. */
  cancelAll: () => void
  /** The player walked off (WASD or a button): stops everything and ends any conversation. */
  walkAway: () => void
  closeInspect: () => void
  showNotice: (text: string) => void
  clearNotice: (id: number) => void
  tickClock: (t: GameTime) => void
  /** Sells a car at `price` (default MSRP). False if it isn't for sale. */
  sellCar: (id: string, price?: number) => boolean
  /** Dev cheat: refills sold spaces, skipping any `canPlace` vetoes. */
  devRestock: (canPlace?: (car: InventoryCar) => boolean) => void
  /** Progress reported by the world (or the player) for one customer. */
  dispatchCustomer: (ev: CustomerEvent) => void
  /** A customer has thought over the offer on the table and answers it. */
  answerOffer: (id: string) => void
  /** From the end-of-day summary: opens the doors on the next day. */
  startNextDay: () => void
  cycleTimeScale: () => void
}

let nextOrderId = 1
let nextActionId = 1
let nextNoticeId = 1
let nextCustomerId = 1

// Seeded per day, so a day plays out the same given the same choices.
/** Arrivals and new customers. */
let customerRng: Rng = createRng(CUSTOMER_SEED + 1)
/** Customers' answers to offers. */
let dealRng: Rng = createRng(DEAL_SEED + 1)

export const useGame = create<GameState>((set, get) => {
  const notify = (text: string) => get().showNotice(text)

  /**
   * Stores a new customer list. Everything that follows from customers changing
   * happens here: after closing nobody goes back to waiting, walk-outs are
   * tallied, and menus and actions aimed at someone who can't take them any
   * more are dropped.
   */
  const commit = (next: Customer[]) => {
    const s = get()
    const customers = isClosed(s.clock) ? reduceCustomers(next, { type: 'close' }) : next
    if (customers === s.customers) return
    // A customer under the cursor or menu who left, or has nothing left to offer.
    const gone = (id: string | null) => {
      if (!id || !s.customers.some((c) => c.id === id)) return false
      const c = customers.find((x) => x.id === id)
      return !c || customerActions(c).length === 0
    }
    set({
      customers,
      dayStats: recordDepartures(s.dayStats, s.customers, customers),
      menu: gone(s.menu?.targetId ?? null) ? null : s.menu,
      hoveredId: gone(s.hoveredId) ? null : s.hoveredId,
    })
    // Aimed at a customer who left or moved on (e.g. ran out of patience on the
    // way), or a deal to close with nobody left to sign it.
    const a = get().activeAction
    const blocker = a && actionBlocker(a.action, a.targetId, customers)
    if (a && blocker) {
      dispatch({ type: 'cancel' })
      notify(blocker)
    }
  }

  /** Puts the deal customer back to waiting if they're in one of `phases`. */
  const endDeal = (phases: readonly CustomerPhase[], message?: (name: string) => string) => {
    const deal = dealCustomer(get().customers)
    if (!deal || !phases.includes(deal.phase)) return
    commit(reduceCustomers(get().customers, { type: 'cancel', id: deal.id }))
    if (message) notify(message(deal.name))
  }

  const dispatch = (ev: ActionEvent) => {
    const prev = get().activeAction
    const { next, finished } = reduceAction(prev, ev)
    set({ activeAction: next })
    // Getting up from the desk mid-paperwork leaves the customer waiting.
    if (prev?.action === 'closeDeal' && next?.id !== prev.id && finished?.id !== prev.id) {
      endDeal(['signing'])
    }
    if (!finished) return
    switch (finished.action) {
      case 'inspect':
        return set({ inspectedId: finished.targetId })
      case 'getCoffee':
        return notify('Ahh, fresh coffee.')
      case 'greet':
        return greet(finished.targetId)
      case 'offer':
        return offer(finished.targetId)
      case 'closeDeal':
        return closeDeal()
    }
  }

  const greet = (id: string) => {
    const s = get()
    const c = s.customers.find((x) => x.id === id)
    if (!c) return
    const carId = chooseTarget(c, availableCars(s.inventory))
    commit(reduceCustomers(s.customers, { type: 'greet', id, carId }))
    if (carId === null) notify(`${c.name}: "Nothing here for me, sorry."`)
  }

  const offer = (id: string) => {
    const s = get()
    const c = s.customers.find((x) => x.id === id)
    const car = s.inventory.find((x) => x.id === c?.targetCarId)
    if (!c || !car || car.status !== 'available') return notify("That car isn't for sale any more.")
    commit(reduceCustomers(s.customers, { type: 'offer', id, carId: car.id, price: car.msrp }))
  }

  const closeDeal = () => {
    const s = get()
    const c = s.customers.find((x) => x.phase === 'signing')
    const car = s.inventory.find((x) => x.id === c?.offer?.carId)
    if (!c?.offer || !car || !get().sellCar(car.id, c.offer.price)) {
      endDeal(['signing'])
      return notify('The deal fell through.')
    }
    const sale = {
      customerName: c.name,
      carId: car.id,
      model: car.model,
      price: c.offer.price,
      minute: s.clock.minute,
    }
    set({ dayStats: { ...get().dayStats, sales: [...get().dayStats.sales, sale] } })
    commit(reduceCustomers(get().customers, { type: 'signed', id: c.id }))
    notify(`Sold the ${carName(car.model)} to ${c.name} for ${formatMoney(sale.price)}!`)
  }

  return {
    moveOrder: null,
    showGrid: false,
    wallMode: 'cutaway',
    viewYaw: Math.PI / 4,
    activeAction: null,
    hoveredId: null,
    menu: null,
    inspectedId: null,
    notice: null,
    clock: startOfDay(1),
    cash: STARTING_CASH,
    inventory: buildInventory(createRng(INVENTORY_SEED)),
    customers: [],
    arrivals: planArrivals(customerRng),
    dayStats: emptyStats(),
    timeScale: 1,
    issueMoveOrder: (tx, tz) => {
      dispatch({ type: 'cancel' })
      set({ moveOrder: { id: nextOrderId++, tx, tz }, menu: null })
      // Walking off mid-conversation; someone following just keeps following.
      endDeal(CONVERSATION_PHASES)
    },
    clearMoveOrder: () => set({ moveOrder: null }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    cycleWallMode: () =>
      set((s) => ({
        wallMode: WALL_MODES[(WALL_MODES.indexOf(s.wallMode) + 1) % WALL_MODES.length],
      })),
    setViewYaw: (viewYaw) => set({ viewYaw }),
    setHovered: (hoveredId) => {
      if (get().hoveredId !== hoveredId) set({ hoveredId })
    },
    openMenu: (targetId, x, y) => set({ menu: { targetId, x, y } }),
    closeMenu: () => set({ menu: null }),
    requestAction: (targetId, action) => {
      const blocker = actionBlocker(action, targetId, get().customers)
      if (blocker) {
        set({ menu: null })
        return notify(blocker)
      }
      // Turning to someone else ends the conversation; greeting someone else also
      // drops a customer who was following.
      const deal = dealCustomer(get().customers)
      if (deal && deal.id !== targetId) {
        endDeal(isCustomerAction(action) ? DEAL_PHASES : CONVERSATION_PHASES)
      }
      set({ moveOrder: null, menu: null, inspectedId: null })
      dispatch({ type: 'request', id: nextActionId++, targetId, action })
    },
    arriveAction: (id) => dispatch({ type: 'arrive', id, now: performance.now() }),
    completeAction: (id) => dispatch({ type: 'complete', id }),
    cancelAction: () => dispatch({ type: 'cancel' }),
    cancelAll: () => {
      const s = get()
      if (s.menu) return set({ menu: null })
      const busy = s.activeAction || s.moveOrder || s.inspectedId
      dispatch({ type: 'cancel' })
      set({ moveOrder: null, inspectedId: null })
      // A first Esc stops what the player is doing; with nothing left to stop it
      // lets a customer who was following wait instead.
      if (busy) endDeal(CONVERSATION_PHASES)
      else endDeal(DEAL_PHASES, (name) => `${name} will wait for you.`)
    },
    walkAway: () => {
      dispatch({ type: 'cancel' })
      set({ moveOrder: null })
      endDeal(CONVERSATION_PHASES)
    },
    closeInspect: () => set({ inspectedId: null }),
    showNotice: (text) => set({ notice: { id: nextNoticeId++, text } }),
    clearNotice: (id) => {
      if (get().notice?.id === id) set({ notice: null })
    },
    tickClock: (t) => {
      const step = toStep(t)
      const s = get()
      if (step.day === s.clock.day && step.minute === s.clock.minute) return
      // Waiting customers lose patience, new ones arrive, and at closing everyone
      // heads out (`commit` applies the close).
      const minutes = step.day === s.clock.day ? step.minute - s.clock.minute : 0
      const except = s.activeAction?.targetId
      let customers = reduceCustomers(s.customers, { type: 'tick', minutes, except })
      const { schedule, count } = takeDue(s.arrivals, step.minute)
      if (count > 0) {
        const stock = availableCars(s.inventory)
        const arrived = Array.from({ length: count }, () =>
          generateCustomer(`customer-${nextCustomerId++}`, stock, customerRng),
        )
        customers = [...customers, ...arrived]
      }
      set({
        clock: step,
        arrivals: schedule,
        dayStats: { ...s.dayStats, visitors: s.dayStats.visitors + count },
      })
      commit(customers)
    },
    sellCar: (id, price) => {
      const s = get()
      const car = s.inventory.find((c) => c.id === id)
      const inventory = markSold(s.inventory, id)
      if (!car || inventory === s.inventory) return false
      // The car is gone: drop anything that still points at it.
      if (s.activeAction?.targetId === id) dispatch({ type: 'cancel' })
      set({
        inventory,
        cash: s.cash + (price ?? car.msrp),
        menu: s.menu?.targetId === id ? null : s.menu,
        hoveredId: s.hoveredId === id ? null : s.hoveredId,
        inspectedId: s.inspectedId === id ? null : s.inspectedId,
      })
      return true
    },
    devRestock: (canPlace) => {
      const inventory = restock(get().inventory, canPlace)
      if (inventory !== get().inventory) set({ inventory })
    },
    dispatchCustomer: (ev) => commit(reduceCustomers(get().customers, ev)),
    answerOffer: (id) => {
      const s = get()
      const c = s.customers.find((x) => x.id === id)
      if (c?.phase !== 'considering' || !c.offer) return
      const { price } = c.offer
      const car = s.inventory.find((x) => x.id === c.offer?.carId)
      const accepted = !!car && car.status === 'available' && decide(c, car, price, dealRng)
      commit(reduceCustomers(s.customers, { type: 'respond', id, accepted }))
      if (accepted) notify(`${c.name}: "Deal! Lead the way."`)
      else if (price > c.budget) notify(`${c.name}: "That's more than I can spend."`)
      else notify(`${c.name}: "I'll pass, thanks."`)
    },
    startNextDay: () => {
      const s = get()
      if (!isClosed(s.clock) || s.customers.length > 0) return
      const day = s.clock.day + 1
      customerRng = createRng(CUSTOMER_SEED + day)
      dealRng = createRng(DEAL_SEED + day)
      // GameClock picks up the new day and resyncs the running time.
      set({ clock: startOfDay(day), arrivals: planArrivals(customerRng), dayStats: emptyStats() })
    },
    cycleTimeScale: () =>
      set((s) => {
        const i = DEV_TIME_SCALES.indexOf(s.timeScale as (typeof DEV_TIME_SCALES)[number])
        return { timeScale: DEV_TIME_SCALES[(i + 1) % DEV_TIME_SCALES.length] }
      }),
  }
})
