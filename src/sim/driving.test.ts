import { describe, expect, it } from 'vitest'
import { generateCustomer, type Customer } from './customers'
import {
  assignVehicles,
  blockedAhead,
  doorTile,
  DRIVE_IN_CHANCE,
  freeSpot,
  inboundRoute,
  outboundRoute,
  parkedPose,
  routeLength,
  smoothCorners,
  spotsInUse,
  type Vehicle,
} from './driving'
import type { Vec2 } from './grid'
import { buildInventory } from './inventory'
import {
  buildLayout,
  createGrid,
  CUSTOMER_PARKING,
  GRID_HEIGHT,
  GRID_WIDTH,
  OPENINGS,
  PARKING_SPACES,
  parkedCarRect,
  type Rect,
} from './layout'
import { createRng } from './rng'

const inventory = buildInventory(createRng(42))
const customer = (id: string, vehicle: Vehicle | null = null): Customer => ({
  ...generateCustomer(id, inventory, createRng(1)),
  vehicle,
})
const car = { model: 'sedan' as const, year: 2020, miles: 70_000, condition: 0.6, acquiredDay: 1 }
const parkedIn = (spot: number): Vehicle => ({ car, spot, parked: true })

describe('customer parking spaces', () => {
  it('finds the first free space and none once all are taken', () => {
    expect(freeSpot([])).toBe(0)
    expect(freeSpot([customer('a', parkedIn(0)), customer('b')])).toBe(1)
    expect(freeSpot([customer('a', parkedIn(1))])).toBe(0)
    const full = CUSTOMER_PARKING.map((_, n) => customer(`c${n}`, parkedIn(n)))
    expect(freeSpot(full)).toBeNull()
    expect(spotsInUse(full).size).toBe(CUSTOMER_PARKING.length)
  })

  it('puts the driver behind their car, on a tile the car leaves free', () => {
    CUSTOMER_PARKING.forEach((space, n) => {
      const door = doorTile(n)
      const r = parkedCarRect(space)
      const inCar =
        door.tx >= r.tx && door.tx < r.tx + r.w && door.tz >= r.tz && door.tz < r.tz + r.h
      expect(inCar).toBe(false)
      expect(door.tz).toBe(r.tz + r.h)
    })
  })
})

describe('assignVehicles', () => {
  it('sends about the drive-in share by car', () => {
    const arrived = Array.from({ length: 400 }, (_, i) => customer(`c${i}`))
    // One at a time, each with the lot empty, so a space is always free.
    const rng = createRng(5)
    const drivers = arrived.filter((c) => assignVehicles([c], [], rng, 3)[0].vehicle).length
    expect(drivers / arrived.length).toBeGreaterThan(DRIVE_IN_CHANCE - 0.08)
    expect(drivers / arrived.length).toBeLessThan(DRIVE_IN_CHANCE + 0.08)
  })

  it('never parks more cars than there are spaces, nor two in one', () => {
    const arrived = Array.from({ length: 60 }, (_, i) => customer(`c${i}`))
    const present = [customer('p', parkedIn(1))]
    const out = assignVehicles(arrived, present, createRng(9), 3)
    const spots = out.flatMap((c) => (c.vehicle ? [c.vehicle.spot] : []))
    expect(spots).toHaveLength(CUSTOMER_PARKING.length - 1)
    expect(new Set(spots).size).toBe(spots.length)
    expect(spots).not.toContain(1)
  })

  it('gives a driver a used car of today that is still driving in', () => {
    const rng = createRng(1)
    let driver = customer('x')
    while (!driver.vehicle) driver = assignVehicles([customer('x')], [], rng, 12)[0]
    expect(driver.vehicle.parked).toBe(false)
    expect(driver.vehicle.car.acquiredDay).toBe(12)
    expect(driver.vehicle.car.year).toBeLessThan(2026)
  })

  it('leaves the customers alone when every space is taken', () => {
    const full = CUSTOMER_PARKING.map((_, n) => customer(`p${n}`, parkedIn(n)))
    const arrived = [customer('a'), customer('b')]
    expect(assignVehicles(arrived, full, createRng(1), 1)).toEqual(arrived)
  })
})

describe('smoothCorners', () => {
  it('keeps the ends and rounds the corner inside its radius', () => {
    const pts: Vec2[] = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ]
    const out = smoothCorners(pts, 2)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[2])
    // The sharp corner itself is cut.
    expect(out).not.toContainEqual(pts[1])
    expect(out).toContainEqual({ x: 8, z: 0 })
    expect(out).toContainEqual({ x: 10, z: 2 })
    expect(routeLength(out)).toBeLessThan(routeLength(pts))
  })

  it('leaves a straight line alone', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
    ]
    expect(smoothCorners(pts)).toEqual(pts)
  })
})

describe('routes', () => {
  const layout = buildLayout()
  const grid = createGrid(layout)
  const inRect = (r: Rect, tx: number, tz: number) =>
    tx >= r.tx && tx < r.tx + r.w && tz >= r.tz && tz < r.tz + r.h
  const gate = OPENINGS[2]
  // Every point a car's body passes over, sampled finely, as tiles.
  const tilesOf = (pts: Vec2[]) => {
    const out: { tx: number; tz: number }[] = []
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]]
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 4)
      for (let s = 0; s <= steps; s++) {
        const t = s / Math.max(1, steps)
        out.push({
          tx: Math.round(a.x + (b.x - a.x) * t),
          tz: Math.round(a.z + (b.z - a.z) * t),
        })
      }
    }
    return out
  }

  for (const end of ['west', 'east'] as const) {
    CUSTOMER_PARKING.forEach((_, spot) => {
      it(`drives in from the ${end} to space ${spot} and back out`, () => {
        const inbound = inboundRoute(spot, end).flatMap((l) => l.points)
        const outbound = outboundRoute(spot, end)
        const { pos } = parkedPose(spot)
        // Starts and ends off the map, parks in the space.
        expect(inbound[0].x < 0 || inbound[0].x >= GRID_WIDTH).toBe(true)
        expect(inbound[inbound.length - 1]).toEqual(pos)
        expect(outbound[0].reverse).toBe(true)
        expect(outbound[0].points[0]).toEqual(pos)
        const last = outbound[1].points[outbound[1].points.length - 1]
        expect(last.x < 0 || last.x >= GRID_WIDTH).toBe(true)

        for (const route of [inbound, outbound.flatMap((l) => l.points)]) {
          for (const t of tilesOf(route)) {
            if (t.tx < 0 || t.tx >= GRID_WIDTH || t.tz >= GRID_HEIGHT) continue
            const at = `${t.tx},${t.tz}`
            // Through the fence only at the gate.
            if (t.tz === gate.tz) expect(inRect(gate, t.tx, t.tz), at).toBe(true)
            // Never over a stock space's car, a prop or a wall inside the lot.
            for (const s of PARKING_SPACES)
              expect(inRect(parkedCarRect(s), t.tx, t.tz), at).toBe(false)
            if (t.tz < gate.tz) expect(grid.isWalkable(t.tx, t.tz), at).toBe(true)
          }
        }
      })
    })
  }
})

describe('blockedAhead', () => {
  const pos = { x: 0, z: 0 }
  const east = { x: 1, z: 0 }

  it('stops for someone just in front', () => {
    expect(blockedAhead(pos, east, [{ x: 2, z: 0.5 }])).toBe(true)
  })

  it('ignores anyone behind, off to the side or far ahead', () => {
    expect(blockedAhead(pos, east, [{ x: -1, z: 0 }])).toBe(false)
    expect(blockedAhead(pos, east, [{ x: 1, z: 2 }])).toBe(false)
    expect(blockedAhead(pos, east, [{ x: 6, z: 0 }])).toBe(false)
  })

  it('goes nowhere without a direction', () => {
    expect(blockedAhead(pos, { x: 0, z: 0 }, [{ x: 1, z: 0 }])).toBe(false)
  })
})
