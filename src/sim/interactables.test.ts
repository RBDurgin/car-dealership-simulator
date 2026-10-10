import { describe, expect, it } from 'vitest'
import { Grid } from './grid'
import {
  approachTilesFor,
  buildInteractables,
  pathToInteractable,
  type Interactable,
} from './interactables'
import { applyToGrid, buildInventory, carProp } from './inventory'
import { buildLayout, createGrid, PROPS, SPAWN_TILE } from './layout'
import { findPathToAny } from './pathfinding'
import { createRng } from './rng'

function fakeInteractable(grid: Grid, rect: Interactable['rect']): Interactable {
  return {
    id: 'x',
    kind: 'car',
    name: 'X',
    rect,
    facing: 0,
    approachTiles: approachTilesFor(grid, rect),
    actions: ['inspect'],
  }
}

describe('approachTilesFor', () => {
  it('returns the walkable orthogonal ring, without corners', () => {
    const grid = new Grid(5, 5)
    grid.blockRect(1, 1, 2, 1)
    const tiles = approachTilesFor(grid, { tx: 1, tz: 1, w: 2, h: 1 })
    expect(tiles).toHaveLength(6)
    expect(tiles).toContainEqual({ tx: 0, tz: 1 })
    expect(tiles).toContainEqual({ tx: 3, tz: 1 })
    expect(tiles).not.toContainEqual({ tx: 0, tz: 0 })
  })

  it('skips blocked and out-of-bounds tiles', () => {
    const grid = new Grid(3, 3)
    grid.setBlocked(1, 0)
    expect(approachTilesFor(grid, { tx: 0, tz: 0, w: 1, h: 1 })).toEqual([{ tx: 0, tz: 1 }])
  })
})

describe('pathToInteractable', () => {
  it('goes to the cheapest approach tile', () => {
    const grid = new Grid(10, 3)
    grid.blockRect(4, 1, 2, 1)
    const it = fakeInteractable(grid, { tx: 4, tz: 1, w: 2, h: 1 })
    const path = pathToInteractable(grid, { tx: 0, tz: 1 }, it)!
    expect(path.at(-1)).toEqual({ tx: 3, tz: 1 })
  })

  it('ignores unreachable approach tiles', () => {
    // Wall across x=6 seals off the east side of the object.
    const grid = new Grid(10, 3)
    grid.blockRect(4, 1, 1, 1)
    grid.blockRect(6, 0, 1, 3)
    grid.blockRect(3, 0, 1, 3)
    const it = fakeInteractable(grid, { tx: 4, tz: 1, w: 1, h: 1 })
    const path = pathToInteractable(grid, { tx: 8, tz: 1 }, it)
    expect(path).toBeNull()
    const fromInside = pathToInteractable(grid, { tx: 5, tz: 0 }, it)!
    expect([
      { tx: 4, tz: 0 },
      { tx: 5, tz: 1 },
    ]).toContainEqual(fromInside.at(-1))
  })

  it('returns a one-tile path when already on an approach tile', () => {
    const grid = new Grid(5, 5)
    grid.setBlocked(2, 2)
    const it = fakeInteractable(grid, { tx: 2, tz: 2, w: 1, h: 1 })
    expect(pathToInteractable(grid, { tx: 2, tz: 3 }, it)).toEqual([{ tx: 2, tz: 3 }])
  })
})

describe('findPathToAny', () => {
  it('returns null when every goal is blocked', () => {
    const grid = new Grid(4, 4)
    grid.setBlocked(3, 3)
    expect(findPathToAny(grid, { tx: 0, tz: 0 }, [{ tx: 3, tz: 3 }])).toBeNull()
    expect(findPathToAny(grid, { tx: 0, tz: 0 }, [])).toBeNull()
  })
})

describe('dealership interactables', () => {
  const grid = createGrid(buildLayout())
  const inventory = buildInventory(createRng(1))
  applyToGrid(grid, inventory)
  const all = buildInteractables(grid, [...PROPS, ...inventory.map(carProp)])

  it('registers every car, the desk chair, the office computer and the coffee machine', () => {
    const cars = [...all.values()].filter((it) => it.kind === 'car')
    expect(cars).toHaveLength(inventory.length)
    expect(all.get('display-1')?.car?.location).toBe('Showroom display')
    expect(all.get('office-chair')?.actions).toEqual(['sit', 'closeDeal'])
    expect(all.get('coffee-machine')?.actions).toEqual(['getCoffee'])
    expect(all.get('office-monitor')?.actions).toEqual([
      'orderStock',
      'advertise',
      'improve',
      'calendar',
      'service',
      'nazmas',
    ])
    expect(all.has('office-desk')).toBe(false)
    expect(all.has('sales-monitor-1')).toBe(false)
  })

  it('can reach every interactable from the spawn', () => {
    for (const it of all.values()) {
      expect(pathToInteractable(grid, SPAWN_TILE, it), it.id).not.toBeNull()
    }
  })

  it('approaches the office computer from the desk chair side, not the guest side', () => {
    // The screen sits on the desk at (33, 5) facing the chair at (33, 4).
    expect(all.get('office-monitor')!.approachTiles).toEqual([
      { tx: 33, tz: 3 },
      { tx: 32, tz: 4 },
      { tx: 34, tz: 4 },
    ])
  })

  it('approaches the coffee machine from in front of the counter', () => {
    expect(all.get('coffee-machine')!.approachTiles).toEqual([{ tx: 34, tz: 10 }])
  })
})
