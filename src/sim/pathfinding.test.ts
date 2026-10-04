import { describe, expect, it } from 'vitest'
import { Grid, type Tile } from './grid'
import { hasLineOfSight } from './movement'
import { findPath, smoothPath } from './pathfinding'

function assertValidSteps(grid: Grid, path: Tile[]) {
  for (let i = 0; i < path.length; i++) {
    expect(grid.isWalkable(path[i].tx, path[i].tz)).toBe(true)
    if (i === 0) continue
    const dx = path[i].tx - path[i - 1].tx
    const dz = path[i].tz - path[i - 1].tz
    expect(Math.max(Math.abs(dx), Math.abs(dz))).toBe(1)
    if (dx !== 0 && dz !== 0) {
      // no corner cutting
      expect(grid.isWalkable(path[i - 1].tx + dx, path[i - 1].tz)).toBe(true)
      expect(grid.isWalkable(path[i - 1].tx, path[i - 1].tz + dz)).toBe(true)
    }
  }
}

describe('findPath', () => {
  it('finds a straight path on an open grid', () => {
    const grid = new Grid(10, 10)
    const path = findPath(grid, { tx: 0, tz: 0 }, { tx: 5, tz: 0 })!
    expect(path).toHaveLength(6)
    expect(path.every((t) => t.tz === 0)).toBe(true)
    expect(path[0]).toEqual({ tx: 0, tz: 0 })
    expect(path[5]).toEqual({ tx: 5, tz: 0 })
  })

  it('returns a single tile when start equals goal', () => {
    const grid = new Grid(5, 5)
    expect(findPath(grid, { tx: 2, tz: 2 }, { tx: 2, tz: 2 })).toEqual([{ tx: 2, tz: 2 }])
  })

  it('routes around obstacles through the gap', () => {
    const grid = new Grid(10, 10)
    grid.blockRect(5, 0, 1, 9) // wall with a gap at tz = 9
    const path = findPath(grid, { tx: 0, tz: 0 }, { tx: 9, tz: 0 })!
    expect(path).not.toBeNull()
    assertValidSteps(grid, path)
    expect(path.some((t) => t.tx === 5 && t.tz === 9)).toBe(true)
  })

  it('returns null when the target is unreachable', () => {
    const grid = new Grid(10, 10)
    grid.blockRect(5, 0, 1, 10)
    expect(findPath(grid, { tx: 0, tz: 0 }, { tx: 9, tz: 0 })).toBeNull()
  })

  it('returns null when the goal is blocked or out of bounds', () => {
    const grid = new Grid(10, 10)
    grid.setBlocked(3, 3)
    expect(findPath(grid, { tx: 0, tz: 0 }, { tx: 3, tz: 3 })).toBeNull()
    expect(findPath(grid, { tx: 0, tz: 0 }, { tx: 10, tz: 0 })).toBeNull()
  })

  it('does not cut corners', () => {
    const grid = new Grid(4, 4)
    grid.setBlocked(1, 0)
    const path = findPath(grid, { tx: 0, tz: 0 }, { tx: 1, tz: 1 })!
    expect(path).toEqual([
      { tx: 0, tz: 0 },
      { tx: 0, tz: 1 },
      { tx: 1, tz: 1 },
    ])

    grid.setBlocked(0, 1)
    expect(findPath(grid, { tx: 0, tz: 0 }, { tx: 1, tz: 1 })).toBeNull()
  })
})

describe('findPath with extraCost', () => {
  it('routes around a costly tile when there is a detour', () => {
    const grid = new Grid(5, 3)
    const costly = grid.index(2, 1)
    const path = findPath(grid, { tx: 0, tz: 1 }, { tx: 4, tz: 1 }, (i) => (i === costly ? 4 : 0))!
    assertValidSteps(grid, path)
    expect(path.some((t) => t.tx === 2 && t.tz === 1)).toBe(false)
  })

  it('still goes through it when it is the only way', () => {
    const grid = new Grid(5, 3)
    grid.blockRect(2, 0, 1, 1)
    grid.blockRect(2, 2, 1, 1)
    const costly = grid.index(2, 1)
    const path = findPath(grid, { tx: 0, tz: 1 }, { tx: 4, tz: 1 }, (i) => (i === costly ? 4 : 0))!
    expect(path).not.toBeNull()
    expect(path.some((t) => t.tx === 2 && t.tz === 1)).toBe(true)
  })
})

describe('smoothPath', () => {
  it('collapses an open-field path to its endpoints', () => {
    const grid = new Grid(10, 10)
    const path = findPath(grid, { tx: 0, tz: 0 }, { tx: 7, tz: 4 })!
    expect(smoothPath(grid, path)).toEqual([
      { tx: 0, tz: 0 },
      { tx: 7, tz: 4 },
    ])
  })

  it('keeps corners around obstacles and every segment stays clear', () => {
    const grid = new Grid(10, 10)
    grid.blockRect(5, 0, 1, 9)
    const path = findPath(grid, { tx: 0, tz: 0 }, { tx: 9, tz: 0 })!
    const smooth = smoothPath(grid, path)
    expect(smooth.length).toBeGreaterThan(2)
    expect(smooth.length).toBeLessThan(path.length)
    expect(smooth[0]).toEqual(path[0])
    expect(smooth[smooth.length - 1]).toEqual(path[path.length - 1])
    for (let i = 1; i < smooth.length; i++) {
      const a = grid.tileToWorld(smooth[i - 1].tx, smooth[i - 1].tz)
      const b = grid.tileToWorld(smooth[i].tx, smooth[i].tz)
      expect(hasLineOfSight(grid, a, b)).toBe(true)
    }
  })
})
