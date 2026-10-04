import { describe, expect, it } from 'vitest'
import { Grid } from './grid'

describe('Grid', () => {
  it('converts between tiles and world coordinates', () => {
    const grid = new Grid(40, 30)
    expect(grid.tileToWorld(0, 0)).toEqual({ x: -19.5, z: -14.5 })
    expect(grid.worldToTile(-19.5, -14.5)).toEqual({ tx: 0, tz: 0 })
    expect(grid.worldToTile(0.1, 0.1)).toEqual({ tx: 20, tz: 15 })
    expect(grid.worldToTile(-0.1, -0.1)).toEqual({ tx: 19, tz: 14 })
  })

  it('treats out-of-bounds tiles as blocked', () => {
    const grid = new Grid(4, 4)
    expect(grid.isWalkable(-1, 0)).toBe(false)
    expect(grid.isWalkable(4, 0)).toBe(false)
    expect(grid.isWalkable(3, 3)).toBe(true)
  })

  it('blocks and unblocks tiles and rects', () => {
    const grid = new Grid(6, 6)
    grid.blockRect(1, 1, 2, 2)
    expect(grid.isWalkable(1, 1)).toBe(false)
    expect(grid.isWalkable(2, 2)).toBe(false)
    expect(grid.isWalkable(3, 3)).toBe(true)
    grid.setBlocked(1, 1, false)
    expect(grid.isWalkable(1, 1)).toBe(true)
  })
})
