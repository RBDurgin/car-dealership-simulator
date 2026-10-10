import { Grid, type Tile } from './grid'

/**
 * The dealership as data. Tile (0,0) is the north-west corner; +x is east, +z is
 * south (toward the street). The grid, floors, walls and props are all derived
 * from the tables below, so this file is the single source of truth.
 */

/**
 * The old lot is tx 0–39. The parcel east of it (`PARCEL`) is for sale until
 * the lot expansion is bought, and leaves room for the showroom wing on its
 * north side and the service garage (`GARAGE`) in its north-east corner.
 */
export const GRID_WIDTH = 60
export const GRID_HEIGHT = 30
export const SPAWN_TILE: Tile = { tx: 18, tz: 25 }
export const DEALERSHIP_NAME = "Charles' Discount Automotive"
/** Where customers appear and leave: both ends of the sidewalk, both lanes. */
export const SIDEWALK_ENDS: Tile[] = [
  { tx: 0, tz: 25 },
  { tx: 0, tz: 26 },
  { tx: GRID_WIDTH - 1, tz: 25 },
  { tx: GRID_WIDTH - 1, tz: 26 },
]
/**
 * Once his rival lot is open, Nazma comes and goes across the road: between
 * this sidewalk tile and `RIVAL_GATE`, inside his own gate, off the grid (in
 * tile coordinates, for `grid.tileToWorld`).
 */
export const RIVAL_CROSSING: Tile = { tx: 18, tz: 26 }
export const RIVAL_GATE: Tile = { tx: 18, tz: GRID_HEIGHT + 3 }
/** Just inside the driveway gate. A customer has arrived once they reach one. */
export const LOT_ENTRY_TILES: Tile[] = [
  { tx: 18, tz: 23 },
  { tx: 19, tz: 23 },
]
/** Where the lot porter waits between washes: out on the lot, clear of the walkway. */
export const PORTER_STANDBY_TILES: Tile[] = [
  { tx: 33, tz: 16 },
  { tx: 34, tz: 16 },
  { tx: 33, tz: 17 },
  { tx: 34, tz: 17 },
]

/**
 * The security guard's patrol, walked in order and round again: the west lot,
 * by the driveway, outside the showroom door and the east lot. Each stop is
 * clear of the parking spaces and of the walk from the gate to the door.
 */
export const GUARD_PATROL_TILES: Tile[] = [
  { tx: 6, tz: 17 },
  { tx: 15, tz: 18 },
  { tx: 25, tz: 15 },
  { tx: 32, tz: 18 },
]

/** The extra patrol stop once the east lot is up: its aisle, between the two rows. */
const EAST_LOT_PATROL: Tile = { tx: 47, tz: 18 }

/** The guard's patrol with the `expansions` that are up. */
export function patrolTiles(expansions: readonly ExpansionId[]): Tile[] {
  return expansions.includes('east-lot')
    ? [...GUARD_PATROL_TILES, EAST_LOT_PATROL]
    : GUARD_PATROL_TILES
}

/** Where the owner stands on a visit: in the office, by the desk, clear of both chairs. */
export const OWNER_OFFICE_TILES: Tile[] = [
  { tx: 34, tz: 6 },
  { tx: 35, tz: 6 },
  { tx: 34, tz: 7 },
]

export interface Rect {
  tx: number
  tz: number
  w: number
  h: number
}

export type ZoneKind =
  | 'grass'
  | 'asphalt'
  | 'concrete'
  | 'sidewalk'
  | 'road'
  | 'showroom'
  | 'office'
  | 'lounge'
  | 'parcel'
  | 'garage'

const INDOOR: ReadonlySet<ZoneKind> = new Set(['showroom', 'office', 'lounge', 'garage'])
const BLOCKING_ZONES: ReadonlySet<ZoneKind> = new Set(['road', 'parcel'])

export interface Zone {
  kind: ZoneKind
  rect: Rect
}

/** The empty ground east of the lot, inside its own fence: rough grass, closed until it's bought. */
export const PARCEL: Rect = { tx: 40, tz: 1, w: GRID_WIDTH - 41, h: 23 }

/** Floor zones, painted in order (later entries win). Tiles default to grass. */
export const ZONES: Zone[] = [
  { kind: 'asphalt', rect: { tx: 1, tz: 1, w: 38, h: 23 } }, // lot, inside the fence
  { kind: 'asphalt', rect: { tx: 17, tz: 24, w: 4, h: 1 } }, // driveway through the fence
  { kind: 'concrete', rect: { tx: 13, tz: 1, w: 26, h: 14 } }, // apron around the building
  { kind: 'showroom', rect: { tx: 16, tz: 2, w: 21, h: 12 } },
  { kind: 'office', rect: { tx: 29, tz: 2, w: 8, h: 7 } },
  { kind: 'lounge', rect: { tx: 30, tz: 9, w: 7, h: 5 } },
  { kind: 'parcel', rect: PARCEL },
  { kind: 'sidewalk', rect: { tx: 0, tz: 25, w: GRID_WIDTH, h: 2 } },
  { kind: 'road', rect: { tx: 0, tz: 27, w: GRID_WIDTH, h: 3 } },
]

export type WallKind = 'solid' | 'glass' | 'fence'

export interface WallRun {
  kind: WallKind
  rect: Rect
}

/** One-tile-thick wall runs, applied in order (later entries win at overlaps). */
export const WALL_RUNS: WallRun[] = [
  // Perimeter fence, round the lot and the parcel
  { kind: 'fence', rect: { tx: 0, tz: 0, w: GRID_WIDTH, h: 1 } },
  { kind: 'fence', rect: { tx: 0, tz: 24, w: GRID_WIDTH, h: 1 } },
  { kind: 'fence', rect: { tx: 0, tz: 0, w: 1, h: 25 } },
  { kind: 'fence', rect: { tx: GRID_WIDTH - 1, tz: 0, w: 1, h: 25 } },
  // Between the lot and the parcel
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
  | 'loungeDesignSofa'
  | 'cabinetTelevision'
  | 'televisionModern'
  | 'kitchenBar'
  | 'stoolBar'
  | 'tableCoffeeSquare'
  | 'computerScreen'
  | 'bookcaseClosedWide'
  | 'trashcan'
  | 'sign'
  | 'forSaleSign'

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
  /** The expansion that has to be up before the space can be used (none: always open). */
  requires?: ExpansionId
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
  // The east lot, on the parcel once it's bought: a front row along the street
  // fence and a row facing it across the aisle, both in from the gate. The
  // parcel's north side is left for the showroom wing, and its east end for a
  // service lane.
  ...[
    ...spaceRow(6, { tx: 41, tz: 20 }, { tx: 2, tz: 0 }, { w: 2, h: 4 }, 0),
    ...spaceRow(6, { tx: 41, tz: 14 }, { tx: 2, tz: 0 }, { w: 2, h: 4 }, 2),
  ].map((space): ParkingSpace => ({ ...space, requires: 'east-lot' })),
]

/** Whether lot space `index` can be used with the `expansions` that are up. */
export function spaceOpen(index: number, expansions: readonly ExpansionId[]): boolean {
  const { requires } = PARKING_SPACES[index]
  return !requires || expansions.includes(requires)
}

/**
 * Where visitors who drive in park: three spaces in the open asphalt between
 * the showroom and the east front row, noses to the building. Never stock
 * slots. Cars drive in along the aisle south of them (`sim/driving.ts`).
 */
export const CUSTOMER_PARKING: ParkingSpace[] = spaceRow(
  3,
  { tx: 26, tz: 15 },
  { tx: 2, tz: 0 },
  { w: 2, h: 4 },
  2,
)

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

/** A display platform: where a showroom car stands and which way it faces. */
export interface Platform {
  rect: Rect
  facing: Facing
  /** The expansion that has to be up before the platform can be used (none: always open). */
  requires?: ExpansionId
}

/** The showroom's display platforms, then the wing's two along its north wall. */
export const PLATFORMS: Platform[] = [
  { rect: { tx: 18, tz: 4, w: 3, h: 4 }, facing: 0 },
  { rect: { tx: 23, tz: 4, w: 3, h: 4 }, facing: 0 },
  { rect: { tx: 24, tz: 9, w: 4, h: 3 }, facing: 3 },
  { rect: { tx: 40, tz: 4, w: 3, h: 4 }, facing: 0, requires: 'showroom-wing' },
  { rect: { tx: 44, tz: 4, w: 3, h: 4 }, facing: 0, requires: 'showroom-wing' },
]

/** Whether display platform `index` can be used with the `expansions` that are up. */
export function platformOpen(index: number, expansions: readonly ExpansionId[]): boolean {
  const { requires } = PLATFORMS[index]
  return !requires || expansions.includes(requires)
}

/** Opening showroom stock: which platform holds which car. */
export const DISPLAY_CARS: { platform: number; model: CarModel }[] = [
  { platform: 0, model: 'suv-luxury' },
  { platform: 1, model: 'sedan-sports' },
  { platform: 2, model: 'hatchback-sports' },
]

/** Where the player sits to close a deal, and where the customer sits opposite. */
export const DESK_CHAIR_ID = 'office-chair'
/** The office computer, where stock is ordered from the manufacturer. */
export const OFFICE_COMPUTER_ID = 'office-monitor'
export const GUEST_CHAIR_ID = 'guest-chair'
/** Where the receptionist sits, behind the reception desk facing the showroom. */
export const RECEPTION_CHAIR_ID = 'reception-chair'

/** A salesperson's desk on the showroom floor: their chair, and the buyer's opposite. */
export interface SalesDesk {
  chairId: string
  guestChairId: string
  /** The expansion the desk stands in (none: the showroom's own). */
  requires?: ExpansionId
}

/**
 * One desk per salesperson the roster allows, in the order they're handed
 * out: two in the showroom, then two in the wing.
 */
export const SALES_DESKS: SalesDesk[] = [1, 2, 3, 4].map((n) => ({
  chairId: `sales-chair-${n}`,
  guestChairId: `sales-guest-${n}`,
  ...(n > 2 && { requires: 'showroom-wing' as const }),
}))

/** The sales desks standing with the `expansions` that are up. */
export function salesDesks(expansions: readonly ExpansionId[]): SalesDesk[] {
  return SALES_DESKS.filter((d) => !d.requires || expansions.includes(d.requires))
}

/** The sofas buyers wait on for finance, the lounge's first. */
export const SOFA_IDS = ['lounge-sofa', 'wing-sofa']

/** How much the furniture models are scaled up, to sit in proportion with the people. */
export const FURNITURE_SCALE = 2.3

// Heights (world units) that stacked props sit at: the model's height times its scale.
const DESK_TOP = 0.38 * FURNITURE_SCALE
const COUNTER_TOP = 0.45 * FURNITURE_SCALE

/** Seat height of the chairs and the sofa (their models' seats are all ~0.235 tall). */
export const SEAT_HEIGHT = 0.235 * FURNITURE_SCALE

/**
 * Sales desk `n` with its two-tile desk at `at`, set out like the office desk:
 * the salesperson's chair behind its east half, the buyer's in front of its west half.
 */
function salesDesk(n: number, at: Tile): Prop[] {
  const { chairId, guestChairId } = SALES_DESKS[n - 1]
  return [
    { id: `sales-desk-${n}`, model: 'desk', rect: { ...at, w: 2, h: 1 }, facing: 2 },
    {
      id: `sales-monitor-${n}`,
      model: 'computerScreen',
      rect: { tx: at.tx + 1, tz: at.tz, w: 1, h: 1 },
      facing: 2,
      blocks: false,
      elevation: DESK_TOP,
    },
    {
      id: chairId,
      model: 'chairDesk',
      rect: { tx: at.tx + 1, tz: at.tz - 1, w: 1, h: 1 },
      facing: 0,
    },
    {
      id: guestChairId,
      model: 'chairCushion',
      rect: { tx: at.tx, tz: at.tz + 1, w: 1, h: 1 },
      facing: 2,
    },
  ]
}

const FIXED_PROPS: Prop[] = [
  { id: 'sign', model: 'sign', rect: { tx: 21, tz: 23, w: 3, h: 1 }, facing: 0 },

  { id: 'reception-desk', model: 'deskCorner', rect: { tx: 18, tz: 9, w: 2, h: 2 }, facing: 1 },
  { id: RECEPTION_CHAIR_ID, model: 'chairDesk', rect: { tx: 17, tz: 9, w: 1, h: 1 }, facing: 1 },
  { id: 'showroom-plant-1', model: 'pottedPlant', rect: { tx: 17, tz: 3, w: 1, h: 1 }, facing: 0 },
  { id: 'showroom-plant-2', model: 'pottedPlant', rect: { tx: 17, tz: 12, w: 1, h: 1 }, facing: 0 },
  { id: 'showroom-plant-3', model: 'pottedPlant', rect: { tx: 28, tz: 3, w: 1, h: 1 }, facing: 0 },

  // Sales desks: one by the entrance, one in the corner by the office door.
  ...salesDesk(1, { tx: 21, tz: 10 }),
  ...salesDesk(2, { tx: 26, tz: 4 }),

  // Office
  { id: 'office-desk', model: 'desk', rect: { tx: 32, tz: 5, w: 2, h: 1 }, facing: 2 },
  {
    id: OFFICE_COMPUTER_ID,
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

/** Ground bought as the dealership grows (see `sim/expansions.ts`). */
export type ExpansionId = 'east-lot' | 'showroom-wing' | 'service-bay'

/**
 * The showroom wing, walls included: on the parcel's north side, against the
 * building's east wall, its glass front in line with the building's. It's
 * joined to the lounge by a door in the lounge's corner and opens onto the
 * lot by the gate through a door in its front.
 */
export const WING: Rect = { tx: 37, tz: 2, w: 12, h: 12 }

const WING_WALLS: WallRun[] = [
  { kind: 'solid', rect: { tx: WING.tx, tz: WING.tz, w: WING.w, h: 1 } },
  { kind: 'solid', rect: { tx: WING.tx + WING.w - 1, tz: WING.tz, w: 1, h: WING.h } },
  { kind: 'glass', rect: { tx: WING.tx, tz: WING.tz + WING.h - 1, w: WING.w - 1, h: 1 } },
]

const WING_OPENINGS: Rect[] = [
  // Inside, where the fence between the lots used to run
  { tx: WING.tx, tz: WING.tz + 1, w: WING.w - 1, h: WING.h - 2 },
  { tx: 36, tz: 12, w: 1, h: 1 }, // the door from the lounge's corner
  { tx: 37, tz: 13, w: 2, h: 1 }, // the front door, onto the lot by the gate
]

/** The lounge plant stands in the corner the wing's door opens from, so it moves over. */
const LOUNGE_PLANT_ID = 'lounge-plant'
const LOUNGE_PLANT_MOVED: Rect = { tx: 30, tz: 9, w: 1, h: 1 }

/**
 * The wing's fittings: a second sofa in the corner, sales desks 3 and 4 in
 * front of the platforms, and plants. The two platforms along the north
 * wall are in `PLATFORMS`.
 */
const WING_PROPS: Prop[] = [
  { id: 'wing-sofa', model: 'loungeSofa', rect: { tx: 37, tz: 3, w: 2, h: 1 }, facing: 0 },
  ...salesDesk(3, { tx: 40, tz: 10 }),
  ...salesDesk(4, { tx: 45, tz: 10 }),
  { id: 'wing-plant-1', model: 'pottedPlant', rect: { tx: 47, tz: 3, w: 1, h: 1 }, facing: 0 },
  { id: 'wing-plant-2', model: 'pottedPlant', rect: { tx: 47, tz: 12, w: 1, h: 1 }, facing: 0 },
]

/**
 * The service garage, walls included: in the parcel's north-east corner, east
 * of the wing and north of the east lot, with its doors to the south. Two bays
 * with lifts on the west, a service counter and waiting chairs on the east.
 */
export const GARAGE: Rect = { tx: 49, tz: 1, w: 10, h: 9 }

/** A service bay: where the car stands on the lift, nose in, and the door it comes through. */
export interface ServiceBay {
  rect: Rect
  facing: Facing
  door: Rect
}

export const SERVICE_BAYS: ServiceBay[] = [50, 53].map((tx) => ({
  rect: { tx, tz: 3, w: 2, h: 3 },
  facing: 2,
  door: { tx, tz: GARAGE.tz + GARAGE.h - 1, w: 2, h: 1 },
}))

/** The garage's pole sign, out front by the east fence, facing the street. */
export const GARAGE_SIGN: Rect = { tx: 58, tz: 11, w: 1, h: 1 }

/** The bays standing with the `expansions` up: none until the garage is built. */
export function serviceBays(expansions: readonly ExpansionId[]): ServiceBay[] {
  return expansions.includes('service-bay') ? SERVICE_BAYS : []
}

/** Where mechanics wait for work: the garage's corners, clear of the bays and the doors. */
export const GARAGE_STANDBY_TILES: Tile[] = [
  { tx: 52, tz: 2 },
  { tx: 55, tz: 2 },
  { tx: 52, tz: 7 },
  { tx: 55, tz: 7 },
]

/** Where the service advisor sits, behind the counter. */
export const SERVICE_CHAIR_ID = 'service-chair'
/** The chairs service clients wait in, facing the bays. */
export const SERVICE_WAIT_IDS = [1, 2, 3, 4].map((n) => `service-wait-${n}`)

const GARAGE_WALLS: WallRun[] = [
  { kind: 'solid', rect: { tx: GARAGE.tx, tz: GARAGE.tz, w: GARAGE.w, h: 1 } },
  { kind: 'solid', rect: { tx: GARAGE.tx, tz: GARAGE.tz, w: 1, h: GARAGE.h } },
  { kind: 'solid', rect: { tx: GARAGE.tx + GARAGE.w - 1, tz: GARAGE.tz, w: 1, h: GARAGE.h } },
  { kind: 'solid', rect: { tx: GARAGE.tx, tz: GARAGE.tz + GARAGE.h - 1, w: GARAGE.w, h: 1 } },
]

/**
 * The service drive's gate in the street fence, east of the east lot: client
 * cars come and go through it, up and down the lane (tx 53–54) between the
 * east lot's rows and the service spaces.
 */
export const SERVICE_GATE: Rect = { tx: 53, tz: 24, w: 2, h: 1 }

/**
 * Where service clients' cars park, along the east fence south of the
 * garage, noses to the fence. A car keeps its space from drop-off until it
 * drives off: it goes from there to a bay and comes back to it when it's done.
 */
export const SERVICE_SPOTS: ParkingSpace[] = spaceRow(
  4,
  { tx: 55, tz: 14 },
  { tx: 0, tz: 2 },
  { w: 4, h: 2 },
  1,
)

/** The service counter, where clients check in. */
export const SERVICE_COUNTER_ID = 'service-counter'

/** The roll-up doors, the clients' door by the counter and the service drive's gate. */
const GARAGE_OPENINGS: Rect[] = [
  ...SERVICE_BAYS.map((b) => b.door),
  { tx: 56, tz: GARAGE.tz + GARAGE.h - 1, w: 1, h: 1 },
  SERVICE_GATE,
]

/** The garage floor, inside its walls. */
const GARAGE_FLOOR: Rect = {
  tx: GARAGE.tx + 1,
  tz: GARAGE.tz + 1,
  w: GARAGE.w - 2,
  h: GARAGE.h - 2,
}

const GARAGE_PROPS: Prop[] = [
  { id: SERVICE_COUNTER_ID, model: 'desk', rect: { tx: 56, tz: 3, w: 2, h: 1 }, facing: 0 },
  {
    id: 'service-monitor',
    model: 'computerScreen',
    rect: { tx: 57, tz: 3, w: 1, h: 1 },
    facing: 2,
    blocks: false,
    elevation: DESK_TOP,
  },
  { id: SERVICE_CHAIR_ID, model: 'chairDesk', rect: { tx: 57, tz: 2, w: 1, h: 1 }, facing: 0 },
  ...SERVICE_WAIT_IDS.map((id, i): Prop => ({
    id,
    model: 'chairCushion',
    rect: { tx: 57, tz: 5 + i, w: 1, h: 1 },
    facing: 3,
  })),
]

/** Where the fence between the lot and the parcel opens once the parcel is bought. */
export const PARCEL_GATE: Rect = { tx: 39, tz: 15, w: 1, h: 9 }

/** Out front of the parcel while it's for sale, facing the street. */
const FOR_SALE_SIGN: Prop = {
  id: 'for-sale-sign',
  model: 'forSaleSign',
  rect: { tx: 48, tz: 23, w: 3, h: 1 },
  facing: 0,
}

export interface Layout {
  width: number
  height: number
  /** The floor zones as painted, in order (later entries win). */
  areas: Zone[]
  zones: ZoneKind[]
  walls: (WallKind | null)[]
  props: Prop[]
  /** Footprints that block without a prop of their own: the garage's lifts. */
  blocked: Rect[]
}

function forEachTile(r: Rect, fn: (tx: number, tz: number) => void): void {
  for (let tz = r.tz; tz < r.tz + r.h; tz++) {
    for (let tx = r.tx; tx < r.tx + r.w; tx++) fn(tx, tz)
  }
}

/**
 * The paved east lot: the parcel, and the strip under the fence between it
 * and the old lot, so the two lots meet without a seam of grass.
 */
const EAST_LOT_PAVING: Rect = { ...PARCEL, tx: PARCEL.tx - 1, w: PARCEL.w + 1 }

/**
 * The dealership with the `expansions` that are up. Until the east lot is
 * bought, the parcel is closed off behind its fence with a sign out front;
 * once it is, the parcel and the strip under the fence are asphalt and the
 * fence between the lots opens. The showroom wing then stands on its north
 * side, with its furniture.
 */
export function buildLayout(expansions: readonly ExpansionId[] = []): Layout {
  const lot = expansions.includes('east-lot')
  const wing = expansions.includes('showroom-wing')
  const garage = lot && expansions.includes('service-bay')
  const areas = ZONES.map((z) =>
    lot && z.kind === 'parcel' ? { kind: 'asphalt' as const, rect: EAST_LOT_PAVING } : z,
  )
  if (wing) areas.push({ kind: 'showroom', rect: WING })
  if (garage) areas.push({ kind: 'garage', rect: GARAGE_FLOOR })
  const wallRuns = [...WALL_RUNS, ...(wing ? WING_WALLS : []), ...(garage ? GARAGE_WALLS : [])]
  const openings = [
    ...OPENINGS,
    ...(lot ? [PARCEL_GATE] : []),
    ...(wing ? WING_OPENINGS : []),
    ...(garage ? GARAGE_OPENINGS : []),
  ]
  const n = GRID_WIDTH * GRID_HEIGHT
  const idx = (tx: number, tz: number) => tz * GRID_WIDTH + tx
  const zones: ZoneKind[] = new Array<ZoneKind>(n).fill('grass')
  const walls: (WallKind | null)[] = new Array<WallKind | null>(n).fill(null)
  for (const z of areas) forEachTile(z.rect, (tx, tz) => (zones[idx(tx, tz)] = z.kind))
  for (const w of wallRuns) forEachTile(w.rect, (tx, tz) => (walls[idx(tx, tz)] = w.kind))
  for (const o of openings) forEachTile(o, (tx, tz) => (walls[idx(tx, tz)] = null))
  const fixed = wing
    ? PROPS.map((p) => (p.id === LOUNGE_PLANT_ID ? { ...p, rect: LOUNGE_PLANT_MOVED } : p))
    : PROPS
  const props = [
    ...fixed,
    ...(lot ? [] : [FOR_SALE_SIGN]),
    ...(wing ? WING_PROPS : []),
    ...(garage ? GARAGE_PROPS : []),
  ]
  const blocked = garage ? [...SERVICE_BAYS.map((b) => b.rect), GARAGE_SIGN] : []
  return { width: GRID_WIDTH, height: GRID_HEIGHT, areas, zones, walls, props, blocked }
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
  for (const r of layout.blocked) grid.blockRect(r.tx, r.tz, r.w, r.h)
  return grid
}
