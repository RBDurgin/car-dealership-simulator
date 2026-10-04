import { create } from 'zustand'
import { reduceAction, type ActionEvent, type ActiveAction } from '../sim/actions'
import { isClosed, startOfDay, toStep, type GameTime } from '../sim/clock'
import {
  generateCustomer,
  reduceCustomers,
  type Customer,
  type CustomerEvent,
} from '../sim/customers'
import type { ActionId } from '../sim/interactables'
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
  /** Esc: close the menu if open, otherwise stop everything the player is doing. */
  cancelAll: () => void
  closeInspect: () => void
  showNotice: (text: string) => void
  clearNotice: (id: number) => void
  tickClock: (t: GameTime) => void
  /** Sells a car at `price` (default MSRP). False if it isn't for sale. */
  sellCar: (id: string, price?: number) => boolean
  /** Dev cheat: refills sold spaces, skipping any `canPlace` vetoes. */
  devRestock: (canPlace?: (car: InventoryCar) => boolean) => void
  /** Progress reported by the world (or, from 2e, the player) for one customer. */
  dispatchCustomer: (ev: CustomerEvent) => void
  cycleTimeScale: () => void
}

let nextOrderId = 1
let nextActionId = 1
let nextNoticeId = 1
let nextCustomerId = 1

/** Arrivals and new customers. Seeded per day; starting the next day re-seeds it (2e). */
const customerRng: Rng = createRng(CUSTOMER_SEED + 1)

export const useGame = create<GameState>((set, get) => {
  const dispatch = (ev: ActionEvent) => {
    const { next, finished } = reduceAction(get().activeAction, ev)
    set({ activeAction: next })
    if (!finished) return
    if (finished.action === 'inspect') set({ inspectedId: finished.targetId })
    else if (finished.action === 'getCoffee') get().showNotice('Ahh, fresh coffee.')
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
    timeScale: 1,
    issueMoveOrder: (tx, tz) => {
      dispatch({ type: 'cancel' })
      set({ moveOrder: { id: nextOrderId++, tx, tz }, menu: null })
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
      set({ moveOrder: null, menu: null, inspectedId: null })
      dispatch({ type: 'request', id: nextActionId++, targetId, action })
    },
    arriveAction: (id) => dispatch({ type: 'arrive', id, now: performance.now() }),
    completeAction: (id) => dispatch({ type: 'complete', id }),
    cancelAction: () => dispatch({ type: 'cancel' }),
    cancelAll: () => {
      if (get().menu) return set({ menu: null })
      dispatch({ type: 'cancel' })
      set({ moveOrder: null, inspectedId: null })
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
      // Waiting customers lose patience, new ones arrive, and at closing everyone heads out.
      const minutes = step.day === s.clock.day ? step.minute - s.clock.minute : 0
      let customers = reduceCustomers(s.customers, { type: 'tick', minutes })
      const { schedule, count } = takeDue(s.arrivals, step.minute)
      if (count > 0) {
        const stock = availableCars(s.inventory)
        const arrived = Array.from({ length: count }, () =>
          generateCustomer(`customer-${nextCustomerId++}`, stock, customerRng),
        )
        customers = [...customers, ...arrived]
      }
      if (isClosed(step)) customers = reduceCustomers(customers, { type: 'close' })
      set({ clock: step, customers, arrivals: schedule })
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
    dispatchCustomer: (ev) => {
      const customers = reduceCustomers(get().customers, ev)
      if (customers !== get().customers) set({ customers })
    },
    cycleTimeScale: () =>
      set((s) => {
        const i = DEV_TIME_SCALES.indexOf(s.timeScale as (typeof DEV_TIME_SCALES)[number])
        return { timeScale: DEV_TIME_SCALES[(i + 1) % DEV_TIME_SCALES.length] }
      }),
  }
})
