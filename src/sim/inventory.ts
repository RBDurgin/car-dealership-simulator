import type { Grid } from './grid'
import {
  DISPLAY_CARS,
  LOT_CARS,
  PARKING_SPACES,
  parkedCarRect,
  PLATFORMS,
  type CarModel,
  type Facing,
  type Prop,
  type Rect,
} from './layout'
import type { Rng } from './rng'
import type { UsedInfo } from './usedCars'

export type CarStatus = 'available' | 'sold'
export type CarLocation = 'showroom' | 'lot'

export interface InventoryCar {
  id: string
  model: CarModel
  location: CarLocation
  /** Parking space for lot cars, null for showroom displays. */
  spaceIndex: number | null
  rect: Rect
  facing: Facing
  msrp: number
  /** What the dealership paid for it: the invoice price (see `COST_FRACTION`). */
  cost: number
  status: CarStatus
  /** 1 just washed, 0 filthy (see `sim/cleanliness`). */
  cleanliness: number
  /** The day it arrived on the lot: 1 for the opening stock. */
  arrivedDay: number
  /** Bought on the floor plan: the bank is owed its cost until it's sold or paid off. */
  floored: boolean
  /** A used car's year, miles and condition (see `sim/usedCars`), or null for a new one. */
  used: UsedInfo | null
}

/** List price per model before per-car variation (trim, options). */
export const BASE_MSRP: Record<CarModel, number> = {
  'hatchback-sports': 24_000,
  sedan: 28_000,
  van: 36_000,
  suv: 39_000,
  'sedan-sports': 44_000,
  truck: 52_000,
  'suv-luxury': 68_000,
}

/** Each car's MSRP is within ±this fraction of its model's base price. */
export const MSRP_VARIATION = 0.05

/** A car's dealer cost is between these fractions of its MSRP. */
export const COST_FRACTION = { min: 0.86, max: 0.92 }

export const roundTo100 = (n: number) => Math.round(n / 100) * 100

/** A car's sticker price: its model's base price, give or take `MSRP_VARIATION`. */
export function rollMsrp(model: CarModel, rng: Rng): number {
  const factor = 1 + (rng.next() * 2 - 1) * MSRP_VARIATION
  return roundTo100(BASE_MSRP[model] * factor)
}

function rollCost(msrp: number, rng: Rng): number {
  const { min, max } = COST_FRACTION
  return roundTo100(msrp * (min + rng.next() * (max - min)))
}

type Uncosted = Omit<InventoryCar, 'cost' | 'arrivedDay' | 'floored' | 'used'>

/**
 * Opening stock: the showroom displays plus the lot cars, priced from `rng`.
 * It's owned outright. Costs are rolled after every MSRP, so the MSRPs are the
 * same as before cars had a cost.
 */
export function buildInventory(rng: Rng): InventoryCar[] {
  const display = DISPLAY_CARS.map(({ platform, model }, i): Uncosted => ({
    id: `display-${i + 1}`,
    model,
    location: 'showroom',
    spaceIndex: null,
    rect: PLATFORMS[platform].rect,
    facing: PLATFORMS[platform].facing,
    msrp: rollMsrp(model, rng),
    status: 'available',
    cleanliness: 1,
  }))
  const lot = LOT_CARS.map(({ space, model }, i): Uncosted => {
    const s = PARKING_SPACES[space]
    return {
      id: `lot-car-${i + 1}`,
      model,
      location: 'lot',
      spaceIndex: space,
      rect: parkedCarRect(s),
      facing: s.facing,
      msrp: rollMsrp(model, rng),
      status: 'available',
      cleanliness: 1,
    }
  })
  return [...display, ...lot].map((c) => ({
    ...c,
    cost: rollCost(c.msrp, rng),
    arrivedDay: 1,
    floored: false,
    used: null,
  }))
}

export function availableCars(inventory: readonly InventoryCar[]): InventoryCar[] {
  return inventory.filter((c) => c.status === 'available')
}

/** The car as a renderable, blocking prop. */
export function carProp(car: InventoryCar): Prop {
  return {
    id: car.id,
    model: car.model,
    rect: car.rect,
    facing: car.facing,
    platform: car.location === 'showroom',
  }
}

/** Blocks the footprints of cars in stock and frees those of sold cars. */
export function applyToGrid(grid: Grid, inventory: readonly InventoryCar[]): void {
  for (const c of inventory) grid.setRectBlocked(c.rect, c.status === 'available')
}

/**
 * Marks a car sold. Returns the same array when the car is unknown or already
 * sold, so callers can tell nothing happened.
 */
export function sellCar(inventory: InventoryCar[], id: string): InventoryCar[] {
  const car = inventory.find((c) => c.id === id)
  if (!car || car.status !== 'available') return inventory
  return inventory.map((c) => (c === car ? { ...c, status: 'sold' } : c))
}

/** Cars still in stock, dropping the sold ones. Returns the same array if none were sold. */
export function dropSold(inventory: InventoryCar[]): InventoryCar[] {
  return inventory.some((c) => c.status === 'sold') ? availableCars(inventory) : inventory
}

/**
 * Dev cheat: puts sold cars back where they were. `canPlace` can veto a spot,
 * e.g. when someone is standing in it.
 */
export function restock(
  inventory: InventoryCar[],
  canPlace: (car: InventoryCar) => boolean = () => true,
): InventoryCar[] {
  if (!inventory.some((c) => c.status === 'sold' && canPlace(c))) return inventory
  return inventory.map((c) =>
    c.status === 'sold' && canPlace(c) ? { ...c, status: 'available' } : c,
  )
}
