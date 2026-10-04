import type { Grid, Tile, Vec2 } from './grid'
import type { CarModel, Facing, Prop, Rect } from './layout'
import { findPathToAny } from './pathfinding'

export type ActionId = 'inspect' | 'sit' | 'getCoffee'

/**
 * How an action plays out once the player reaches the object:
 * - instant: runs and finishes on arrival
 * - timed: runs for `durationMs`, then finishes
 * - hold: lasts until cancelled (Esc or any move order)
 */
export type ActionMode = 'instant' | 'timed' | 'hold'

export interface ActionDef {
  id: ActionId
  label: string
  /** Shown in the HUD while the action runs. */
  verb: string
  mode: ActionMode
  durationMs?: number
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  inspect: { id: 'inspect', label: 'Inspect', verb: 'Inspecting', mode: 'instant' },
  sit: { id: 'sit', label: 'Sit', verb: 'Sitting', mode: 'hold' },
  getCoffee: {
    id: 'getCoffee',
    label: 'Get coffee',
    verb: 'Getting coffee',
    mode: 'timed',
    durationMs: 2500,
  },
}

export type InteractableKind = 'car' | 'chair' | 'coffee'

export interface CarInfo {
  name: string
  color: string
  /** Swatch for the info panel. */
  colorHex: string
  location: string
}

export interface Interactable {
  id: string
  kind: InteractableKind
  /** Display name, used in the action menu header. */
  name: string
  rect: Rect
  facing: Facing
  /** Walkable tiles the player can stand on to use it. */
  approachTiles: Tile[]
  actions: ActionId[]
  car?: CarInfo
}

// Each Kenney car model has a single baked-in color, so the color follows the model.
const CARS: Record<CarModel, { name: string; color: string; hex: string }> = {
  sedan: { name: 'Summit Cruiser', color: 'Sunset Red', hex: '#e0563a' },
  'sedan-sports': { name: 'Summit Vela GT', color: 'Sunset Red', hex: '#e0563a' },
  suv: { name: 'Summit Ridge', color: 'Forest Green', hex: '#2f9a63' },
  'suv-luxury': { name: 'Summit Ridge Platinum', color: 'Desert Gold', hex: '#d9b452' },
  'hatchback-sports': { name: 'Summit Zip R', color: 'Forest Green', hex: '#2f9a63' },
  van: { name: 'Summit Hauler', color: 'Harbor Blue', hex: '#4062c4' },
  truck: { name: 'Summit Trailhead', color: 'Forest Green', hex: '#2f9a63' },
}
const CAR_MODELS = new Set(Object.keys(CARS))

export function isCarModel(model: string): model is CarModel {
  return CAR_MODELS.has(model)
}

/** Walkable tiles orthogonally adjacent to a rect (corners excluded). */
export function approachTilesFor(grid: Grid, r: Rect): Tile[] {
  const out: Tile[] = []
  const push = (tx: number, tz: number) => {
    if (grid.isWalkable(tx, tz)) out.push({ tx, tz })
  }
  for (let tx = r.tx; tx < r.tx + r.w; tx++) {
    push(tx, r.tz - 1)
    push(tx, r.tz + r.h)
  }
  for (let tz = r.tz; tz < r.tz + r.h; tz++) {
    push(r.tx - 1, tz)
    push(r.tx + r.w, tz)
  }
  return out
}

/** Path to the cheapest-to-reach approach tile, or null if none is reachable. */
export function pathToInteractable(grid: Grid, start: Tile, it: Interactable): Tile[] | null {
  return findPathToAny(grid, start, it.approachTiles)
}

/** World-space center of the interactable's footprint, for facing it. */
export function interactableCenter(grid: Grid, it: Interactable): Vec2 {
  const a = grid.tileToWorld(it.rect.tx, it.rect.tz)
  return { x: a.x + (it.rect.w - 1) / 2, z: a.z + (it.rect.h - 1) / 2 }
}

export function buildInteractables(grid: Grid, props: Prop[]): Map<string, Interactable> {
  const out = new Map<string, Interactable>()
  for (const p of props) {
    const base = {
      id: p.id,
      rect: p.rect,
      facing: p.facing,
      approachTiles: approachTilesFor(grid, p.rect),
    }
    if (isCarModel(p.model)) {
      const { name, color, hex } = CARS[p.model]
      const car: CarInfo = {
        name,
        color,
        colorHex: hex,
        location: p.platform ? 'Showroom display' : 'Lot',
      }
      out.set(p.id, { ...base, kind: 'car', name, actions: ['inspect'], car })
    } else if (p.id === 'office-chair') {
      out.set(p.id, { ...base, kind: 'chair', name: 'Desk chair', actions: ['sit'] })
    } else if (p.model === 'kitchenCoffeeMachine') {
      out.set(p.id, { ...base, kind: 'coffee', name: 'Coffee machine', actions: ['getCoffee'] })
    }
  }
  return out
}
