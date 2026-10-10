import { describe, expect, it } from 'vitest'
import { CAR_HALF_WIDTH, inboundRoute, LANE, outboundRoute, type Leg } from './driving'
import type { Vec2 } from './grid'
import { buildLayout, createGrid, CUSTOMER_PARKING, GRID_WIDTH, SHOP_CROSSING } from './layout'
import {
  BIKE_BAYS,
  BIKE_HALF_LENGTH,
  BIKE_HALF_WIDTH,
  bikeId,
  isBikeId,
  JAGUAR_CROSSING,
  jaguarRideIn,
  jaguarRideOut,
  nazmaRide,
  onRoad,
  onwardEnd,
  pickRoadEnd,
  ROAD_NORTH_EDGE,
  ROAD_SOUTH_EDGE,
} from './riding'

const points = (legs: Leg[]): Vec2[] => legs.flatMap((l) => l.points)
const first = (legs: Leg[]) => points(legs)[0]
const last = (legs: Leg[]) => points(legs).at(-1)!
const offMap = (v: Vec2) => v.x < 0 || v.x > GRID_WIDTH - 1
const bays = Object.values(BIKE_BAYS)

describe('bike bays', () => {
  it('keep a parked bike clear of a car in either lane', () => {
    // Bays sit along the kerb, so the bike's width faces the lanes.
    for (const bay of bays) {
      for (const lane of Object.values(LANE)) {
        expect(Math.abs(bay.pos.z - lane)).toBeGreaterThanOrEqual(CAR_HALF_WIDTH + BIKE_HALF_WIDTH)
      }
    }
  })

  it('keep clear of the driveway, where cars turn in and out', () => {
    // Every point a driven car passes on its way in or out.
    const routes = CUSTOMER_PARKING.flatMap((_, spot) =>
      (['west', 'east'] as const).flatMap((end) => [
        ...points(inboundRoute(spot, end)),
        ...points(outboundRoute(spot, end)),
      ]),
    )
    for (const bay of bays) {
      const nearest = Math.min(...routes.map((r) => Math.hypot(r.x - bay.pos.x, r.z - bay.pos.z)))
      expect(nearest).toBeGreaterThan(CAR_HALF_WIDTH + BIKE_HALF_LENGTH - 0.5)
    }
  })

  it('put Jaguar on the far shoulder and Nazma on the near sidewalk', () => {
    expect(BIKE_BAYS.jaguar.pos.z).toBeGreaterThan(ROAD_SOUTH_EDGE)
    expect(BIKE_BAYS.nazmaShop.pos.z).toBeGreaterThan(ROAD_SOUTH_EDGE)
    expect(BIKE_BAYS.nazmaLot.pos.z).toBeLessThan(ROAD_NORTH_EDGE)
    expect(Math.abs(BIKE_BAYS.nazmaLot.pos.x - SHOP_CROSSING.tx)).toBeLessThan(4)
  })

  it("park Nazma on a sidewalk tile he can walk off, and Jaguar's crossing is walkable", () => {
    const grid = createGrid(buildLayout())
    const lot = BIKE_BAYS.nazmaLot.pos
    expect(grid.isWalkable(Math.round(lot.x), Math.round(lot.z))).toBe(true)
    expect(grid.isWalkable(JAGUAR_CROSSING.tx, JAGUAR_CROSSING.tz)).toBe(true)
    expect(JAGUAR_CROSSING.tx).toBe(BIKE_BAYS.jaguar.pos.x)
  })
})

describe("Jaguar's ride", () => {
  it('comes in from off the map and ends in his bay', () => {
    for (const from of ['west', 'east'] as const) {
      const route = jaguarRideIn(from)
      expect(offMap(first(route))).toBe(true)
      expect(first(route).x < 0).toBe(from === 'west')
      expect(last(route)).toEqual(BIKE_BAYS.jaguar.pos)
    }
  })

  it('leaves from his bay and ends off the map', () => {
    for (const to of ['west', 'east'] as const) {
      const route = jaguarRideOut(to)
      expect(first(route)).toEqual(BIKE_BAYS.jaguar.pos)
      expect(offMap(last(route))).toBe(true)
      expect(last(route).x < 0).toBe(to === 'west')
    }
  })

  it('keeps to the road between his bay and the end', () => {
    for (const end of ['west', 'east'] as const) {
      for (const pt of [...points(jaguarRideIn(end)), ...points(jaguarRideOut(end))]) {
        expect(pt.z).toBeGreaterThan(ROAD_NORTH_EDGE)
        expect(pt.z).toBeLessThanOrEqual(BIKE_BAYS.jaguar.pos.z)
      }
    }
  })

  it('rides off the way he was heading', () => {
    expect(onwardEnd('west')).toBe('east')
    expect(onwardEnd('east')).toBe('west')
  })

  it('picks a road end from the day, the same every time', () => {
    const ends = Array.from({ length: 40 }, (_, i) => pickRoadEnd(i + 1))
    expect(ends).toEqual(Array.from({ length: 40 }, (_, i) => pickRoadEnd(i + 1)))
    expect(new Set(ends)).toEqual(new Set(['west', 'east']))
  })
})

describe("Nazma's ride", () => {
  it('goes from his shop to the lot sidewalk and back', () => {
    expect(first(nazmaRide('out'))).toEqual(BIKE_BAYS.nazmaShop.pos)
    expect(last(nazmaRide('out'))).toEqual(BIKE_BAYS.nazmaLot.pos)
    expect(first(nazmaRide('home'))).toEqual(BIKE_BAYS.nazmaLot.pos)
    expect(last(nazmaRide('home'))).toEqual(BIKE_BAYS.nazmaShop.pos)
  })

  it('crosses the road, staying on the map', () => {
    for (const way of ['out', 'home'] as const) {
      const pts = points(nazmaRide(way))
      expect(pts.some((pt) => onRoad(pt.z))).toBe(true)
      expect(pts.every((pt) => !offMap(pt))).toBe(true)
    }
  })
})

describe('bike ids', () => {
  it('are told apart from a visitor’s car', () => {
    expect(isBikeId(bikeId('jaguar'))).toBe(true)
    expect(isBikeId('c-12')).toBe(false)
  })
})
