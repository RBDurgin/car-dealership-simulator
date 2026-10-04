import { isIndoor, wallAt, type Layout, type WallKind } from './layout'

export type WallMode = 'up' | 'cutaway' | 'down'
export const WALL_MODES: readonly WallMode[] = ['up', 'cutaway', 'down']

export type ArmDir = 'n' | 'e' | 's' | 'w'

const DIR_STEP: Record<ArmDir, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
}

/**
 * A renderable wall fragment. Each wall tile draws a half-length "arm" toward
 * every connected neighbour, so corners and T-junctions join cleanly. A tile
 * with no connected neighbours draws a single post (`dir: null`).
 */
export interface WallPiece {
  tx: number
  tz: number
  dir: ArmDir | null
  kind: WallKind
}

/** Fences only join fences, and building walls (solid or glass) only join each other. */
function connects(a: WallKind, b: WallKind | null): boolean {
  if (b === null) return false
  return (a === 'fence') === (b === 'fence')
}

export function wallPieces(layout: Layout): WallPiece[] {
  const pieces: WallPiece[] = []
  for (let tz = 0; tz < layout.height; tz++) {
    for (let tx = 0; tx < layout.width; tx++) {
      const kind = wallAt(layout, tx, tz)
      if (!kind) continue
      let arms = 0
      for (const dir of Object.keys(DIR_STEP) as ArmDir[]) {
        const [dx, dz] = DIR_STEP[dir]
        if (connects(kind, wallAt(layout, tx + dx, tz + dz))) {
          pieces.push({ tx, tz, dir, kind })
          arms++
        }
      }
      if (arms === 0) pieces.push({ tx, tz, dir: null, kind })
    }
  }
  return pieces
}

/** Snaps a camera yaw to the sign of its horizontal offset from the focus point. */
export function cameraSide(yaw: number): { sx: number; sz: number } {
  return {
    sx: Math.sign(Math.round(Math.sin(yaw) * 1e6)),
    sz: Math.sign(Math.round(Math.cos(yaw) * 1e6)),
  }
}

/**
 * Cutaway rule: a wall drops when the tile directly behind it (on the side
 * away from the camera) is indoors, i.e. it would hide a room's interior.
 * Fences never drop. Posts drop only if they would hide an interior on
 * either axis.
 */
export function isCutaway(layout: Layout, piece: WallPiece, yaw: number): boolean {
  if (piece.kind === 'fence') return false
  const { sx, sz } = cameraSide(yaw)
  const { tx, tz, dir } = piece
  const behindX = () => isIndoor(layout, tx - sx, tz)
  const behindZ = () => isIndoor(layout, tx, tz - sz)
  if (dir === 'e' || dir === 'w') return behindZ()
  if (dir === 'n' || dir === 's') return behindX()
  return behindX() || behindZ()
}
