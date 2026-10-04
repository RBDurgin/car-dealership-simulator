import { describe, expect, it } from 'vitest'
import { toWaypoints } from './agent'
import {
  createStuckGuard,
  crowdStep,
  freeTiles,
  GHOST_AFTER,
  MAX_PUSH_SPEED,
  occupancy,
  occupiedCost,
  REPLAN_AFTER,
  rearm,
  Reservations,
  SEP_RADIUS,
  separation,
  watchProgress,
  type Agent,
  type StuckGuard,
} from './crowd'
import { Grid, type Tile, type Vec2 } from './grid'
import { buildLayout, createGrid } from './layout'
import { findPathToAny } from './pathfinding'

const at = (id: string, x: number, z: number): Agent => ({ id, pos: { x, z } })

describe('occupancy', () => {
  it('marks the tiles people stand on, leaving out self', () => {
    const grid = new Grid(4, 4)
    const a = at('a', grid.tileToWorld(1, 1).x, grid.tileToWorld(1, 1).z)
    const b = at('b', grid.tileToWorld(2, 3).x + 0.3, grid.tileToWorld(2, 3).z - 0.3)
    const occ = occupancy(grid, [a, b], 'a')
    expect([...occ]).toEqual([grid.index(2, 3)])
    const cost = occupiedCost(occ, 5)
    expect(cost(grid.index(2, 3))).toBe(5)
    expect(cost(grid.index(1, 1))).toBe(0)
  })
})

describe('separation', () => {
  it('pushes away from a close neighbour, harder the closer they are', () => {
    const far = separation(at('a', 0, 0), [at('b', 0.6, 0)])
    const near = separation(at('a', 0, 0), [at('b', 0.2, 0)])
    expect(far.x).toBeLessThan(0)
    expect(far.z).toBeCloseTo(0)
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x))
  })

  it('ignores anyone out of range, and self', () => {
    expect(separation(at('a', 0, 0), [at('b', SEP_RADIUS + 0.01, 0), at('a', 0, 0)])).toEqual({
      x: 0,
      z: 0,
    })
  })

  it('never pushes faster than the cap', () => {
    const crowd = [at('b', 0.1, 0), at('c', 0.1, 0.05), at('d', 0.1, -0.05)]
    const v = separation(at('a', 0, 0), crowd)
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(MAX_PUSH_SPEED + 1e-9)
  })

  it('splits two people on the same spot in opposite, repeatable directions', () => {
    const va = separation(at('a', 1, 1), [at('b', 1, 1)])
    const vb = separation(at('b', 1, 1), [at('a', 1, 1)])
    expect(Math.hypot(va.x, va.z)).toBeGreaterThan(0)
    expect(va.x).toBeCloseTo(-vb.x)
    expect(va.z).toBeCloseTo(-vb.z)
    expect(separation(at('a', 1, 1), [at('b', 1, 1)])).toEqual(va)
  })

  it('steers right of someone ahead when walking', () => {
    // Walking +x with someone just ahead: right of +x is -z.
    const v = separation(at('a', 0, 0), [at('b', 0.5, 0)], { x: 1, z: 0 })
    expect(v.z).toBeLessThan(0)
  })
})

describe('Reservations', () => {
  it('lets one walker claim a tile, and frees it on release', () => {
    const r = new Reservations()
    expect(r.reserve(5, 'a')).toBe(true)
    expect(r.isFree(5, 'a')).toBe(true)
    expect(r.isFree(5, 'b')).toBe(false)
    expect(r.reserve(5, 'b')).toBe(false)
    r.release('a')
    expect(r.isFree(5, 'b')).toBe(true)
  })

  it('keeps one claim per walker', () => {
    const r = new Reservations()
    r.reserve(1, 'a')
    r.reserve(2, 'a')
    expect(r.isFree(1, 'b')).toBe(true)
    expect(r.isFree(2, 'b')).toBe(false)
  })

  it('holds fixed spots alongside', () => {
    const r = new Reservations()
    r.hold([3, 4], 'seat')
    expect(r.reserve(3, 'a')).toBe(false)
    expect(r.isFree(4, 'a')).toBe(false)
  })

  it('filters goals down to the free ones, in order', () => {
    const grid = new Grid(4, 4)
    const r = new Reservations()
    const tiles: Tile[] = [
      { tx: 0, tz: 0 },
      { tx: 1, tz: 0 },
      { tx: 2, tz: 0 },
    ]
    r.reserve(grid.index(1, 0), 'b')
    expect(freeTiles(grid, r, tiles, 'a')).toEqual([tiles[0], tiles[2]])
    expect(freeTiles(grid, r, tiles, 'b')).toEqual(tiles)
  })
})

describe('watchProgress', () => {
  const wps = (): Vec2[] => [{ x: 10, z: 0 }]

  it('stays quiet while they get closer', () => {
    const g = createStuckGuard()
    const path = wps()
    for (let x = 0; x < 5; x += 0.5) {
      expect(watchProgress(g, { x, z: 0 }, path, 0.5)).toBe('ok')
    }
    expect(g.ghost).toBe(false)
  })

  it('re-plans once after stalling, then ghosts until the waypoint changes', () => {
    const g = createStuckGuard()
    const path = wps()
    const pos = { x: 0, z: 0 }
    const results: string[] = []
    for (let t = 0; t <= GHOST_AFTER + 0.2; t += 0.1) results.push(watchProgress(g, pos, path, 0.1))
    expect(results.filter((r) => r === 'replan')).toHaveLength(1)
    expect(results.indexOf('replan')).toBeGreaterThanOrEqual(Math.round(REPLAN_AFTER / 0.1) - 1)
    expect(g.ghost).toBe(true)
    // Reached it: a new waypoint starts fresh.
    watchProgress(g, pos, [{ x: 5, z: 5 }], 0.1)
    expect(g.ghost).toBe(false)
  })

  it('keeps counting through a re-plan', () => {
    const g = createStuckGuard()
    const pos = { x: 0, z: 0 }
    let path = wps()
    for (let t = 0; t < REPLAN_AFTER + 0.05; t += 0.1) {
      if (watchProgress(g, pos, path, 0.1) === 'replan') {
        path = [{ x: 0, z: 8 }]
        rearm(g, path)
      }
    }
    for (let t = 0; t < GHOST_AFTER; t += 0.1) watchProgress(g, pos, path, 0.1)
    expect(g.ghost).toBe(true)
  })
})

// A pure stand-in for scene/walker.ts: the same substep, push and stuck guard.
interface SimAgent extends Agent {
  goal: Tile
  waypoints: Vec2[]
  stuck: StuckGuard
  ghosted: boolean
}

const SPEED = 1.6
const DT = 0.05

function plan(grid: Grid, a: SimAgent, all: SimAgent[]): void {
  const occ = occupancy(grid, all, a.id)
  const tiles = findPathToAny(grid, grid.worldToTile(a.pos.x, a.pos.z), [a.goal], occupiedCost(occ))
  a.waypoints = tiles ? toWaypoints(grid, tiles, a.pos) : []
}

function spawn(grid: Grid, id: string, from: Tile, goal: Tile): SimAgent {
  return {
    id,
    pos: grid.tileToWorld(from.tx, from.tz),
    goal,
    waypoints: [],
    stuck: createStuckGuard(),
    ghosted: false,
  }
}

/** Runs everyone for `seconds`; returns the closest any two came while both were walking. */
function simulate(grid: Grid, agents: SimAgent[], seconds: number): number {
  for (const a of agents) plan(grid, a, agents)
  let closest = Infinity
  for (let t = 0; t < seconds; t += DT) {
    for (const a of agents) {
      crowdStep(grid, a, a.waypoints, SPEED, DT, agents, !a.stuck.ghost)
      if (watchProgress(a.stuck, a.pos, a.waypoints, DT) === 'replan') {
        const last = a.waypoints[a.waypoints.length - 1]
        plan(grid, a, agents)
        if (!last) a.waypoints = []
        rearm(a.stuck, a.waypoints)
      }
      a.ghosted ||= a.stuck.ghost
    }
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const [a, b] = [agents[i], agents[j]]
        if (a.waypoints.length === 0 || b.waypoints.length === 0) continue
        closest = Math.min(closest, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z))
      }
    }
  }
  return closest
}

function expectArrived(grid: Grid, agents: SimAgent[]): void {
  for (const a of agents) {
    const g = grid.tileToWorld(a.goal.tx, a.goal.tz)
    expect(Math.hypot(g.x - a.pos.x, g.z - a.pos.z), a.id).toBeLessThan(0.6)
  }
}

function expectSpread(agents: SimAgent[]): void {
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const [a, b] = [agents[i], agents[j]]
      expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z), `${a.id}/${b.id}`).toBeGreaterThan(
        0.5,
      )
    }
  }
}

describe('a crowd on the move', () => {
  it('two people walking head-on sidestep without walking through each other', () => {
    const grid = new Grid(20, 5)
    const agents = [
      spawn(grid, 'a', { tx: 2, tz: 2 }, { tx: 17, tz: 2 }),
      spawn(grid, 'b', { tx: 17, tz: 2 }, { tx: 2, tz: 2 }),
    ]
    const closest = simulate(grid, agents, 20)
    expectArrived(grid, agents)
    expect(closest).toBeGreaterThan(0.3)
    expect(agents.some((a) => a.ghosted)).toBe(false)
  })

  it('a dozen people cross through the office door and the showroom entrance', () => {
    const grid = createGrid(buildLayout())
    const agents: SimAgent[] = []
    // The office door (29, 5): three each way.
    const office: Tile[] = [
      { tx: 30, tz: 4 },
      { tx: 31, tz: 5 },
      { tx: 31, tz: 7 },
    ]
    const officeStarts: Tile[] = [
      { tx: 31, tz: 4 },
      { tx: 30, tz: 6 },
      { tx: 30, tz: 7 },
    ]
    for (let i = 0; i < 3; i++) {
      agents.push(spawn(grid, `in${i}`, { tx: 26, tz: 4 + i }, office[i]))
      agents.push(spawn(grid, `out${i}`, officeStarts[i], { tx: 25, tz: 4 + i }))
    }
    // The showroom entrance (21–22, 13): three each way.
    for (let i = 0; i < 3; i++) {
      agents.push(spawn(grid, `enter${i}`, { tx: 20 + i, tz: 16 }, { tx: 20 + i, tz: 10 }))
      agents.push(spawn(grid, `exit${i}`, { tx: 21 + i, tz: 11 }, { tx: 21 + i, tz: 17 }))
    }
    for (const a of agents) {
      expect(grid.isWalkable(a.goal.tx, a.goal.tz), a.id).toBe(true)
      const s = grid.worldToTile(a.pos.x, a.pos.z)
      expect(grid.isWalkable(s.tx, s.tz), a.id).toBe(true)
    }
    simulate(grid, agents, 60)
    expectArrived(grid, agents)
    expectSpread(agents)
  })
})
