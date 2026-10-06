import type { Customer } from './customers'
import { carName } from './interactables'
import type { CarLocation, InventoryCar } from './inventory'

/**
 * How clean the cars in stock are, from 1 (just washed) to 0 (filthy). Cars
 * gather dust overnight (more out on the lot than in the showroom) and a little
 * more each time a customer looks one over. Washing (the lot porter, or the
 * player) sets a car back to 1. Clean cars sell a little better.
 */

/** Dust a car gathers each night, by where it's parked. */
export const NIGHTLY_DIRT: Record<CarLocation, number> = { lot: 0.2, showroom: 0.1 }
/** Fingerprints and footprints from one customer looking a car over. */
export const BROWSE_DIRT = 0.03
/** Grime Nazma rubs onto a car he smudges (see `sim/nazma`). */
export const SMUDGE_DIRT = 0.5
/** Accept-chance bonus for a spotless car; a filthy one loses as much. */
export const MAX_CLEAN_BONUS = 0.08
/** Clean enough that washing it again would make no difference. */
export const SPOTLESS = 0.95
/** The porter washes cars dirtier than this. */
export const WASH_BELOW = 0.8

export type Condition = 'Clean' | 'Dusty' | 'Dirty'

/** At or above: still looks clean. */
const CLEAN_FROM = 0.7
/** At or above: dusty; below: dirty. */
const DUSTY_FROM = 0.4

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function conditionOf(cleanliness: number): Condition {
  if (cleanliness >= CLEAN_FROM) return 'Clean'
  return cleanliness >= DUSTY_FROM ? 'Dusty' : 'Dirty'
}

/**
 * What a car's state adds to a customer's accept chance: +8% for a spotless
 * car down to −8% for a filthy one, nothing at half clean.
 */
export function cleanlinessBonus(cleanliness: number): number {
  return (clamp01(cleanliness) * 2 - 1) * MAX_CLEAN_BONUS
}

/** Maps the cars `fn` changes, returning the same array when it changes none. */
function mapCars(inventory: InventoryCar[], fn: (c: InventoryCar) => number): InventoryCar[] {
  let changed = false
  const next = inventory.map((c) => {
    const cleanliness = clamp01(fn(c))
    if (cleanliness === c.cleanliness) return c
    changed = true
    return { ...c, cleanliness }
  })
  return changed ? next : inventory
}

/** A night's dust on every car still in stock. */
export function dirtyOvernight(inventory: InventoryCar[]): InventoryCar[] {
  return mapCars(inventory, (c) =>
    c.status === 'available' ? c.cleanliness - NIGHTLY_DIRT[c.location] : c.cleanliness,
  )
}

/** Car `id` washed: spotless again. Returns the same array if it's unknown or already spotless. */
export function washCar(inventory: InventoryCar[], id: string): InventoryCar[] {
  return mapCars(inventory, (c) => (c.id === id ? 1 : c.cleanliness))
}

/**
 * Car `id` smudged by Nazma: `SMUDGE_DIRT` dirtier. Returns the same array if
 * it's unknown, sold or already filthy.
 */
export function smudgeCar(inventory: InventoryCar[], id: string): InventoryCar[] {
  return mapCars(inventory, (c) =>
    c.id === id && c.status === 'available' ? c.cleanliness - SMUDGE_DIRT : c.cleanliness,
  )
}

/**
 * Dirt from the customers who finished looking at a car between `prev` and
 * `next`. Returns the same inventory when nobody did.
 */
export function browseDirt(
  inventory: InventoryCar[],
  prev: readonly Customer[],
  next: readonly Customer[],
): InventoryCar[] {
  const visits = new Map<string, number>()
  for (const c of next) {
    const was = prev.find((x) => x.id === c.id)
    if (!was) continue
    for (let i = was.browsed; i < c.browsed; i++) {
      const carId = c.browseCarIds[i]
      if (carId) visits.set(carId, (visits.get(carId) ?? 0) + 1)
    }
  }
  if (visits.size === 0) return inventory
  return mapCars(inventory, (c) => c.cleanliness - BROWSE_DIRT * (visits.get(c.id) ?? 0))
}

/** Why `car` can't be washed now, or null if it can. */
export function washBlocker(car: InventoryCar | undefined): string | null {
  if (!car || car.status !== 'available') return 'That car has been sold.'
  return car.cleanliness >= SPOTLESS ? `The ${carName(car.model)} is already spotless.` : null
}

/**
 * The car the porter should wash next: the dirtiest in stock below
 * `WASH_BELOW`, skipping any in `exclude`. Null when everything is clean enough.
 */
export function dirtiestCar(
  inventory: readonly InventoryCar[],
  exclude: ReadonlySet<string> = new Set(),
): InventoryCar | null {
  let best: InventoryCar | null = null
  for (const c of inventory) {
    if (c.status !== 'available' || c.cleanliness >= WASH_BELOW || exclude.has(c.id)) continue
    if (!best || c.cleanliness < best.cleanliness) best = c
  }
  return best
}
