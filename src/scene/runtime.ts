import { buildInteractables, type Interactable } from '../sim/interactables'
import { applyToGrid, availableCars, carProp, type InventoryCar } from '../sim/inventory'
import { buildLayout, createGrid, SPAWN_TILE, type Rect } from '../sim/layout'
import { useGame } from '../state/store'

export const layout = buildLayout()

// Mutable per-frame state shared between scene components. Deliberately not in the
// zustand store: these change every frame and must never trigger React renders.
export const grid = createGrid(layout)

export const interactables = new Map<string, Interactable>()

/** Blocks/frees car footprints and rebuilds the interactables to match the inventory. */
function syncInventory(inventory: readonly InventoryCar[]): void {
  applyToGrid(grid, inventory)
  // Rebuild everything, not just the cars: a freed footprint can open up new
  // approach tiles for its neighbours.
  interactables.clear()
  const props = [...layout.props, ...availableCars(inventory).map(carProp)]
  for (const [id, it] of buildInteractables(grid, props)) interactables.set(id, it)
}

syncInventory(useGame.getState().inventory)
// Runs synchronously inside the store update, before React re-renders anything.
useGame.subscribe((s, prev) => {
  if (s.inventory !== prev.inventory) syncInventory(s.inventory)
})

const spawn = grid.tileToWorld(SPAWN_TILE.tx, SPAWN_TILE.tz)
export const playerPos = { x: spawn.x, z: spawn.z }

/** Current (eased) camera yaw in radians. 0 = camera on +z looking toward -z. */
export const cameraState = { yaw: useGame.getState().viewYaw }

/** Precise running game time. The store only sees it in 10-minute steps. */
export const gameTime = { ...useGame.getState().clock }

/** World-space center and size of a tile rect. */
export function rectBounds(r: Rect) {
  const a = grid.tileToWorld(r.tx, r.tz)
  return { x: a.x + (r.w - 1) / 2, z: a.z + (r.h - 1) / 2, w: r.w, h: r.h }
}
