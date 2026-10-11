import { describe, expect, it } from 'vitest'
import { Grid } from './grid'
import { createRng } from './rng'

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
    grid.setRectBlocked({ tx: 1, tz: 1, w: 2, h: 2 }, false)
    expect(grid.isWalkable(2, 1)).toBe(true)
    expect(grid.isWalkable(2, 2)).toBe(true)
  })
})

describe('Grid.area', () => {
  /** Whether `b` can be walked to from `a`, flooding 8 ways without cutting corners. */
  function reachable(grid: Grid, a: number, b: number): boolean {
    const seen = new Set([a])
    const queue = [a]
    while (queue.length > 0) {
      const i = queue.shift()!
      if (i === b) return true
      const x = i % grid.width
      const z = Math.floor(i / grid.width)
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        if (!grid.isWalkable(x + dx, z + dz)) continue
        if (dx && dz && !(grid.isWalkable(x + dx, z) && grid.isWalkable(x, z + dz))) continue
        const j = grid.index(x + dx, z + dz)
        if (seen.has(j)) continue
        seen.add(j)
        queue.push(j)
      }
    }
    return false
  }

  it('gives two walkable tiles the same area exactly when one can be walked to from the other', () => {
    const rng = createRng(18)
    for (let trial = 0; trial < 30; trial++) {
      const grid = new Grid(12, 9)
      for (let i = 0; i < 20 + trial * 2; i++) grid.setBlocked(rng.int(0, 11), rng.int(0, 8))
      for (let n = 0; n < 40; n++) {
        const a = rng.int(0, 12 * 9 - 1)
        const b = rng.int(0, 12 * 9 - 1)
        const open = (i: number) => grid.isWalkable(i % 12, Math.floor(i / 12))
        if (!open(a)) expect(grid.area(a)).toBe(-1)
        if (!open(a) || !open(b)) continue
        expect(grid.area(a) === grid.area(b), `trial ${trial}: ${a} ${b}`).toBe(
          reachable(grid, a, b),
        )
      }
    }
  })

  it('labels again after the grid changes', () => {
    const grid = new Grid(5, 3)
    const left = grid.index(0, 1)
    const right = grid.index(4, 1)
    expect(grid.area(left)).toBe(grid.area(right))
    grid.blockRect(2, 0, 1, 3)
    expect(grid.area(left)).not.toBe(grid.area(right))
    grid.setBlocked(2, 1, false)
    expect(grid.area(left)).toBe(grid.area(right))
    const walled = new Grid(5, 3)
    walled.blockRect(2, 0, 1, 3)
    grid.copyFrom(walled)
    expect(grid.area(left)).not.toBe(grid.area(right))
  })
})
