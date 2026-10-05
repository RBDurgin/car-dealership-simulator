import { describe, expect, it } from 'vitest'
import {
  BROWSE_DIRT,
  browseDirt,
  cleanlinessBonus,
  conditionOf,
  dirtiestCar,
  dirtyOvernight,
  MAX_CLEAN_BONUS,
  NIGHTLY_DIRT,
  SPOTLESS,
  WASH_BELOW,
  washBlocker,
  washCar,
} from './cleanliness'
import type { Customer } from './customers'
import { buildInventory, sellCar, type InventoryCar } from './inventory'
import { createRng } from './rng'

const inventory = buildInventory(createRng(42))
const car = (inv: readonly InventoryCar[], id: string) => inv.find((c) => c.id === id)!
const withDirt = (dirt: Record<string, number>): InventoryCar[] =>
  inventory.map((c) => (c.id in dirt ? { ...c, cleanliness: dirt[c.id] } : c))

const browser = (id: string, browsed: number, browseCarIds: string[]): Customer => ({
  id,
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  companion: null,
  budget: 40_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds,
  browsed,
  targetCarId: browseCarIds[browseCarIds.length - 1] ?? null,
  offer: null,
  phase: 'browsing',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
})

describe('cleanliness', () => {
  it('starts every car spotless', () => {
    expect(inventory.every((c) => c.cleanliness === 1)).toBe(true)
  })

  it('reads as Clean, Dusty or Dirty', () => {
    expect(conditionOf(1)).toBe('Clean')
    expect(conditionOf(0.7)).toBe('Clean')
    expect(conditionOf(0.6)).toBe('Dusty')
    expect(conditionOf(0.4)).toBe('Dusty')
    expect(conditionOf(0.2)).toBe('Dirty')
  })

  it('adds up to +8% to the accept chance for a clean car and takes 8% off a filthy one', () => {
    expect(cleanlinessBonus(1)).toBeCloseTo(MAX_CLEAN_BONUS)
    expect(cleanlinessBonus(0.5)).toBeCloseTo(0)
    expect(cleanlinessBonus(0)).toBeCloseTo(-MAX_CLEAN_BONUS)
    expect(cleanlinessBonus(0.8)).toBeGreaterThan(cleanlinessBonus(0.6))
  })

  it('gathers dust overnight, faster out on the lot than in the showroom', () => {
    const night = dirtyOvernight(inventory)
    expect(car(night, 'lot-car-1').cleanliness).toBeCloseTo(1 - NIGHTLY_DIRT.lot)
    expect(car(night, 'display-1').cleanliness).toBeCloseTo(1 - NIGHTLY_DIRT.showroom)
    expect(NIGHTLY_DIRT.lot).toBeGreaterThan(NIGHTLY_DIRT.showroom)
    // A lot car left two nights looks dusty.
    expect(conditionOf(car(dirtyOvernight(night), 'lot-car-1').cleanliness)).toBe('Dusty')
  })

  it('never gets dirtier than 0, and leaves sold cars alone', () => {
    let inv = sellCar(withDirt({ 'lot-car-1': 0.05 }), 'lot-car-2')
    inv = dirtyOvernight(inv)
    expect(car(inv, 'lot-car-1').cleanliness).toBe(0)
    expect(car(inv, 'lot-car-2').cleanliness).toBe(1)
  })

  it('washes a car back to spotless', () => {
    const dirty = withDirt({ 'lot-car-1': 0.3 })
    expect(car(washCar(dirty, 'lot-car-1'), 'lot-car-1').cleanliness).toBe(1)
    // Unknown or already spotless: nothing changes.
    expect(washCar(dirty, 'nope')).toBe(dirty)
    expect(washCar(dirty, 'lot-car-2')).toBe(dirty)
  })

  it('dirties a car a little each time a customer finishes looking it over', () => {
    const prev = [browser('c1', 0, ['lot-car-1', 'lot-car-2']), browser('c2', 0, ['lot-car-1'])]
    const next = [browser('c1', 1, ['lot-car-1', 'lot-car-2']), browser('c2', 1, ['lot-car-1'])]
    const inv = browseDirt(inventory, prev, next)
    expect(car(inv, 'lot-car-1').cleanliness).toBeCloseTo(1 - 2 * BROWSE_DIRT)
    expect(car(inv, 'lot-car-2').cleanliness).toBe(1)
  })

  it('returns the same inventory when nobody finished looking at a car', () => {
    const c = [browser('c1', 0, ['lot-car-1'])]
    expect(browseDirt(inventory, c, c)).toBe(inventory)
    // Someone new on the lot hasn't looked at anything yet.
    expect(browseDirt(inventory, [], [browser('c1', 0, ['lot-car-1'])])).toBe(inventory)
  })

  it("won't wash a car that's sold or already spotless", () => {
    const dirty = withDirt({ 'lot-car-1': 0.5, 'lot-car-2': SPOTLESS })
    expect(washBlocker(car(dirty, 'lot-car-1'))).toBeNull()
    expect(washBlocker(car(dirty, 'lot-car-2'))).toMatch(/already spotless/)
    expect(washBlocker(car(sellCar(dirty, 'lot-car-1'), 'lot-car-1'))).toMatch(/sold/)
    expect(washBlocker(undefined)).toMatch(/sold/)
  })

  it('picks the dirtiest car in stock that needs a wash', () => {
    const dirty = withDirt({ 'lot-car-1': 0.6, 'lot-car-2': 0.3, 'display-1': WASH_BELOW })
    expect(dirtiestCar(dirty)?.id).toBe('lot-car-2')
    expect(dirtiestCar(dirty, new Set(['lot-car-2']))?.id).toBe('lot-car-1')
    expect(dirtiestCar(sellCar(dirty, 'lot-car-2'))?.id).toBe('lot-car-1')
    // Just at the threshold is clean enough.
    expect(dirtiestCar(withDirt({ 'display-1': WASH_BELOW }))).toBeNull()
    expect(dirtiestCar(inventory)).toBeNull()
  })
})
