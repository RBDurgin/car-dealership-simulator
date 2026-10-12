import type { Grid, Vec2 } from './grid'

export const PLAYER_RADIUS = 0.3
export const PLAYER_SPEED = 5 // tiles per second

/** True if a square of half-width `radius` centered at (x, z) overlaps no blocked tile. */
export function canStand(grid: Grid, x: number, z: number, radius = PLAYER_RADIUS): boolean {
  // Its four corners' tiles, as `grid.worldToTile` finds them, without allocating:
  // this runs several times per walker per frame.
  const hw = grid.width / 2
  const hh = grid.height / 2
  const x0 = Math.floor(x - radius + hw)
  const x1 = Math.floor(x + radius + hw)
  const z0 = Math.floor(z - radius + hh)
  const z1 = Math.floor(z + radius + hh)
  return (
    grid.isWalkable(x0, z0) &&
    grid.isWalkable(x0, z1) &&
    grid.isWalkable(x1, z0) &&
    grid.isWalkable(x1, z1)
  )
}

/** Applies (dx, dz) one axis at a time so the mover slides along walls. Writes into `out` (which may be `pos`). */
export function moveWithCollision(
  grid: Grid,
  pos: Vec2,
  dx: number,
  dz: number,
  radius = PLAYER_RADIUS,
  out: Vec2 = { x: 0, z: 0 },
): Vec2 {
  let { x, z } = pos
  if (dx !== 0 && canStand(grid, x + dx, z, radius)) x += dx
  if (dz !== 0 && canStand(grid, x, z + dz, radius)) z += dz
  out.x = x
  out.z = z
  return out
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

/**
 * The centre of the nearest tile a mover can stand on, e.g. to step someone
 * out of a car parked on top of them. Returns `pos` itself if they already can.
 */
export function nearestStandable(grid: Grid, pos: Vec2, radius = PLAYER_RADIUS): Vec2 {
  if (canStand(grid, pos.x, pos.z, radius)) return pos
  const start = grid.worldToTile(pos.x, pos.z)
  let best: Vec2 | null = null
  let bestDist = Infinity
  // Rings of growing size; stop after the first ring that has somewhere to stand.
  for (let r = 1; r < Math.max(grid.width, grid.height) && !best; r++) {
    for (let tx = start.tx - r; tx <= start.tx + r; tx++) {
      for (let tz = start.tz - r; tz <= start.tz + r; tz++) {
        if (Math.max(Math.abs(tx - start.tx), Math.abs(tz - start.tz)) !== r) continue
        if (!grid.inBounds(tx, tz)) continue
        const p = grid.tileToWorld(tx, tz)
        const d = Math.hypot(p.x - pos.x, p.z - pos.z)
        if (d < bestDist && canStand(grid, p.x, p.z, radius)) {
          best = p
          bestDist = d
        }
      }
    }
  }
  return best ?? pos
}
