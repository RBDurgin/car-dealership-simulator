import type { Grid, Tile, Vec2 } from './grid'
import { CALL_MINUTES } from './calls'
import { DEFAULT_DAY_MS, CLOSE_MINUTE, OPEN_MINUTE } from './clock'
import {
  DESK_CHAIR_ID,
  DESK_PHONE_ID,
  MANAGER_DESK,
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
  | 'checkIn'
  | 'recommend'
  | 'pitch'
  | 'closeDeal'
  | 'handOff'
  | 'office'
  | 'call'
  | 'recondition'
  | 'fixDing'
  | 'confront'
  | 'testDrive'
  | 'ride'

/** Real seconds the player spends looking a seller's car over. */
export const APPRAISE_SECONDS = 4
/** Real seconds the player spends checking a service client in. */
export const CHECK_IN_SECONDS = 2
/** Real seconds the player spends telling a service client about extra work. */
export const RECOMMEND_SECONDS = 2
/** Real seconds the player takes getting into a test drive car, giving the shopper time to catch up. */
export const RIDE_SECONDS = 1.2
/** Real seconds the player spends pitching a trade-up to a service client. */
export const PITCH_SECONDS = 3
/** Real ms a call takes the player: `CALL_MINUTES` of game time at normal speed. */
export const CALL_MS = Math.round((CALL_MINUTES * DEFAULT_DAY_MS) / (CLOSE_MINUTE - OPEN_MINUTE))

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
  // A service client at the counter: hear what they need and quote the job.
  checkIn: {
    id: 'checkIn',
    label: 'Check in',
    verb: 'Checking them in',
    mode: 'timed',
    durationMs: CHECK_IN_SECONDS * 1000,
  },
  // A service client waiting on their car: offer the extra work the mechanic found.
  recommend: {
    id: 'recommend',
    label: 'Recommend work',
    verb: 'Explaining the work',
    mode: 'timed',
    durationMs: RECOMMEND_SECONDS * 1000,
  },
  // A client from the book waiting on their car, due to trade up soon: book them to come back for it.
  pitch: {
    id: 'pitch',
    label: 'Pitch a trade-up',
    verb: 'Talking trade-ups',
    mode: 'timed',
    durationMs: PITCH_SECONDS * 1000,
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
  // At the office computer: opens its panel on the tab it was last on, like the top bar's Office button.
  office: { id: 'office', label: 'Office', verb: 'At the computer', mode: 'instant' },
  // At the desk phone: a follow-up call to someone in the client book (see `sim/calls.ts`).
  call: {
    id: 'call',
    label: 'Call a client',
    verb: 'On the phone',
    mode: 'timed',
    durationMs: CALL_MS,
  },
  // A used car in stock: off to the service garage to be reconditioned.
  recondition: {
    id: 'recondition',
    label: 'Recondition',
    verb: 'Sending it to the shop',
    mode: 'instant',
  },
  // A car with a dent from a test drive: off to the service garage to have it fixed.
  fixDing: {
    id: 'fixDing',
    label: 'Fix dent',
    verb: 'Sending it to the shop',
    mode: 'instant',
  },
  // A shopper the player is talking to: off to the car for a test drive (see `sim/testDrive.ts`).
  testDrive: {
    id: 'testDrive',
    label: 'Test drive',
    verb: 'Off for a test drive',
    mode: 'instant',
  },
  // At the test drive car with the shopper: get in, and off they go.
  ride: {
    id: 'ride',
    label: 'Get in',
    verb: 'Getting in',
    mode: 'timed',
    durationMs: RIDE_SECONDS * 1000,
  },
  // Reaching Nazma runs him off the lot (see scene/Player, which chases him as he moves).
  confront: { id: 'confront', label: 'Confront', verb: 'Confronting', mode: 'instant' },
}

export type InteractableKind =
  'car' | 'chair' | 'coffee' | 'computer' | 'phone' | 'customer' | 'employee' | 'nazma'

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

/**
 * Where to stand to use something at the end of a desk: beside it, across
 * the way it faces, so the desk's chair stays free. Any side if neither is open.
 */
export function sideApproachTiles(grid: Grid, r: Rect, facing: Facing): Tile[] {
  const f = FORWARD[facing]
  const sides = [
    { tx: r.tx + f.z, tz: r.tz + f.x },
    { tx: r.tx - f.z, tz: r.tz - f.x },
  ].filter((t) => grid.isWalkable(t.tx, t.tz))
  return sides.length > 0 ? sides : approachTilesFor(grid, r)
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
    } else if (p.id === MANAGER_DESK.chairId) {
      out.set(p.id, { ...base, kind: 'chair', name: 'Your desk', actions: ['sit', 'closeDeal'] })
    } else if (p.id === OFFICE_COMPUTER_ID) {
      out.set(p.id, {
        ...base,
        kind: 'computer',
        name: 'Office computer',
        approachTiles: screenApproachTiles(grid, p.rect, p.facing),
        actions: ['office'],
      })
    } else if (p.id === DESK_PHONE_ID) {
      out.set(p.id, {
        ...base,
        kind: 'phone',
        name: 'Desk phone',
        approachTiles: sideApproachTiles(grid, p.rect, p.facing),
        actions: ['call'],
      })
    } else if (p.model === 'kitchenCoffeeMachine') {
      out.set(p.id, { ...base, kind: 'coffee', name: 'Coffee machine', actions: ['getCoffee'] })
    }
  }
  return out
}
