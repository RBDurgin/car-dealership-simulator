import { createGrid, SPAWN_TILE } from '../sim/world'

// Mutable per-frame state shared between scene components. Deliberately not in the
// zustand store: these change every frame and must never trigger React renders.
export const grid = createGrid()

const spawn = grid.tileToWorld(SPAWN_TILE.tx, SPAWN_TILE.tz)
export const playerPos = { x: spawn.x, z: spawn.z }

/** Current (eased) camera yaw in radians. 0 = camera on +z looking toward -z. */
export const cameraState = { yaw: Math.PI / 4 }
