import type { Grid, Tile, Vec2 } from './grid'
import { hasLineOfSight, moveWithCollision, PLAYER_RADIUS } from './movement'
import { smoothPath } from './pathfinding'

/** Shortest signed angle from `a` to `b`, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a))
}

/** Frame-rate independent ease of an angle toward `target`. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + angleDiff(current, target) * (1 - Math.exp(-lambda * dt))
}

/** Heading (rotation about +y, 0 = facing +z) that looks from `from` toward `to`. */
export function headingTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

/**
 * Tile path → world waypoints, smoothed. Drops the start tile's center when the
 * mover at `from` can already see the next waypoint, so it doesn't step back first.
 */
export function toWaypoints(grid: Grid, tiles: Tile[], from: Vec2): Vec2[] {
  const wps = smoothPath(grid, tiles).map((t) => grid.tileToWorld(t.tx, t.tz))
  if (wps.length > 1 && hasLineOfSight(grid, from, wps[1], PLAYER_RADIUS)) wps.shift()
  return wps
}

export interface PathStep {
  /** New position. */
  x: number
  z: number
  /** Intended displacement this step, before collision (for facing). */
  dx: number
  dz: number
  /** Distance actually covered. */
  moved: number
}

/** A step shorter than this (world units) counts as no movement at all. */
const PINNED_EPSILON = 1e-6

/**
 * Moves `pos` up to `speed * dt` along `waypoints`, shifting off each waypoint as
 * it's reached (the array is mutated). If geometry pins the mover so it can't make
 * progress, the remaining waypoints are dropped rather than leaving it stuck.
 */
export function stepAlongPath(
  grid: Grid,
  pos: Vec2,
  waypoints: Vec2[],
  speed: number,
  dt: number,
  radius = PLAYER_RADIUS,
): PathStep {
  const out: PathStep = { x: pos.x, z: pos.z, dx: 0, dz: 0, moved: 0 }
  if (waypoints.length === 0) return out

  const step = speed * dt
  const wp = waypoints[0]
  const tx = wp.x - pos.x
  const tz = wp.z - pos.z
  const dist = Math.hypot(tx, tz)
  if (dist <= step) {
    out.dx = tx
    out.dz = tz
    waypoints.shift()
  } else {
    out.dx = (tx / dist) * step
    out.dz = (tz / dist) * step
  }
  // Already on the waypoint (give or take float error): nothing to move, and
  // not being pinned either.
  if (Math.hypot(out.dx, out.dz) <= PINNED_EPSILON) return out

  const next = moveWithCollision(grid, pos, out.dx, out.dz, radius)
  out.moved = Math.hypot(next.x - pos.x, next.z - pos.z)
  out.x = next.x
  out.z = next.z
  if (out.moved <= PINNED_EPSILON) waypoints.length = 0
  return out
}
