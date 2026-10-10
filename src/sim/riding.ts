import { LANE, ROAD_EAST, ROAD_WEST, smoothCorners, type Leg, type RoadEnd } from './driving'
import type { Tile, Vec2 } from './grid'
import { ZONES } from './layout'
import { createRng, hashSeed } from './rng'

/**
 * Nazma's and Jaguar's motorcycles: where each one parks, and the fixed routes
 * they ride. The world (`scene/Jaguar.tsx`, `scene/Nazma.tsx`) moves the bikes;
 * the store never hears about them.
 *
 * Like `sim/driving.ts`, everything is in tile coordinates (`grid.tileToWorld`
 * turns them into world space), fractions allowed.
 */

/** A bike's id in `runtime.vehiclePos`: `bike:` and its rider's id. */
export const BIKE_PREFIX = 'bike:'
export const bikeId = (rider: string) => `${BIKE_PREFIX}${rider}`
export const isBikeId = (id: string) => id.startsWith(BIKE_PREFIX)

/** Half a bike's length and width, in tiles. */
export const BIKE_HALF_LENGTH = 0.7
export const BIKE_HALF_WIDTH = 0.3

const ROAD = ZONES.find((z) => z.kind === 'road')!.rect
/** The road's kerbs: the lot's sidewalk is north of it, Nazma's shop south. */
export const ROAD_NORTH_EDGE = ROAD.tz - 0.5
export const ROAD_SOUTH_EDGE = ROAD.tz + ROAD.h - 0.5

/** Where a bike stands when it's parked, and which way it faces (radians, 0 = +z). */
export interface BikeBay {
  pos: Vec2
  heading: number
}

const p = (x: number, z: number): Vec2 => ({ x, z })
const EAST = Math.PI / 2
const NORTH = Math.PI

/**
 * Where the bikes park, all clear of both lanes so a parked bike never
 * blocks a car:
 * - `jaguar`: on the road's south shoulder, east of the driveway. He walks
 *   straight across the road from there to `JAGUAR_CROSSING`.
 * - `nazmaShop`: out front of the cupcake shop, east of its patio, where his
 *   bike stands whenever he isn't visiting.
 * - `nazmaLot`: on the lot's sidewalk at the kerb, just west of the
 *   driveway and `SHOP_CROSSING`.
 */
export const BIKE_BAYS = {
  jaguar: { pos: p(23, ROAD_SOUTH_EDGE + 0.6), heading: EAST },
  nazmaShop: { pos: p(26, ROAD_SOUTH_EDGE + 3.2), heading: NORTH },
  nazmaLot: { pos: p(15.5, ROAD_NORTH_EDGE - 0.35), heading: -EAST },
} satisfies Record<string, BikeBay>

/** The sidewalk tile Jaguar steps onto, straight across the road from his bike. */
export const JAGUAR_CROSSING: Tile = { tx: BIKE_BAYS.jaguar.pos.x, tz: ROAD.tz - 1 }

/** How far along the road before (or after) his bay he swings across to it, in tiles. */
const SWING = 3

/**
 * Jaguar's ride in from a road end, along that direction's lane and across
 * to the south shoulder: from the west, the far lane; from the east, the near
 * one (then over the far lane to the kerb).
 */
export function jaguarRideIn(from: RoadEnd): Leg[] {
  const bay = BIKE_BAYS.jaguar.pos
  const [start, lane, swing] =
    from === 'west'
      ? [ROAD_WEST, LANE.eastbound, bay.x - SWING]
      : [ROAD_EAST, LANE.westbound, bay.x + SWING]
  return [{ points: smoothCorners([p(start, lane), p(swing, lane), bay]), reverse: false }]
}

/** Jaguar's ride off from his bay, into the lane toward `to` and off the map. */
export function jaguarRideOut(to: RoadEnd): Leg[] {
  const bay = BIKE_BAYS.jaguar.pos
  const [end, lane, swing] =
    to === 'west'
      ? [ROAD_WEST, LANE.westbound, bay.x - SWING]
      : [ROAD_EAST, LANE.eastbound, bay.x + SWING]
  return [{ points: smoothCorners([bay, p(swing, lane), p(end, lane)]), reverse: false }]
}

/** He rides off the way he was heading, so he never turns about on the shoulder. */
export const onwardEnd = (from: RoadEnd): RoadEnd => (from === 'west' ? 'east' : 'west')

/**
 * Nazma's ride over and back. `out`: from out front of his shop up to the
 * road, west along the near lane and onto the kerb by the crossing. `home`:
 * off the kerb into the far lane, east to his shop and in out front.
 */
export function nazmaRide(way: 'out' | 'home'): Leg[] {
  const shop = BIKE_BAYS.nazmaShop.pos
  const lot = BIKE_BAYS.nazmaLot.pos
  const points =
    way === 'out'
      ? [shop, p(shop.x, LANE.westbound), p(lot.x + SWING, LANE.westbound), lot]
      : [lot, p(lot.x - SWING, LANE.eastbound), p(shop.x, LANE.eastbound), shop]
  return [{ points: smoothCorners(points), reverse: false }]
}

/** Which end of the road Jaguar rides in from on `day`. Seeded, so the day replays the same. */
export function pickRoadEnd(day: number): RoadEnd {
  return createRng(hashSeed(`ride:${day}`)).next() < 0.5 ? 'west' : 'east'
}

/** Whether `z` is on the road, between its kerbs. */
export const onRoad = (z: number) => z > ROAD_NORTH_EDGE && z < ROAD_SOUTH_EDGE
