import { describe, expect, it } from 'vitest'
import { Grid } from './grid'
import { canStand, hasLineOfSight, moveWithCollision } from './movement'

describe('canStand', () => {
  it('rejects positions overlapping blocked tiles or the map edge', () => {
    const grid = new Grid(10, 10)
    grid.setBlocked(5, 5)
    const c = grid.tileToWorld(5, 5)
    expect(canStand(grid, c.x, c.z)).toBe(false)
    expect(canStand(grid, c.x - 0.9, c.z)).toBe(true)
    expect(canStand(grid, c.x - 0.6, c.z)).toBe(false) // radius pokes into the tile
    expect(canStand(grid, -4.9, 0)).toBe(false) // x edge is -5
  })
})

describe('moveWithCollision', () => {
  it('slides along a wall instead of stopping', () => {
    const grid = new Grid(10, 10)
    grid.blockRect(6, 0, 1, 10) // wall at world x in [1, 2]
    const next = moveWithCollision(grid, { x: 0.6, z: 0 }, 0.2, 0.2)
    expect(next.x).toBe(0.6) // blocked on x
    expect(next.z).toBeCloseTo(0.2) // free on z
  })

  it('never ends inside a blocked tile', () => {
    const grid = new Grid(10, 10)
    grid.blockRect(4, 4, 2, 2)
    let p = { x: -3, z: -3 }
    for (let i = 0; i < 500; i++) {
      p = moveWithCollision(grid, p, 0.1, 0.07)
      expect(canStand(grid, p.x, p.z)).toBe(true)
    }
  })
})

describe('hasLineOfSight', () => {
  it('is blocked by obstacles and clear in the open', () => {
    const grid = new Grid(10, 10)
    grid.setBlocked(5, 5)
    const a = grid.tileToWorld(0, 5)
    expect(hasLineOfSight(grid, a, grid.tileToWorld(9, 5))).toBe(false)
    expect(hasLineOfSight(grid, a, grid.tileToWorld(9, 8))).toBe(true)
  })
})
