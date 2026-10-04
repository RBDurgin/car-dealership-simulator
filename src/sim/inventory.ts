import type { Grid } from './grid'
import {
  DISPLAY_CARS,
  LOT_CARS,
  PARKING_SPACES,
  parkedCarRect,
  type CarModel,
  type Facing,
  type Prop,
  type Rect,
} from './layout'
import type { Rng } from './rng'

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
  status: CarStatus
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

function rollMsrp(model: CarModel, rng: Rng): number {
  const factor = 1 + (rng.next() * 2 - 1) * MSRP_VARIATION
  return Math.round((BASE_MSRP[model] * factor) / 100) * 100
}

/** Opening stock: the showroom displays plus the lot cars, priced from `rng`. */
export function buildInventory(rng: Rng): InventoryCar[] {
  const display = DISPLAY_CARS.map(({ model, rect, facing }, i): InventoryCar => ({
    id: `display-${i + 1}`,
    model,
    location: 'showroom',
    spaceIndex: null,
    rect,
    facing,
    msrp: rollMsrp(model, rng),
    status: 'available',
  }))
  const lot = LOT_CARS.map(({ space, model }, i): InventoryCar => {
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
    }
  })
  return [...display, ...lot]
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
