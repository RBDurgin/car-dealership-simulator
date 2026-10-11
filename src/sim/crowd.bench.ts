import { expect, test } from 'vitest'
import type { PathStep } from './agent'
import { crowdStep, SEP_RADIUS, SpatialHash, type Agent } from './crowd'
import { EXPANSION_IDS } from './expansions'
import type { Grid, Vec2 } from './grid'
import { buildLayout, createGrid } from './layout'
import { canStand } from './movement'
import { createRng } from './rng'

/**
 * The crowd at 60 walkers (`npm run bench`): one frame at 60 fps and 1×, every
 * walker taking its substep among the others, as `scene/walker`'s `moveAlong`
 * does. Prints µs per frame as JSON; the numbers go in `docs/PERF.md`.
 */

const FRAMES = 3000

const AGENTS = 60
const SPEED = 2.2
const DT = 1 / 60
/** Where they mill about: the front lot and the showroom, about 30 × 16 tiles. */
const AREA = { tx: 4, tz: 4, w: 30, h: 16 }

interface World {
  grid: Grid
  agents: (Agent & { waypoints: Vec2[] })[]
  next: () => number
}

function world(): World {
  const grid = createGrid(buildLayout(EXPANSION_IDS))
  const rng = createRng(18)
  const next = () => rng.next()
  const spot = (): Vec2 => {
    for (;;) {
      const p = grid.tileToWorld(
        AREA.tx + Math.floor(next() * AREA.w),
        AREA.tz + Math.floor(next() * AREA.h),
      )
      if (canStand(grid, p.x, p.z)) return p
    }
  }
  const agents = Array.from({ length: AGENTS }, (_, i) => ({
    id: `w${i}`,
    pos: spot(),
    waypoints: [spot()],
  }))
  // Give each a new goal once they get there, so the crowd keeps moving.
  const retarget = (a: World['agents'][number]) => {
    if (a.waypoints.length === 0) a.waypoints.push(spot())
  }
  return { grid, agents, next: () => (agents.forEach(retarget), 0) }
}

/** The crowd as 18c built it: a fresh list for every walker, checked against everyone. */
function allPairsFrame(w: World): void {
  w.next()
  for (const self of w.agents) {
    const neighbours: Agent[] = []
    for (const a of w.agents) {
      const t = w.grid.worldToTile(a.pos.x, a.pos.z)
      if (w.grid.isWalkable(t.tx, t.tz)) neighbours.push({ id: a.id, pos: a.pos })
    }
    crowdStep(w.grid, self, self.waypoints, SPEED, DT, neighbours, true)
  }
}

/** Kept between frames, as `scene/runtime` and `scene/walker` keep them. */
const hash = new SpatialHash()
const near: Agent[] = []
const step: PathStep = { x: 0, z: 0, dx: 0, dz: 0, moved: 0 }
/** As far as `moveAlong` looks: `SEP_RADIUS`, plus how far they and anyone else may walk in a frame. */
const REACH = SEP_RADIUS + (SPEED + 3) * DT

/** The crowd as 18d builds it: gathered and hashed once a frame, each walker checking its cells. */
function hashedFrame(w: World): void {
  w.next()
  hash.build(w.agents)
  for (const self of w.agents) {
    hash.near(self.pos, REACH, near)
    crowdStep(w.grid, self, self.waypoints, SPEED, DT, near, true, step)
  }
}

/** µs per frame over `FRAMES` frames, after as many to warm up. */
function perFrame(frame: (w: World) => void): number {
  const w = world()
  for (let i = 0; i < FRAMES; i++) frame(w)
  const t = performance.now()
  for (let i = 0; i < FRAMES; i++) frame(w)
  return Number((((performance.now() - t) / FRAMES) * 1000).toFixed(1))
}

test('crowd frame, 60 walkers', () => {
  const result = { allPairs: perFrame(allPairsFrame), hashed: perFrame(hashedFrame) }
  console.log(JSON.stringify({ crowdFrameMicros: result }, null, 2))
  expect(result.hashed).toBeGreaterThan(0)
})
