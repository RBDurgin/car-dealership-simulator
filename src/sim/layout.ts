import { Grid, type Tile } from './grid'

/**
 * The dealership as data. Tile (0,0) is the north-west corner; +x is east, +z is
 * south (toward the street). The grid, floors, walls and props are all derived
 * from the tables below, so this file is the single source of truth.
 */

export const GRID_WIDTH = 40
export const GRID_HEIGHT = 30
export const SPAWN_TILE: Tile = { tx: 18, tz: 25 }
export const DEALERSHIP_NAME = 'Summit Motors'
/** Where customers appear and leave: both ends of the sidewalk, both lanes. */
export const SIDEWALK_ENDS: Tile[] = [
  { tx: 0, tz: 25 },
  { tx: 0, tz: 26 },
  { tx: GRID_WIDTH - 1, tz: 25 },
  { tx: GRID_WIDTH - 1, tz: 26 },
]
/** Just inside the driveway gate. A customer has arrived once they reach one. */
export const LOT_ENTRY_TILES: Tile[] = [
  { tx: 18, tz: 23 },
  { tx: 19, tz: 23 },
]

export interface Rect {
  tx: number
  tz: number
  w: number
  h: number
}

export type ZoneKind =
  'grass' | 'asphalt' | 'concrete' | 'sidewalk' | 'road' | 'showroom' | 'office' | 'lounge'

const INDOOR: ReadonlySet<ZoneKind> = new Set(['showroom', 'office', 'lounge'])
const BLOCKING_ZONES: ReadonlySet<ZoneKind> = new Set(['road'])

export interface Zone {
  kind: ZoneKind
  rect: Rect
}

/** Floor zones, painted in order (later entries win). Tiles default to grass. */
export const ZONES: Zone[] = [
  { kind: 'asphalt', rect: { tx: 1, tz: 1, w: 38, h: 23 } }, // lot, inside the fence
  { kind: 'asphalt', rect: { tx: 17, tz: 24, w: 4, h: 1 } }, // driveway through the fence
  { kind: 'concrete', rect: { tx: 13, tz: 1, w: 26, h: 14 } }, // apron around the building
  { kind: 'showroom', rect: { tx: 16, tz: 2, w: 21, h: 12 } },
  { kind: 'office', rect: { tx: 29, tz: 2, w: 8, h: 7 } },
  { kind: 'lounge', rect: { tx: 30, tz: 9, w: 7, h: 5 } },
  { kind: 'sidewalk', rect: { tx: 0, tz: 25, w: 40, h: 2 } },
  { kind: 'road', rect: { tx: 0, tz: 27, w: 40, h: 3 } },
]

export type WallKind = 'solid' | 'glass' | 'fence'

export interface WallRun {
  kind: WallKind
  rect: Rect
}

/** One-tile-thick wall runs, applied in order (later entries win at overlaps). */
export const WALL_RUNS: WallRun[] = [
  // Perimeter fence
  { kind: 'fence', rect: { tx: 0, tz: 0, w: 40, h: 1 } },
  { kind: 'fence', rect: { tx: 0, tz: 24, w: 40, h: 1 } },
  { kind: 'fence', rect: { tx: 0, tz: 0, w: 1, h: 25 } },
  { kind: 'fence', rect: { tx: 39, tz: 0, w: 1, h: 25 } },
  // Showroom glass (street and lot sides)
  { kind: 'glass', rect: { tx: 16, tz: 2, w: 1, h: 12 } },
  { kind: 'glass', rect: { tx: 16, tz: 13, w: 14, h: 1 } },
  // Solid building shell
  { kind: 'solid', rect: { tx: 16, tz: 2, w: 21, h: 1 } },
  { kind: 'solid', rect: { tx: 36, tz: 2, w: 1, h: 12 } },
  { kind: 'solid', rect: { tx: 30, tz: 13, w: 7, h: 1 } },
  // Office partitions
  { kind: 'solid', rect: { tx: 29, tz: 2, w: 1, h: 7 } },
  { kind: 'solid', rect: { tx: 29, tz: 8, w: 8, h: 1 } },
]

/** Gaps cut out of the wall runs: doorways and the driveway. */
export const OPENINGS: Rect[] = [
  { tx: 21, tz: 13, w: 2, h: 1 }, // showroom entrance
  { tx: 29, tz: 5, w: 1, h: 1 }, // office door
  { tx: 17, tz: 24, w: 4, h: 1 }, // driveway gate
]

/** Quarter turns about +y. 0 faces +z (south, toward the street), 1 faces +x (east). */
export type Facing = 0 | 1 | 2 | 3

export type PropModel =
  | 'sedan'
  | 'sedan-sports'
  | 'suv'
  | 'suv-luxury'
  | 'hatchback-sports'
  | 'van'
  | 'truck'
  | 'desk'
  | 'deskCorner'
  | 'chairDesk'
  | 'chairCushion'
  | 'pottedPlant'
  | 'plantSmall1'
  | 'kitchenCoffeeMachine'
  | 'kitchenCabinet'
  | 'loungeSofa'
  | 'tableCoffeeSquare'
  | 'computerScreen'
  | 'bookcaseClosedWide'
  | 'trashcan'
  | 'sign'

export type CarModel = Extract<
  PropModel,
  'sedan' | 'sedan-sports' | 'suv' | 'suv-luxury' | 'hatchback-sports' | 'van' | 'truck'
>

export interface Prop {
  id: string
  model: PropModel
  /** Footprint in world orientation (already rotated). */
  rect: Rect
  facing: Facing
  /** Whether the footprint blocks movement. Default true. */
  blocks?: boolean
  /** Height the model sits at, e.g. a coffee machine on a counter. */
  elevation?: number
  /** Draw a display platform under the footprint (showroom cars). */
  platform?: boolean
}

export interface ParkingSpace {
  rect: Rect
  /** Direction the parked car's nose points. The car fills the nose end of the space. */
  facing: Facing
}

function spaceRow(
  count: number,
  start: Tile,
  step: Tile,
  size: { w: number; h: number },
  facing: Facing,
): ParkingSpace[] {
  return Array.from({ length: count }, (_, i) => ({
    rect: { tx: start.tx + step.tx * i, tz: start.tz + step.tz * i, ...size },
    facing,
  }))
}

export const PARKING_SPACES: ParkingSpace[] = [
  // Front rows along the street fence, noses to the street
  ...spaceRow(7, { tx: 2, tz: 20 }, { tx: 2, tz: 0 }, { w: 2, h: 4 }, 0),
  ...spaceRow(7, { tx: 24, tz: 20 }, { tx: 2, tz: 0 }, { w: 2, h: 4 }, 0),
  // West row along the side fence
  ...spaceRow(7, { tx: 1, tz: 2 }, { tx: 0, tz: 2 }, { w: 4, h: 2 }, 3),
  // Middle row, noses toward the showroom
  ...spaceRow(6, { tx: 9, tz: 2 }, { tx: 0, tz: 2 }, { w: 4, h: 2 }, 1),
]

/** Opening lot stock: which spaces hold which car. Cars are inventory (`sim/inventory.ts`). */
export const LOT_CARS: { space: number; model: CarModel }[] = [
  { space: 0, model: 'sedan' },
  { space: 1, model: 'suv' },
  { space: 3, model: 'truck' },
  { space: 4, model: 'hatchback-sports' },
  { space: 6, model: 'van' },
  { space: 7, model: 'sedan-sports' },
  { space: 8, model: 'suv-luxury' },
  { space: 10, model: 'sedan' },
  { space: 13, model: 'suv' },
  { space: 14, model: 'truck' },
  { space: 15, model: 'sedan' },
  { space: 17, model: 'van' },
  { space: 21, model: 'hatchback-sports' },
  { space: 22, model: 'suv' },
  { space: 24, model: 'sedan-sports' },
  { space: 26, model: 'suv-luxury' },
]

const CAR_LENGTH_TILES = 3

/** Footprint of a car parked in a space: the nose end, leaving the tail tile free. */
export function parkedCarRect(space: ParkingSpace): Rect {
  const { rect, facing } = space
  const along = CAR_LENGTH_TILES
  switch (facing) {
    case 0:
      return { tx: rect.tx, tz: rect.tz + rect.h - along, w: rect.w, h: along }
    case 2:
      return { tx: rect.tx, tz: rect.tz, w: rect.w, h: along }
    case 1:
      return { tx: rect.tx + rect.w - along, tz: rect.tz, w: along, h: rect.h }
    case 3:
      return { tx: rect.tx, tz: rect.tz, w: along, h: rect.h }
  }
}

/** Opening showroom stock, displayed on platforms. */
export const DISPLAY_CARS: { model: CarModel; rect: Rect; facing: Facing }[] = [
  { model: 'suv-luxury', rect: { tx: 18, tz: 4, w: 3, h: 4 }, facing: 0 },
  { model: 'sedan-sports', rect: { tx: 23, tz: 4, w: 3, h: 4 }, facing: 0 },
  { model: 'hatchback-sports', rect: { tx: 24, tz: 9, w: 4, h: 3 }, facing: 3 },
]

/** Where the player sits to close a deal, and where the customer sits opposite. */
export const DESK_CHAIR_ID = 'office-chair'
export const GUEST_CHAIR_ID = 'guest-chair'
/** Where the receptionist sits, behind the reception desk facing the showroom. */
export const RECEPTION_CHAIR_ID = 'reception-chair'

// Heights (world units) that stacked props sit at.
const DESK_TOP = 0.53
const COUNTER_TOP = 0.63

const FIXED_PROPS: Prop[] = [
  { id: 'sign', model: 'sign', rect: { tx: 21, tz: 23, w: 3, h: 1 }, facing: 0 },

  { id: 'reception-desk', model: 'deskCorner', rect: { tx: 18, tz: 9, w: 2, h: 2 }, facing: 1 },
  { id: RECEPTION_CHAIR_ID, model: 'chairDesk', rect: { tx: 17, tz: 9, w: 1, h: 1 }, facing: 1 },
  { id: 'showroom-plant-1', model: 'pottedPlant', rect: { tx: 17, tz: 3, w: 1, h: 1 }, facing: 0 },
  { id: 'showroom-plant-2', model: 'pottedPlant', rect: { tx: 17, tz: 12, w: 1, h: 1 }, facing: 0 },
  { id: 'showroom-plant-3', model: 'pottedPlant', rect: { tx: 28, tz: 3, w: 1, h: 1 }, facing: 0 },

  // Office
  { id: 'office-desk', model: 'desk', rect: { tx: 32, tz: 5, w: 2, h: 1 }, facing: 2 },
  {
    id: 'office-monitor',
    model: 'computerScreen',
    rect: { tx: 33, tz: 5, w: 1, h: 1 }, // in front of the office chair
    facing: 2,
    blocks: false,
    elevation: DESK_TOP,
  },
  { id: DESK_CHAIR_ID, model: 'chairDesk', rect: { tx: 33, tz: 4, w: 1, h: 1 }, facing: 0 },
  { id: GUEST_CHAIR_ID, model: 'chairCushion', rect: { tx: 32, tz: 6, w: 1, h: 1 }, facing: 2 },
  {
    id: 'office-bookcase',
    model: 'bookcaseClosedWide',
    rect: { tx: 34, tz: 3, w: 2, h: 1 },
    facing: 0,
  },
  { id: 'office-plant-1', model: 'pottedPlant', rect: { tx: 30, tz: 3, w: 1, h: 1 }, facing: 0 },
  { id: 'office-plant-2', model: 'pottedPlant', rect: { tx: 35, tz: 7, w: 1, h: 1 }, facing: 0 },
  { id: 'office-bin', model: 'trashcan', rect: { tx: 31, tz: 3, w: 1, h: 1 }, facing: 0 },

  // Lounge / break area
  { id: 'counter-1', model: 'kitchenCabinet', rect: { tx: 33, tz: 9, w: 1, h: 1 }, facing: 0 },
  { id: 'counter-2', model: 'kitchenCabinet', rect: { tx: 34, tz: 9, w: 1, h: 1 }, facing: 0 },
  { id: 'counter-3', model: 'kitchenCabinet', rect: { tx: 35, tz: 9, w: 1, h: 1 }, facing: 0 },
  {
    id: 'coffee-machine',
    model: 'kitchenCoffeeMachine',
    rect: { tx: 34, tz: 9, w: 1, h: 1 },
    facing: 0,
    blocks: false,
    elevation: COUNTER_TOP,
  },
  { id: 'lounge-sofa', model: 'loungeSofa', rect: { tx: 32, tz: 12, w: 2, h: 1 }, facing: 2 },
  {
    id: 'lounge-table',
    model: 'tableCoffeeSquare',
    rect: { tx: 32, tz: 11, w: 2, h: 1 },
    facing: 0,
  },
  { id: 'lounge-plant', model: 'pottedPlant', rect: { tx: 35, tz: 12, w: 1, h: 1 }, facing: 0 },
]

/** Fixed furniture and fittings. Cars come from the inventory and can leave. */
export const PROPS: Prop[] = FIXED_PROPS

export interface Layout {
  width: number
  height: number
  zones: ZoneKind[]
  walls: (WallKind | null)[]
  props: Prop[]
}

function forEachTile(r: Rect, fn: (tx: number, tz: number) => void): void {
  for (let tz = r.tz; tz < r.tz + r.h; tz++) {
    for (let tx = r.tx; tx < r.tx + r.w; tx++) fn(tx, tz)
  }
}

export function buildLayout(): Layout {
  const n = GRID_WIDTH * GRID_HEIGHT
  const idx = (tx: number, tz: number) => tz * GRID_WIDTH + tx
  const zones: ZoneKind[] = new Array<ZoneKind>(n).fill('grass')
  const walls: (WallKind | null)[] = new Array<WallKind | null>(n).fill(null)
  for (const z of ZONES) forEachTile(z.rect, (tx, tz) => (zones[idx(tx, tz)] = z.kind))
  for (const w of WALL_RUNS) forEachTile(w.rect, (tx, tz) => (walls[idx(tx, tz)] = w.kind))
  for (const o of OPENINGS) forEachTile(o, (tx, tz) => (walls[idx(tx, tz)] = null))
  return { width: GRID_WIDTH, height: GRID_HEIGHT, zones, walls, props: PROPS }
}

export function zoneAt(layout: Layout, tx: number, tz: number): ZoneKind | null {
  if (tx < 0 || tz < 0 || tx >= layout.width || tz >= layout.height) return null
  return layout.zones[tz * layout.width + tx]
}

export function wallAt(layout: Layout, tx: number, tz: number): WallKind | null {
  if (tx < 0 || tz < 0 || tx >= layout.width || tz >= layout.height) return null
  return layout.walls[tz * layout.width + tx]
}

export function isIndoor(layout: Layout, tx: number, tz: number): boolean {
  const z = zoneAt(layout, tx, tz)
  return z !== null && INDOOR.has(z)
}

/**
 * Walkability grid: walls, the road and blocking prop footprints are blocked. Car
 * footprints are not included; the inventory blocks and frees them as cars come and go.
 */
export function createGrid(layout: Layout): Grid {
  const grid = new Grid(layout.width, layout.height)
  for (let tz = 0; tz < layout.height; tz++) {
    for (let tx = 0; tx < layout.width; tx++) {
      const i = tz * layout.width + tx
      if (layout.walls[i] || BLOCKING_ZONES.has(layout.zones[i])) grid.setBlocked(tx, tz)
    }
  }
  for (const p of layout.props) {
    if (p.blocks !== false) grid.blockRect(p.rect.tx, p.rect.tz, p.rect.w, p.rect.h)
  }
  return grid
}
