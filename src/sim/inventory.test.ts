import { describe, expect, it } from 'vitest'
import { Grid } from './grid'
import {
  applyToGrid,
  availableCars,
  BASE_MSRP,
  buildInventory,
  carProp,
  COST_FRACTION,
  MSRP_VARIATION,
  restock,
  sellCar,
} from './inventory'
import { DISPLAY_CARS, LOT_CARS } from './layout'
import { createRng } from './rng'

const inventory = buildInventory(createRng(42))

describe('buildInventory', () => {
  it('stocks every display and lot car with stable ids', () => {
    expect(inventory).toHaveLength(DISPLAY_CARS.length + LOT_CARS.length)
    expect(new Set(inventory.map((c) => c.id)).size).toBe(inventory.length)
    expect(inventory.find((c) => c.id === 'display-1')).toMatchObject({
      model: 'suv-luxury',
      location: 'showroom',
      spaceIndex: null,
    })
    expect(inventory.find((c) => c.id === 'lot-car-1')).toMatchObject({
      model: 'sedan',
      location: 'lot',
      spaceIndex: 0,
      rect: { tx: 2, tz: 21, w: 2, h: 3 },
    })
    expect(availableCars(inventory)).toHaveLength(inventory.length)
  })

  it('prices each car near its model base, rounded to $100', () => {
    for (const c of inventory) {
      const base = BASE_MSRP[c.model]
      expect(c.msrp % 100).toBe(0)
      expect(Math.abs(c.msrp - base)).toBeLessThanOrEqual(base * MSRP_VARIATION + 50)
    }
    // Same model, different cars: prices vary.
    const sedans = new Set(inventory.filter((c) => c.model === 'sedan').map((c) => c.msrp))
    expect(sedans.size).toBeGreaterThan(1)
  })

  it('costs each car a dealer price below its MSRP, rounded to $100', () => {
    for (const c of inventory) {
      expect(c.cost % 100).toBe(0)
      expect(c.cost).toBeGreaterThanOrEqual(c.msrp * COST_FRACTION.min - 50)
      expect(c.cost).toBeLessThanOrEqual(c.msrp * COST_FRACTION.max + 50)
    }
    expect(new Set(inventory.map((c) => c.cost / c.msrp)).size).toBeGreaterThan(1)
  })

  it('is deterministic for a seed', () => {
    expect(buildInventory(createRng(42))).toEqual(inventory)
    expect(buildInventory(createRng(7))).not.toEqual(inventory)
  })

  it('marks showroom cars for a display platform', () => {
    expect(carProp(inventory[0]).platform).toBe(true)
    expect(carProp(inventory.at(-1)!).platform).toBe(false)
  })
})

describe('selling and restocking', () => {
  it('sells an available car without touching the rest', () => {
    const next = sellCar(inventory, 'lot-car-3')
    expect(next).not.toBe(inventory)
    expect(next.find((c) => c.id === 'lot-car-3')!.status).toBe('sold')
    expect(availableCars(next)).toHaveLength(inventory.length - 1)
    expect(inventory.every((c) => c.status === 'available')).toBe(true)
  })

  it('ignores unknown and already-sold cars', () => {
    const sold = sellCar(inventory, 'lot-car-3')
    expect(sellCar(sold, 'lot-car-3')).toBe(sold)
    expect(sellCar(inventory, 'nope')).toBe(inventory)
  })

  it('restocks sold cars unless their spot is vetoed', () => {
    const sold = sellCar(sellCar(inventory, 'lot-car-1'), 'display-2')
    const partial = restock(sold, (c) => c.id !== 'display-2')
    expect(partial.find((c) => c.id === 'lot-car-1')!.status).toBe('available')
    expect(partial.find((c) => c.id === 'display-2')!.status).toBe('sold')
    expect(restock(sold)).toEqual(inventory)
    expect(restock(inventory)).toBe(inventory)
  })

  it('blocks stocked footprints and frees sold ones', () => {
    const grid = new Grid(40, 30)
    applyToGrid(grid, inventory)
    expect(grid.isWalkable(2, 21)).toBe(false)
    expect(grid.isWalkable(3, 23)).toBe(false)
    applyToGrid(grid, sellCar(inventory, 'lot-car-1'))
    expect(grid.isWalkable(2, 21)).toBe(true)
    expect(grid.isWalkable(3, 23)).toBe(true)
  })
})
