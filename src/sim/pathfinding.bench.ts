import { expect, test } from 'vitest'
import { occupiedCost } from './crowd'
import { EXPANSION_IDS } from './expansions'
import type { Tile } from './grid'
import { buildLayout, createGrid, SPAWN_TILE } from './layout'
import { findPathToAny } from './pathfinding'
import { createRng } from './rng'

/**
 * A* on the full map with every expansion up (`npm run bench`): a walk across
 * the front lot, one from the sidewalk to the east lot's far corner, and one
 * to a goal nobody can reach, each steering around 40 people. Prints µs per
 * search as JSON; the numbers go in `docs/PERF.md`.
 */

const RUNS = 2000

function setup() {
  const grid = createGrid(buildLayout(EXPANSION_IDS))
  const rng = createRng(18)
  const people = new Set<number>()
  while (people.size < 40) {
    const tx = rng.int(2, grid.width - 3)
    const tz = rng.int(2, grid.height - 3)
    if (grid.isWalkable(tx, tz)) people.add(grid.index(tx, tz))
  }
  const walkable = (from: Tile, step: number): Tile => {
    for (let t = from; ; t = { tx: t.tx + step, tz: t.tz })
      if (grid.isWalkable(t.tx, t.tz)) return t
  }
  // A goal walled in on every side, as a car's last free side can be.
  const walled = walkable({ tx: 30, tz: 8 }, 1)
  grid.setRectBlocked({ tx: walled.tx - 1, tz: walled.tz - 1, w: 3, h: 3 }, true)
  grid.setBlocked(walled.tx, walled.tz, false)
  return {
    grid,
    cost: occupiedCost(people),
    start: walkable(SPAWN_TILE, 1),
    lot: walkable({ tx: 22, tz: 18 }, 1),
    farCorner: walkable({ tx: grid.width - 3, tz: 3 }, -1),
    walled,
  }
}

/** µs per search over `RUNS`, after as many to warm up. */
function perSearch(fn: () => unknown): number {
  for (let i = 0; i < RUNS; i++) fn()
  const t = performance.now()
  for (let i = 0; i < RUNS; i++) fn()
  return Number((((performance.now() - t) / RUNS) * 1000).toFixed(1))
}

test('A* on the full map', () => {
  const s = setup()
  expect(findPathToAny(s.grid, s.start, [s.walled], s.cost)).toBeNull()
  expect(findPathToAny(s.grid, s.start, [s.farCorner], s.cost)).not.toBeNull()
  expect(findPathToAny(s.grid, s.start, [s.lot], s.cost)).not.toBeNull()
  const result = {
    acrossLot: perSearch(() => findPathToAny(s.grid, s.start, [s.lot], s.cost)),
    toFarCorner: perSearch(() => findPathToAny(s.grid, s.start, [s.farCorner], s.cost)),
    unreachable: perSearch(() => findPathToAny(s.grid, s.start, [s.walled], s.cost)),
    // A car parked or gone since the last search: the areas are labelled again first.
    unreachableAfterChange: perSearch(() => {
      s.grid.setBlocked(1, 1, s.grid.isWalkable(1, 1))
      return findPathToAny(s.grid, s.start, [s.walled], s.cost)
    }),
  }
  console.log(JSON.stringify({ pathMicros: result }, null, 2))
  expect(result.acrossLot).toBeGreaterThan(0)
})
