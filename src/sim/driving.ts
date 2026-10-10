import type { Customer } from './customers'
import type { Tile, Vec2 } from './grid'
import { CUSTOMER_PARKING, GRID_WIDTH, parkedCarRect, type CarModel } from './layout'
import { driveInChance } from './marketing'
import { createRng, hashSeed, type Rng } from './rng'
import { rollUsedCar, type UsedInfo } from './usedCars'

/**
 * Visitors who drive in: who comes by car, which customer-parking space they
 * take, and the fixed routes their car follows in and out. The world
 * (`scene/DrivenCar.tsx`) moves the car; the store only hears `parked` and
 * `droveOff`.
 *
 * Routes are in tile coordinates (`grid.tileToWorld` turns them into world
 * space), fractions allowed: a whole number is a tile's centre.
 */

/** The car a visitor drove in, and the customer-parking space it takes. */
export interface Vehicle {
  car: UsedInfo & { model: CarModel }
  /** Index into `CUSTOMER_PARKING`. */
  spot: number
  /** In its space with the driver out. False while it's still driving in. */
  parked: boolean
}

/** Share of planned arrivals who come by car, while a space is free. */
export const DRIVE_IN_CHANCE = 0.35

/** Spaces taken by a visitor's car, from the moment they turn up until they drive off. */
export function spotsInUse(customers: readonly Customer[]): Set<number> {
  return new Set(customers.flatMap((c) => (c.vehicle ? [c.vehicle.spot] : [])))
}

/**
 * The first free customer-parking space, or null when all are taken. `taken`
 * are spaces held by something else: a car we bought, waiting there until closing.
 */
export function freeSpot(
  customers: readonly Customer[],
  taken: readonly number[] = [],
): number | null {
  const used = new Set([...spotsInUse(customers), ...taken])
  const i = CUSTOMER_PARKING.findIndex((_, n) => !used.has(n))
  return i < 0 ? null : i
}

/**
 * Gives some of the `arrived` customers a car, while `present` (everyone
 * already on the lot), the earlier arrivals and `taken` (see `freeSpot`) leave
 * a space free. Each driver's car is a used one of today's (`rollUsedCar`).
 */
export function assignVehicles(
  arrived: readonly Customer[],
  present: readonly Customer[],
  rng: Rng,
  day: number,
  taken: readonly number[] = [],
): Customer[] {
  const out: Customer[] = []
  for (const c of arrived) {
    const spot = freeSpot([...present, ...out], taken)
    if (spot === null || rng.next() >= driveInChance(c.source, DRIVE_IN_CHANCE)) {
      out.push(c)
      continue
    }
    out.push({ ...c, vehicle: { car: rollUsedCar(rng, day), spot, parked: false } })
  }
  return out
}

/**
 * How clean a visitor's car (customer `id`'s) is: worn cars tend to be the
 * dirty ones too. Seeded by the id, so the world and the store agree.
 */
export function drivenCleanliness(id: string, condition: number): number {
  const rng = createRng(hashSeed(`${id}:dirt`))
  return Math.min(1, 0.35 + 0.5 * condition + rng.next() * 0.15)
}

/** Where a driver gets out and back in: the tile behind their car. */
export function doorTile(spot: number): Tile {
  const { rect } = CUSTOMER_PARKING[spot]
  return { tx: rect.tx, tz: rect.tz + rect.h - 1 }
}

/** Where a parked car's centre sits, and which way it faces (radians, 0 = +z). */
export function parkedPose(spot: number): { pos: Vec2; heading: number } {
  const space = CUSTOMER_PARKING[spot]
  const r = parkedCarRect(space)
  return {
    pos: { x: r.tx + (r.w - 1) / 2, z: r.tz + (r.h - 1) / 2 },
    heading: (space.facing * Math.PI) / 2,
  }
}

/** Which end of the road a car comes from or heads to. */
export type RoadEnd = 'west' | 'east'

/** How far past the map's edge a car starts and ends, in tiles. */
const OFF_MAP = 4
export const ROAD_WEST = -OFF_MAP
export const ROAD_EAST = GRID_WIDTH - 1 + OFF_MAP
/** Eastbound cars keep to the far lane, westbound to the near one. */
export const LANE: Record<'eastbound' | 'westbound', number> = { eastbound: 28.5, westbound: 27.5 }
/** Through the driveway gate: in on its east side, out on its west. */
const GATE_IN_X = 19
const GATE_OUT_X = 17.6
/** The aisle south of customer parking, where cars turn into and out of their space. */
const AISLE_Z = 19

/** One stretch of a route, driven forwards or in reverse. */
export interface Leg {
  points: Vec2[]
  reverse: boolean
}

const p = (x: number, z: number): Vec2 => ({ x, z })

/**
 * From a road end, through the gate, along the aisle and nose-first into
 * `spot`. From the west they come along the far lane and turn left in; from
 * the east, the near lane and turn right.
 */
export function inboundRoute(spot: number, from: RoadEnd): Leg[] {
  const { pos } = parkedPose(spot)
  const lane = from === 'west' ? LANE.eastbound : LANE.westbound
  const start = from === 'west' ? ROAD_WEST : ROAD_EAST
  return [
    {
      points: smoothCorners([
        p(start, lane),
        p(GATE_IN_X, lane),
        p(GATE_IN_X, AISLE_Z),
        p(pos.x, AISLE_Z),
        pos,
      ]),
      reverse: false,
    },
  ]
}

/**
 * Backs out of `spot` into the aisle, then drives down it, out of the gate
 * and off along the road toward `to`, keeping to that direction's lane.
 */
export function outboundRoute(spot: number, to: RoadEnd): Leg[] {
  const { pos } = parkedPose(spot)
  const lane = to === 'west' ? LANE.westbound : LANE.eastbound
  const end = to === 'west' ? ROAD_WEST : ROAD_EAST
  return [
    { points: [pos, p(pos.x, AISLE_Z)], reverse: true },
    {
      points: smoothCorners([
        p(pos.x, AISLE_Z),
        p(GATE_OUT_X, AISLE_Z),
        p(GATE_OUT_X, lane),
        p(end, lane),
      ]),
      reverse: false,
    },
  ]
}

/** How far before and after a corner a car starts and finishes turning, in tiles. */
export const TURN_RADIUS = 1.6
const CORNER_STEPS = 5

/**
 * Rounds each interior corner of a polyline into a short curve (a quadratic
 * Bézier from `radius` before the corner to `radius` after it), so a car turns
 * rather than pivoting on the spot. Ends stay where they are.
 */
export function smoothCorners(points: readonly Vec2[], radius = TURN_RADIUS): Vec2[] {
  if (points.length < 3) return [...points]
  const out: Vec2[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const [a, c, b] = [points[i - 1], points[i], points[i + 1]]
    const inLen = Math.hypot(c.x - a.x, c.z - a.z)
    const outLen = Math.hypot(b.x - c.x, b.z - c.z)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    if (r <= 0) continue
    const from = p(c.x + ((a.x - c.x) / inLen) * r, c.z + ((a.z - c.z) / inLen) * r)
    const to = p(c.x + ((b.x - c.x) / outLen) * r, c.z + ((b.z - c.z) / outLen) * r)
    for (let s = 0; s <= CORNER_STEPS; s++) {
      const t = s / CORNER_STEPS
      const u = 1 - t
      out.push(
        p(
          u * u * from.x + 2 * u * t * c.x + t * t * to.x,
          u * u * from.z + 2 * u * t * c.z + t * t * to.z,
        ),
      )
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** Total length of a polyline. */
export function routeLength(points: readonly Vec2[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
  }
  return total
}

/** Half a car's width, in tiles: how far either side of its lane it reaches. */
export const CAR_HALF_WIDTH = 1

/** How far ahead of its centre a car looks for someone in the way, and how wide. */
export const YIELD_AHEAD = 3
export const YIELD_HALF_WIDTH = 1.1

/**
 * Whether a car at `pos`, moving along `dir` (any length), should stop for
 * anyone in `others`: someone within `YIELD_AHEAD` in front of its centre and
 * close enough either side to be hit.
 */
export function blockedAhead(pos: Vec2, dir: Vec2, others: Iterable<Vec2>): boolean {
  const len = Math.hypot(dir.x, dir.z)
  if (len < 1e-9) return false
  const fx = dir.x / len
  const fz = dir.z / len
  for (const o of others) {
    const dx = o.x - pos.x
    const dz = o.z - pos.z
    const ahead = dx * fx + dz * fz
    const side = Math.abs(dx * fz - dz * fx)
    if (ahead > 0 && ahead < YIELD_AHEAD && side < YIELD_HALF_WIDTH) return true
  }
  return false
}
