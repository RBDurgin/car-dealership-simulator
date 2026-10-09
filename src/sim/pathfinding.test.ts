import { describe, expect, it } from 'vitest'
import { Grid, type Tile } from './grid'
import { hasLineOfSight } from './movement'
import { findPath, findPathToAny, smoothPath } from './pathfinding'
import { createRng } from './rng'

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

/** What a path costs to walk: 1 a straight step, √2 a diagonal, plus `extra` per tile stepped on. */
function pathCost(grid: Grid, path: Tile[], extra: (i: number) => number = () => 0): number {
  let cost = 0
  for (let i = 1; i < path.length; i++) {
    const diagonal = path[i].tx !== path[i - 1].tx && path[i].tz !== path[i - 1].tz
    cost += (diagonal ? Math.SQRT2 : 1) + extra(grid.index(path[i].tx, path[i].tz))
  }
  return cost
}

/** The cheapest cost from `start` to each tile, by plain Dijkstra over the same moves. */
function cheapest(grid: Grid, start: Tile, extra: (i: number) => number): Float64Array {
  const dist = new Float64Array(grid.width * grid.height).fill(Infinity)
  const done = new Uint8Array(dist.length)
  dist[grid.index(start.tx, start.tz)] = 0
  for (;;) {
    let cur = -1
    for (let i = 0; i < dist.length; i++) {
      if (!done[i] && dist[i] < Infinity && (cur < 0 || dist[i] < dist[cur])) cur = i
    }
    if (cur < 0) return dist
    done[cur] = 1
    const cx = cur % grid.width
    const cz = Math.floor(cur / grid.width)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if ((dx === 0 && dz === 0) || !grid.isWalkable(cx + dx, cz + dz)) continue
        if (dx && dz && !(grid.isWalkable(cx + dx, cz) && grid.isWalkable(cx, cz + dz))) continue
        const ni = grid.index(cx + dx, cz + dz)
        const cost = dist[cur] + (dx && dz ? Math.SQRT2 : 1) + extra(ni)
        if (cost < dist[ni]) dist[ni] = cost
      }
    }
  }
}

describe('findPathToAny', () => {
  it('finds the cheapest path on random grids, with and without extra costs', () => {
    const rng = createRng(7)
    for (let trial = 0; trial < 60; trial++) {
      const grid = new Grid(18, 12)
      for (let i = 0; i < 60; i++) grid.setBlocked(rng.int(0, 17), rng.int(0, 11))
      const costly = new Set(Array.from({ length: 20 }, () => rng.int(0, 18 * 12 - 1)))
      const extra = trial % 2 ? (i: number) => (costly.has(i) ? 3 : 0) : () => 0
      const start = { tx: rng.int(0, 17), tz: rng.int(0, 11) }
      grid.setBlocked(start.tx, start.tz, false)
      const goals = Array.from({ length: rng.int(1, 3) }, () => ({
        tx: rng.int(0, 17),
        tz: rng.int(0, 11),
      }))
      const dist = cheapest(grid, start, extra)
      const best = Math.min(
        ...goals
          .filter((t) => grid.isWalkable(t.tx, t.tz))
          .map((t) => dist[grid.index(t.tx, t.tz)]),
      )
      const path = findPathToAny(grid, start, goals, extra)
      if (best === Infinity) {
        expect(path, `trial ${trial}`).toBeNull()
        continue
      }
      expect(path, `trial ${trial}`).not.toBeNull()
      assertValidSteps(grid, path!)
      expect(path![0]).toEqual(start)
      expect(goals).toContainEqual(path![path!.length - 1])
      expect(pathCost(grid, path!, extra)).toBeCloseTo(best, 9)
    }
  })

  it('crosses the full-size map quickly, and gives up on a walled-off goal', () => {
    const grid = new Grid(60, 30)
    for (let tx = 4; tx < 56; tx += 6) grid.blockRect(tx, tx % 12 ? 0 : 4, 1, 26)
    const t0 = performance.now()
    for (let i = 0; i < 50; i++) {
      expect(findPath(grid, { tx: 0, tz: 0 }, { tx: 59, tz: 29 })).not.toBeNull()
    }
    grid.blockRect(57, 27, 3, 1)
    grid.blockRect(57, 28, 1, 2)
    expect(findPath(grid, { tx: 0, tz: 0 }, { tx: 59, tz: 29 })).toBeNull()
    // Generous, so a slow CI machine doesn't fail it; the old linear open list took far longer.
    expect(performance.now() - t0).toBeLessThan(500)
  })
})
