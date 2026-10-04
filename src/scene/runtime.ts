import { buildInteractables } from '../sim/interactables'
import { buildLayout, createGrid, SPAWN_TILE, type Rect } from '../sim/layout'
import { useGame } from '../state/store'

export const layout = buildLayout()

// Mutable per-frame state shared between scene components. Deliberately not in the
// zustand store: these change every frame and must never trigger React renders.
export const grid = createGrid(layout)

export const interactables = buildInteractables(grid, layout.props)

const spawn = grid.tileToWorld(SPAWN_TILE.tx, SPAWN_TILE.tz)
export const playerPos = { x: spawn.x, z: spawn.z }

/** Current (eased) camera yaw in radians. 0 = camera on +z looking toward -z. */
export const cameraState = { yaw: useGame.getState().viewYaw }

/** World-space center and size of a tile rect. */
export function rectBounds(r: Rect) {
  const a = grid.tileToWorld(r.tx, r.tz)
  return { x: a.x + (r.w - 1) / 2, z: a.z + (r.h - 1) / 2, w: r.w, h: r.h }
}
