import type { Grid, Vec2 } from './grid'

export const PLAYER_RADIUS = 0.3
export const PLAYER_SPEED = 5 // tiles per second

/** True if a square of half-width `radius` centered at (x, z) overlaps no blocked tile. */
export function canStand(grid: Grid, x: number, z: number, radius = PLAYER_RADIUS): boolean {
  for (const ox of [-radius, radius]) {
    for (const oz of [-radius, radius]) {
      const { tx, tz } = grid.worldToTile(x + ox, z + oz)
      if (!grid.isWalkable(tx, tz)) return false
    }
  }
  return true
}

/** Applies (dx, dz) one axis at a time so the mover slides along walls. */
export function moveWithCollision(
  grid: Grid,
  pos: Vec2,
  dx: number,
  dz: number,
  radius = PLAYER_RADIUS,
): Vec2 {
  let { x, z } = pos
  if (dx !== 0 && canStand(grid, x + dx, z, radius)) x += dx
  if (dz !== 0 && canStand(grid, x, z + dz, radius)) z += dz
  return { x, z }
}

/** Samples the segment a→b; true if the mover could walk it without touching a blocked tile. */
export function hasLineOfSight(grid: Grid, a: Vec2, b: Vec2, radius = PLAYER_RADIUS): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!canStand(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false
  }
  return true
}
