import { stepAlongPath, type PathStep } from './agent'
import type { Grid, Tile, Vec2 } from './grid'
import { moveWithCollision, PLAYER_RADIUS } from './movement'
import { hashSeed } from './rng'

/**
 * Light avoidance between walkers: an occupancy map that makes A* prefer free
 * tiles, goal-tile reservations so people spread out, a separation push between
 * neighbours, and a stuck guard so nobody ever stays pinned. Not a crowd sim.
 */

/** Someone standing in the world, as far as the crowd is concerned. */
export interface Agent {
  id: string
  pos: Vec2
}

/** Neighbours closer than this push each other apart. */
export const SEP_RADIUS = 0.8
/** Fastest a push moves anyone, in tiles per second. Below walking speed, so walkers still get through. */
export const MAX_PUSH_SPEED = 1.2
/** Extra A* cost of stepping onto someone's tile. Costly, but still passable. */
export const OCCUPIED_COST = 4
/** Progress (toward the next waypoint) that counts as getting somewhere. */
export const STUCK_PROGRESS = 0.2
/** Game seconds without progress before re-planning around the crowd. */
export const REPLAN_AFTER = 1
/** Game seconds without progress before walking through people to the next waypoint. */
export const GHOST_AFTER = 3

/** Tile indices with someone standing on them, leaving out `selfId`. */
export function occupancy(grid: Grid, agents: Iterable<Agent>, selfId?: string): Set<number> {
  const occ = new Set<number>()
  for (const a of agents) {
    if (a.id === selfId) continue
    const t = grid.worldToTile(a.pos.x, a.pos.z)
    if (grid.inBounds(t.tx, t.tz)) occ.add(grid.index(t.tx, t.tz))
  }
  return occ
}

/** A* step surcharge for occupied tiles (see `findPathToAny`'s `extraCost`). */
export function occupiedCost(occ: ReadonlySet<number>, penalty = OCCUPIED_COST) {
  return (index: number) => (occ.has(index) ? penalty : 0)
}

/** Deterministic direction (unit vector) for a pair of ids standing on the same spot. */
function pairDirection(a: string, b: string): Vec2 {
  const [lo, hi] = a < b ? [a, b] : [b, a]
  const angle = (hashSeed(`${lo}|${hi}`) / 2 ** 32) * Math.PI * 2
  const sign = a < b ? 1 : -1
  return { x: Math.sin(angle) * sign, z: Math.cos(angle) * sign }
}

/**
 * Push velocity on `self` away from neighbours closer than `radius`, stronger the
 * closer they are and capped at `MAX_PUSH_SPEED`. With a walking direction `dir`,
 * anyone ahead also nudges them to their right, so two people walking head-on
 * pass each other instead of stalling face to face.
 */
export function separation(
  self: Agent,
  neighbours: Iterable<Agent>,
  dir: Vec2 | null = null,
  radius = SEP_RADIUS,
): Vec2 {
  let vx = 0
  let vz = 0
  const dLen = dir ? Math.hypot(dir.x, dir.z) : 0
  for (const n of neighbours) {
    if (n.id === self.id) continue
    let dx = self.pos.x - n.pos.x
    let dz = self.pos.z - n.pos.z
    let d = Math.hypot(dx, dz)
    if (d >= radius) continue
    if (d < 1e-6) {
      const p = pairDirection(self.id, n.id)
      dx = p.x
      dz = p.z
      d = 0
    } else {
      dx /= d
      dz /= d
    }
    const strength = 1 - d / radius
    vx += dx * strength
    vz += dz * strength
    // They're ahead of us: keep right.
    if (dLen > 1e-6 && -(dx * dir!.x + dz * dir!.z) > 0) {
      vx += (dir!.z / dLen) * strength
      vz += (-dir!.x / dLen) * strength
    }
  }
  const len = Math.hypot(vx, vz)
  if (len < 1e-9) return { x: 0, z: 0 }
  // Full speed once someone's half way in; never faster.
  const speed = Math.min(1, len * 2) * MAX_PUSH_SPEED
  return { x: (vx / len) * speed, z: (vz / len) * speed }
}

/**
 * One substep for a walker in a crowd: along its path (as `stepAlongPath`, so
 * geometry pinning still drops the path), then pushed by `neighbours` unless
 * `push` is off. Walls clamp the push. Returns the path step; the push isn't
 * counted as walking.
 */
export function crowdStep(
  grid: Grid,
  self: Agent,
  waypoints: Vec2[],
  speed: number,
  dt: number,
  neighbours: Iterable<Agent>,
  push: boolean,
): PathStep {
  const s = stepAlongPath(grid, self.pos, waypoints, speed, dt)
  self.pos.x = s.x
  self.pos.z = s.z
  if (push) {
    const dir = s.dx !== 0 || s.dz !== 0 ? { x: s.dx, z: s.dz } : null
    const v = separation(self, neighbours, dir)
    if (v.x !== 0 || v.z !== 0) {
      const next = moveWithCollision(grid, self.pos, v.x * dt, v.z * dt, PLAYER_RADIUS)
      self.pos.x = next.x
      self.pos.z = next.z
    }
  }
  return s
}

/**
 * Who has claimed which goal tile, so walkers pick a free spot (a free side of a
 * car) when there is one. Each walker holds at most one tile; fixed spots (the
 * guest chair, staff posts) can be held for good under a pseudo-owner.
 */
export class Reservations {
  private readonly byTile = new Map<number, string>()
  private readonly byOwner = new Map<string, number[]>()

  /** Whether `index` is unclaimed, or claimed by `id`. */
  isFree(index: number, id: string): boolean {
    const owner = this.byTile.get(index)
    return owner === undefined || owner === id
  }

  /** Claims `index` for `id`, dropping their previous claim. False (claiming nothing) if it's taken. */
  reserve(index: number, id: string): boolean {
    this.release(id)
    if (!this.isFree(index, id)) return false
    this.byTile.set(index, id)
    this.byOwner.set(id, [index])
    return true
  }

  /** Claims every free one of `indices` for `id`, keeping their other claims. */
  hold(indices: Iterable<number>, id: string): void {
    const held = this.byOwner.get(id) ?? []
    for (const i of indices) {
      if (!this.isFree(i, id)) continue
      this.byTile.set(i, id)
      if (!held.includes(i)) held.push(i)
    }
    this.byOwner.set(id, held)
  }

  release(id: string): void {
    for (const i of this.byOwner.get(id) ?? []) this.byTile.delete(i)
    this.byOwner.delete(id)
  }

  clear(): void {
    this.byTile.clear()
    this.byOwner.clear()
  }
}

/** The free tiles of `tiles` for `id`, in order. */
export function freeTiles(grid: Grid, res: Reservations, tiles: Tile[], id: string): Tile[] {
  return tiles.filter((t) => res.isFree(grid.index(t.tx, t.tz), id))
}

/**
 * Watches a walker's progress toward its next waypoint. Re-plans once if they
 * stall, then lets them walk through people (`ghost`) until they reach it.
 */
export interface StuckGuard {
  /** The waypoint being watched; a different one means they reached it (or were sent elsewhere). */
  target: Vec2 | null
  /** Closest they've got to it. */
  best: number
  /** Game seconds since they last got closer. */
  timer: number
  replanned: boolean
  /** Separation off until they reach the waypoint. */
  ghost: boolean
}

export function createStuckGuard(): StuckGuard {
  return { target: null, best: Infinity, timer: 0, replanned: false, ghost: false }
}

function resetStuck(g: StuckGuard, target: Vec2 | null): void {
  g.target = target
  g.best = Infinity
  g.timer = 0
  g.replanned = false
  g.ghost = false
}

/** Updates the guard after `dt` game seconds. Returns 'replan' once, when it's time to try another way. */
export function watchProgress(
  g: StuckGuard,
  pos: Vec2,
  waypoints: readonly Vec2[],
  dt: number,
): 'ok' | 'replan' {
  const wp = waypoints[0] ?? null
  if (wp !== g.target) resetStuck(g, wp)
  if (!wp) return 'ok'
  const d = Math.hypot(wp.x - pos.x, wp.z - pos.z)
  if (d < g.best - STUCK_PROGRESS) {
    // The first measurement after a re-plan doesn't count as progress.
    if (g.best !== Infinity) g.timer = 0
    g.best = d
    return 'ok'
  }
  g.timer += dt
  if (g.timer >= GHOST_AFTER) g.ghost = true
  if (!g.replanned && g.timer >= REPLAN_AFTER) {
    g.replanned = true
    return 'replan'
  }
  return 'ok'
}

/** After a re-plan: watch the new path's first waypoint without forgetting how long they've been stuck. */
export function rearm(g: StuckGuard, waypoints: readonly Vec2[]): void {
  g.target = waypoints[0] ?? null
  g.best = Infinity
}
