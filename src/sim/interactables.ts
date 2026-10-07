import type { Grid, Tile, Vec2 } from './grid'
import {
  DESK_CHAIR_ID,
  OFFICE_COMPUTER_ID,
  type CarModel,
  type Facing,
  type Prop,
  type Rect,
} from './layout'
import { findPathToAny } from './pathfinding'

export type ActionId =
  | 'inspect'
  | 'wash'
  | 'sit'
  | 'getCoffee'
  | 'greet'
  | 'makeOffer'
  | 'offer'
  | 'appraise'
  | 'closeDeal'
  | 'handOff'
  | 'orderStock'
  | 'advertise'
  | 'improve'
  | 'calendar'
  | 'confront'

/** Real seconds the player spends looking a seller's car over. */
export const APPRAISE_SECONDS = 4

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
  wash: { id: 'wash', label: 'Wash car', verb: 'Washing the car', mode: 'timed', durationMs: 5000 },
  sit: { id: 'sit', label: 'Sit', verb: 'Sitting', mode: 'hold' },
  getCoffee: {
    id: 'getCoffee',
    label: 'Get coffee',
    verb: 'Getting coffee',
    mode: 'timed',
    durationMs: 2500,
  },
  greet: { id: 'greet', label: 'Greet', verb: 'Greeting', mode: 'timed', durationMs: 1500 },
  offer: { id: 'offer', label: 'Make an offer', verb: 'Making an offer', mode: 'instant' },
  // A seller's: go over and start talking about their car.
  makeOffer: {
    id: 'makeOffer',
    label: 'Make offer',
    verb: 'Greeting',
    mode: 'timed',
    durationMs: 1500,
  },
  // A seller's parked car: look it over for a closer idea of its value.
  appraise: {
    id: 'appraise',
    label: 'Appraise',
    verb: 'Appraising the car',
    mode: 'timed',
    durationMs: APPRAISE_SECONDS * 1000,
  },
  // Starts performing only once the customer is seated (see scene/Player).
  closeDeal: {
    id: 'closeDeal',
    label: 'Close deal',
    verb: 'Signing paperwork',
    mode: 'timed',
    durationMs: 4000,
  },
  // At the desk with a buyer in tow: the finance manager takes them from there.
  handOff: { id: 'handOff', label: 'Hand off to finance', verb: 'Handing off', mode: 'instant' },
  // At the office computer: opens the stock panel, on its stock, marketing, upgrades or calendar tab.
  orderStock: { id: 'orderStock', label: 'Order stock', verb: 'Ordering stock', mode: 'instant' },
  advertise: { id: 'advertise', label: 'Marketing', verb: 'Planning ads', mode: 'instant' },
  improve: { id: 'improve', label: 'Upgrades', verb: 'Planning upgrades', mode: 'instant' },
  calendar: { id: 'calendar', label: 'Calendar', verb: 'Checking the calendar', mode: 'instant' },
  // Reaching Nazma runs him off the lot (see scene/Player, which chases him as he moves).
  confront: { id: 'confront', label: 'Confront', verb: 'Confronting', mode: 'instant' },
}

export type InteractableKind =
  'car' | 'chair' | 'coffee' | 'computer' | 'customer' | 'employee' | 'nazma'

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

/** Display name of a car model, e.g. "Summit Ridge". */
export function carName(model: CarModel): string {
  return CARS[model].name
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

// The tile one step from a footprint in the direction it faces (see `Facing`).
const FORWARD: Record<Facing, Vec2> = {
  0: { x: 0, z: 1 },
  1: { x: 1, z: 0 },
  2: { x: 0, z: -1 },
  3: { x: -1, z: 0 },
}

/**
 * Where to stand to use a screen sitting on a desk: around the seat in front of
 * it (the tile it faces), not on the far side of the desk.
 */
export function screenApproachTiles(grid: Grid, r: Rect, facing: Facing): Tile[] {
  const f = FORWARD[facing]
  const seat = { tx: r.tx + f.x, tz: r.tz + f.z }
  const ring = approachTilesFor(grid, { ...seat, w: 1, h: 1 })
  return grid.isWalkable(seat.tx, seat.tz) ? [seat, ...ring] : ring
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
      out.set(p.id, { ...base, kind: 'car', name, actions: ['inspect', 'wash'], car })
    } else if (p.id === DESK_CHAIR_ID) {
      out.set(p.id, { ...base, kind: 'chair', name: 'Desk chair', actions: ['sit', 'closeDeal'] })
    } else if (p.id === OFFICE_COMPUTER_ID) {
      out.set(p.id, {
        ...base,
        kind: 'computer',
        name: 'Office computer',
        approachTiles: screenApproachTiles(grid, p.rect, p.facing),
        actions: ['orderStock', 'advertise', 'improve', 'calendar'],
      })
    } else if (p.model === 'kitchenCoffeeMachine') {
      out.set(p.id, { ...base, kind: 'coffee', name: 'Coffee machine', actions: ['getCoffee'] })
    }
  }
  return out
}
