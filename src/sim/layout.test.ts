import { describe, expect, it } from 'vitest'
import {
  buildLayout,
  createGrid,
  CUSTOMER_PARKING,
  DESK_CHAIR_ID,
  GARAGE,
  GARAGE_SIGN,
  GARAGE_STANDBY_TILES,
  GUARD_PATROL_TILES,
  GRID_WIDTH,
  GUEST_CHAIR_ID,
  LOT_ENTRY_TILES,
  OPENINGS,
  OWNER_OFFICE_TILES,
  PARCEL,
  PARCEL_GATE,
  PARKING_SPACES,
  parkedCarRect,
  patrolTiles,
  PLATFORMS,
  PORTER_STANDBY_TILES,
  PROPS,
  RECEPTION_CHAIR_ID,
  SALES_DESKS,
  salesDesks,
  SERVICE_BAYS,
  SERVICE_CHAIR_ID,
  SERVICE_WAIT_IDS,
  serviceBays,
  SIDEWALK_ENDS,
  SOFA_IDS,
  spaceOpen,
  SPAWN_TILE,
  WING,
  wallAt,
  isIndoor,
  zoneAt,
  type Layout,
  type Rect,
} from './layout'
import { applyToGrid, buildInventory, carProp } from './inventory'
import { approachTilesFor } from './interactables'
import { doorTile } from './driving'
import { IMPROVEMENTS, improvementFootprints, type ImprovementId } from './improvements'
import { findPath, findPathToAny } from './pathfinding'
import { createRng } from './rng'

const layout = buildLayout()
const inventory = buildInventory(createRng(1))
const grid = createGrid(layout)
applyToGrid(grid, inventory)

function tiles(r: Rect): [number, number][] {
  const out: [number, number][] = []
  for (let tz = r.tz; tz < r.tz + r.h; tz++)
    for (let tx = r.tx; tx < r.tx + r.w; tx++) out.push([tx, tz])
  return out
}

describe('dealership layout', () => {
  it('spawns the player on a walkable tile', () => {
    expect(grid.isWalkable(SPAWN_TILE.tx, SPAWN_TILE.tz)).toBe(true)
  })

  it('lets customers walk from either end of the sidewalk into the lot and back', () => {
    for (const end of SIDEWALK_ENDS) {
      expect(zoneAt(layout, end.tx, end.tz)).toBe('sidewalk')
      for (const entry of LOT_ENTRY_TILES) {
        expect(zoneAt(layout, entry.tx, entry.tz)).toBe('asphalt')
        expect(findPath(grid, end, entry), `${end.tx},${end.tz}`).not.toBeNull()
        expect(findPath(grid, entry, end)).not.toBeNull()
      }
    }
  })

  it('gives the porter a reachable standby spot out on the lot', () => {
    for (const t of PORTER_STANDBY_TILES) {
      expect(zoneAt(layout, t.tx, t.tz)).toBe('asphalt')
      expect(findPath(grid, LOT_ENTRY_TILES[0], t), `${t.tx},${t.tz}`).not.toBeNull()
    }
  })

  it('gives the guard a reachable patrol on the lot, off the parking and the walk in', () => {
    const door = OPENINGS[0]
    const walkIn = findPathToAny(grid, LOT_ENTRY_TILES[0], [{ tx: door.tx, tz: door.tz + 1 }])!
    const parked = PARKING_SPACES.flatMap((s) => tiles(s.rect))
    // Any space may hold a car once stock is ordered, so stay off all their approaches.
    const cars = PARKING_SPACES.flatMap((s) => approachTilesFor(grid, parkedCarRect(s)))
    for (const t of GUARD_PATROL_TILES) {
      const at = `${t.tx},${t.tz}`
      expect(zoneAt(layout, t.tx, t.tz), at).toBe('asphalt')
      expect(findPath(grid, LOT_ENTRY_TILES[0], t), at).not.toBeNull()
      expect(walkIn, at).not.toContainEqual(t)
      expect(parked, at).not.toContainEqual([t.tx, t.tz])
      expect(cars, at).not.toContainEqual(t)
    }
  })

  it('keeps customer parking on open asphalt, clear of the walk in, staff spots and stock', () => {
    const door = OPENINGS[0]
    const walkIn = findPathToAny(grid, LOT_ENTRY_TILES[0], [{ tx: door.tx, tz: door.tz + 1 }])!
    const stock = PARKING_SPACES.flatMap((s) => tiles(s.rect))
    const improvements = improvementFootprints(Object.keys(IMPROVEMENTS) as ImprovementId[])
    const staffSpots = [...PORTER_STANDBY_TILES, ...GUARD_PATROL_TILES]
    const used = new Set<string>()
    for (const space of CUSTOMER_PARKING) {
      for (const [tx, tz] of tiles(space.rect)) {
        const at = `${tx},${tz}`
        expect(zoneAt(layout, tx, tz), at).toBe('asphalt')
        expect(grid.isWalkable(tx, tz), at).toBe(true)
        expect(walkIn, at).not.toContainEqual({ tx, tz })
        expect(stock, at).not.toContainEqual([tx, tz])
        expect(staffSpots, at).not.toContainEqual({ tx, tz })
        expect(improvements.some((r) => tiles(r).some(([x, z]) => x === tx && z === tz))).toBe(
          false,
        )
        expect(used.has(at), at).toBe(false)
        used.add(at)
      }
    }
  })

  it('lets a driver walk from their car to the showroom and back, with every space taken', () => {
    const parked = createGrid(layout)
    applyToGrid(parked, inventory)
    for (const space of CUSTOMER_PARKING) {
      const r = parkedCarRect(space)
      parked.blockRect(r.tx, r.tz, r.w, r.h)
    }
    const door = OPENINGS[0]
    const entrance = { tx: door.tx, tz: door.tz + 1 }
    CUSTOMER_PARKING.forEach((_, n) => {
      const t = doorTile(n)
      expect(parked.isWalkable(t.tx, t.tz)).toBe(true)
      expect(findPath(parked, t, entrance), `${n}`).not.toBeNull()
      expect(findPath(parked, entrance, t)).not.toBeNull()
    })
    // The porter still gets out to the lot from standby.
    expect(findPath(parked, PORTER_STANDBY_TILES[0], LOT_ENTRY_TILES[0])).not.toBeNull()
  })

  it("gives the owner a reachable spot in the office, off the chairs' approaches", () => {
    const chairs = [DESK_CHAIR_ID, GUEST_CHAIR_ID].map((id) => PROPS.find((p) => p.id === id)!)
    const approaches = chairs.flatMap((c) => approachTilesFor(grid, c.rect))
    for (const t of OWNER_OFFICE_TILES) {
      expect(zoneAt(layout, t.tx, t.tz)).toBe('office')
      expect(findPath(grid, SIDEWALK_ENDS[0], t), `${t.tx},${t.tz}`).not.toBeNull()
      expect(approaches).not.toContainEqual(t)
    }
  })

  it('keeps every opening walkable', () => {
    for (const o of OPENINGS) {
      for (const [tx, tz] of tiles(o)) expect(grid.isWalkable(tx, tz), `${tx},${tz}`).toBe(true)
    }
  })

  it('blocks wall and road tiles', () => {
    expect(grid.isWalkable(20, 13)).toBe(false) // showroom glass
    expect(grid.isWalkable(29, 4)).toBe(false) // office partition
    expect(grid.isWalkable(10, 28)).toBe(false) // road
  })

  it('places props and cars in bounds, off walls and without overlapping', () => {
    const owner = new Map<string, string>()
    for (const p of [...layout.props, ...inventory.map(carProp)]) {
      for (const [tx, tz] of tiles(p.rect)) {
        expect(zoneAt(layout, tx, tz), `${p.id} out of bounds`).not.toBeNull()
        expect(wallAt(layout, tx, tz), `${p.id} on a wall`).toBeNull()
        if (p.blocks === false) continue
        const key = `${tx},${tz}`
        expect(owner.get(key), `${p.id} overlaps ${owner.get(key)}`).toBeUndefined()
        owner.set(key, p.id)
      }
    }
  })

  it('parks cars at the nose end of their space', () => {
    const front = PARKING_SPACES[0] // faces +z
    expect(parkedCarRect(front)).toEqual({ tx: 2, tz: 21, w: 2, h: 3 })
    const west = PARKING_SPACES[14] // faces -x
    expect(parkedCarRect(west)).toEqual({ tx: 1, tz: 2, w: 3, h: 2 })
  })

  it('connects the street, lot, showroom, office and lounge', () => {
    const destinations = {
      lot: { tx: 6, tz: 18 },
      showroom: { tx: 22, tz: 8 },
      office: { tx: 31, tz: 5 },
      lounge: { tx: 34, tz: 10 },
      behindBuilding: { tx: 30, tz: 1 },
    }
    for (const [name, goal] of Object.entries(destinations)) {
      expect(findPath(grid, SPAWN_TILE, goal), name).not.toBeNull()
    }
  })

  it('routes into the office only through its door', () => {
    const path = findPath(grid, { tx: 28, tz: 4 }, { tx: 30, tz: 4 })
    expect(path).not.toBeNull()
    expect(path!.some((t) => t.tx === 29 && t.tz === 5)).toBe(true)
  })

  it('routes into the showroom only through the entrance', () => {
    const path = findPath(grid, { tx: 26, tz: 14 }, { tx: 26, tz: 12 })
    expect(path).not.toBeNull()
    expect(path!.some((t) => t.tz === 13 && (t.tx === 21 || t.tx === 22))).toBe(true)
  })

  it('lets people walk from the sidewalk to every staff and guest chair', () => {
    const chairs = [
      RECEPTION_CHAIR_ID,
      DESK_CHAIR_ID,
      GUEST_CHAIR_ID,
      ...salesDesks([]).flatMap((d) => [d.chairId, d.guestChairId]),
    ]
    for (const id of chairs) {
      const chair = PROPS.find((p) => p.id === id)
      expect(chair, id).toBeDefined()
      const approach = approachTilesFor(grid, chair!.rect)
      expect(approach.length, id).toBeGreaterThan(0)
      for (const end of SIDEWALK_ENDS) expect(findPathToAny(grid, end, approach), id).not.toBeNull()
    }
  })

  it('keeps the lounge sofa and every display car reachable around the sales desks', () => {
    const sofa = PROPS.find((p) => p.id === 'lounge-sofa')!
    expect(findPathToAny(grid, SPAWN_TILE, approachTilesFor(grid, sofa.rect))).not.toBeNull()
    for (const [i, car] of PLATFORMS.filter((p) => !p.requires).entries()) {
      const approach = approachTilesFor(grid, car.rect)
      expect(approach.length, `${i}`).toBeGreaterThanOrEqual(4)
      expect(findPathToAny(grid, SPAWN_TILE, approach), `${i}`).not.toBeNull()
    }
  })
})

describe('the parcel east of the lot', () => {
  it('runs the street, sidewalk and fence the full width of the map', () => {
    for (let tx = 0; tx < GRID_WIDTH; tx++) {
      expect(zoneAt(layout, tx, 25), `${tx}`).toBe('sidewalk')
      expect(zoneAt(layout, tx, 28), `${tx}`).toBe('road')
      expect(wallAt(layout, tx, 0), `${tx}`).toBe('fence')
      const gate = OPENINGS.some((o) => tx >= o.tx && tx < o.tx + o.w && o.tz === 24)
      expect(wallAt(layout, tx, 24), `${tx}`).toBe(gate ? null : 'fence')
    }
    expect(SIDEWALK_ENDS.map((t) => t.tx).sort((a, b) => a - b)).toEqual([
      0,
      0,
      GRID_WIDTH - 1,
      GRID_WIDTH - 1,
    ])
  })

  it('is closed off behind its own fence until it is bought', () => {
    for (const [tx, tz] of tiles(PARCEL)) {
      expect(zoneAt(layout, tx, tz), `${tx},${tz}`).toBe('parcel')
      expect(grid.isWalkable(tx, tz), `${tx},${tz}`).toBe(false)
    }
    for (let tz = 0; tz < 25; tz++) {
      expect(wallAt(layout, PARCEL.tx - 1, tz)).toBe('fence')
      expect(wallAt(layout, GRID_WIDTH - 1, tz)).toBe('fence')
    }
    // Nobody can be sent there, so a click on it never searches the whole map.
    expect(findPath(grid, SPAWN_TILE, { tx: PARCEL.tx + 5, tz: 10 })).toBeNull()
  })

  it('has a For Sale sign out front, which comes down once the lot is bought', () => {
    const sign = layout.props.find((p) => p.model === 'forSaleSign')!
    expect(sign).toBeDefined()
    expect(sign.facing).toBe(0)
    for (const [tx, tz] of tiles(sign.rect)) expect(zoneAt(layout, tx, tz)).toBe('parcel')
    expect(buildLayout(['east-lot']).props.some((p) => p.model === 'forSaleSign')).toBe(false)
  })

  it('opens onto the lot once the east lot is bought', () => {
    const open = buildLayout(['east-lot'])
    const g = createGrid(open)
    applyToGrid(g, inventory)
    for (const [tx, tz] of tiles(PARCEL)) {
      expect(zoneAt(open, tx, tz), `${tx},${tz}`).toBe('asphalt')
      expect(g.isWalkable(tx, tz), `${tx},${tz}`).toBe(true)
    }
    for (const [tx, tz] of tiles(PARCEL_GATE)) expect(wallAt(open, tx, tz)).toBeNull()
    // Paved right across, under the fence too, with no strip of grass between the lots.
    for (let tz = PARCEL.tz; tz < PARCEL.tz + PARCEL.h; tz++) {
      expect(zoneAt(open, PARCEL.tx - 1, tz), `${PARCEL.tx - 1},${tz}`).toBe('asphalt')
    }
    const far = { tx: GRID_WIDTH - 2, tz: 3 }
    const path = findPath(g, LOT_ENTRY_TILES[0], far)!
    expect(path).not.toBeNull()
    expect(path.some((t) => tiles(PARCEL_GATE).some(([x, z]) => x === t.tx && z === t.tz))).toBe(
      true,
    )
    // The rest of the dealership is as it was.
    expect(open.props.filter((p) => p.model !== 'forSaleSign')).toEqual(PROPS)
    expect(wallAt(open, PARCEL.tx - 1, 5)).toBe('fence')
  })

  describe('the east lot', () => {
    const open = buildLayout(['east-lot'])
    const east = PARKING_SPACES.filter((sp) => sp.requires === 'east-lot')
    const inside = (r: Rect, outer: Rect) =>
      r.tx >= outer.tx &&
      r.tz >= outer.tz &&
      r.tx + r.w <= outer.tx + outer.w &&
      r.tz + r.h <= outer.tz + outer.h

    it('adds 12 spaces on the parcel, overlapping nothing, clear of the wing and the lane', () => {
      expect(east).toHaveLength(12)
      const seen = new Set<string>()
      for (const sp of PARKING_SPACES) {
        for (const [tx, tz] of tiles(sp.rect)) {
          expect(seen.has(`${tx},${tz}`), `${tx},${tz}`).toBe(false)
          seen.add(`${tx},${tz}`)
        }
      }
      for (const sp of east) {
        expect(inside(sp.rect, PARCEL)).toBe(true)
        // The parcel's north side is for the showroom wing, its east end for a service lane.
        expect(sp.rect.tz).toBeGreaterThan(12)
        expect(sp.rect.tx + sp.rect.w).toBeLessThanOrEqual(GRID_WIDTH - 6)
      }
      expect(spaceOpen(PARKING_SPACES.indexOf(east[0]), [])).toBe(false)
      expect(spaceOpen(PARKING_SPACES.indexOf(east[0]), ['east-lot'])).toBe(true)
      expect(spaceOpen(0, [])).toBe(true)
    })

    it('reaches every car from the lot, with every space full', () => {
      const g = createGrid(open)
      applyToGrid(g, inventory)
      const parked = east.map((sp) => parkedCarRect(sp))
      for (const rect of parked) g.setRectBlocked(rect, true)
      for (const rect of parked) {
        const approach = approachTilesFor(g, rect)
        expect(approach.length).toBeGreaterThan(0)
        expect(findPathToAny(g, LOT_ENTRY_TILES[0], approach)).not.toBeNull()
      }
    })

    it('adds a patrol stop in its aisle, off the parking and the cars', () => {
      const g = createGrid(open)
      const stops = patrolTiles(['east-lot'])
      expect(stops.slice(0, GUARD_PATROL_TILES.length)).toEqual(GUARD_PATROL_TILES)
      const t = stops[stops.length - 1]
      const at = `${t.tx},${t.tz}`
      expect(zoneAt(open, t.tx, t.tz), at).toBe('asphalt')
      expect(findPath(g, LOT_ENTRY_TILES[0], t), at).not.toBeNull()
      expect(east.flatMap((sp) => tiles(sp.rect))).not.toContainEqual([t.tx, t.tz])
      const cars = east.flatMap((sp) => approachTilesFor(g, parkedCarRect(sp)))
      expect(cars, at).not.toContainEqual(t)
    })
  })
})

describe('the showroom wing', () => {
  const wing = buildLayout(['east-lot', 'showroom-wing'])
  const inWing = (t: { tx: number; tz: number }) =>
    t.tx >= WING.tx && t.tx < WING.tx + WING.w && t.tz >= WING.tz && t.tz < WING.tz + WING.h
  /** The wing's grid with every slot full: the opening stock, both wing platforms and every lot space. */
  function fullGrid(l: Layout) {
    const g = createGrid(l)
    applyToGrid(g, inventory)
    for (const p of PLATFORMS) g.setRectBlocked(p.rect, true)
    for (const sp of PARKING_SPACES) g.setRectBlocked(parkedCarRect(sp), true)
    return g
  }
  const g = fullGrid(wing)

  it('stands on the parcel’s north side, against the building, indoors', () => {
    expect(WING.tx).toBe(37)
    expect(WING.tx + WING.w).toBeLessThanOrEqual(49) // the garage corner is east of it
    for (const [tx, tz] of tiles(WING)) {
      expect(zoneAt(wing, tx, tz), `${tx},${tz}`).toBe('showroom')
      expect(isIndoor(wing, tx, tz)).toBe(true)
    }
    // Nothing of it before it's built.
    const lot = buildLayout(['east-lot'])
    expect(zoneAt(lot, 40, 6)).toBe('asphalt')
    expect(wallAt(lot, WING.tx + WING.w - 1, 5)).toBeNull()
    expect(lot.props.some((p) => p.id === 'wing-sofa')).toBe(false)
  })

  it('moves the lounge plant out of the corner the door opens from', () => {
    const plant = (l: Layout) => l.props.find((p) => p.id === 'lounge-plant')!.rect
    expect(plant(layout)).toEqual({ tx: 35, tz: 12, w: 1, h: 1 })
    expect(zoneAt(wing, plant(wing).tx, plant(wing).tz)).toBe('lounge')
    expect(g.isWalkable(35, 12)).toBe(true)
  })

  it('has walls round it, a door from the lounge and a door onto the lot', () => {
    expect(wallAt(wing, 40, WING.tz)).toBe('solid')
    expect(wallAt(wing, WING.tx + WING.w - 1, 6)).toBe('solid')
    expect(wallAt(wing, 42, WING.tz + WING.h - 1)).toBe('glass')
    // The old fence between the lots is gone inside it.
    for (let tz = WING.tz + 1; tz < WING.tz + WING.h - 1; tz++)
      expect(wallAt(wing, 39, tz)).toBeNull()
    const lounge = findPath(g, { tx: 33, tz: 10 }, { tx: 38, tz: 8 })!
    expect(lounge).toContainEqual({ tx: 36, tz: 12 })
    expect(lounge.every((t) => isIndoor(wing, t.tx, t.tz))).toBe(true)
    // With every lounge upgrade in, too.
    const ups = fullGrid(wing)
    for (const r of improvementFootprints(Object.keys(IMPROVEMENTS) as ImprovementId[])) {
      ups.setRectBlocked(r, true)
    }
    expect(findPath(ups, { tx: 33, tz: 10 }, { tx: 38, tz: 8 })).not.toBeNull()
    const outside = findPath(g, { tx: 38, tz: 16 }, { tx: 43, tz: 9 })!
    expect(outside.some((t) => t.tz === 13 && (t.tx === 37 || t.tx === 38))).toBe(true)
    // Customers walk in from the street through either door.
    expect(findPath(g, LOT_ENTRY_TILES[0], { tx: 43, tz: 9 })).not.toBeNull()
    // The building's own doors and walls are as they were.
    expect(wallAt(wing, 36, 5)).toBe('solid')
    expect(wallAt(wing, 39, 14)).toBe('fence')
  })

  it('places its furniture inside it, off walls and without overlapping anything', () => {
    const owner = new Map<string, string>()
    const platforms = PLATFORMS.map((p, i) => ({ id: `platform-${i}`, rect: p.rect, blocks: true }))
    for (const p of [...wing.props, ...platforms]) {
      for (const [tx, tz] of tiles(p.rect)) {
        expect(wallAt(wing, tx, tz), `${p.id} on a wall`).toBeNull()
        if (p.blocks === false) continue
        const key = `${tx},${tz}`
        expect(owner.get(key), `${p.id} overlaps ${owner.get(key)}`).toBeUndefined()
        owner.set(key, p.id)
      }
    }
    const added = wing.props.filter((p) => !PROPS.some((q) => q.id === p.id))
    expect(added.length).toBeGreaterThan(0)
    for (const p of added)
      expect(
        tiles(p.rect).every(([tx, tz]) => inWing({ tx, tz })),
        p.id,
      ).toBe(true)
    for (const p of PLATFORMS.filter((x) => x.requires)) {
      expect(p.requires).toBe('showroom-wing')
      expect(inWing(p.rect)).toBe(true)
    }
  })

  it('adds sales desks 3 and 4, and every chair is reachable with every slot full', () => {
    expect(salesDesks([])).toEqual(SALES_DESKS.slice(0, 2))
    expect(salesDesks(['east-lot', 'showroom-wing'])).toEqual(SALES_DESKS)
    expect(SALES_DESKS).toHaveLength(4)
    const chairs = [
      RECEPTION_CHAIR_ID,
      DESK_CHAIR_ID,
      GUEST_CHAIR_ID,
      ...SALES_DESKS.flatMap((d) => [d.chairId, d.guestChairId]),
    ]
    for (const id of chairs) {
      const chair = wing.props.find((p) => p.id === id)
      expect(chair, id).toBeDefined()
      const approach = approachTilesFor(g, chair!.rect)
      expect(approach.length, id).toBeGreaterThan(0)
      expect(findPathToAny(g, SIDEWALK_ENDS[0], approach), id).not.toBeNull()
    }
  })

  it('reaches every sofa seat and every platform car', () => {
    const sofas = SOFA_IDS.map((id) => wing.props.find((p) => p.id === id)!)
    expect(sofas).toHaveLength(2)
    for (const sofa of sofas) {
      for (let i = 0; i < sofa.rect.w; i++) {
        const seat = { ...sofa.rect, tx: sofa.rect.tx + i, w: 1 }
        const approach = approachTilesFor(g, seat)
        expect(findPathToAny(g, SPAWN_TILE, approach), `${sofa.id} ${i}`).not.toBeNull()
      }
    }
    for (const [i, p] of PLATFORMS.entries()) {
      const approach = approachTilesFor(g, p.rect)
      expect(approach.length, `${i}`).toBeGreaterThanOrEqual(4)
      expect(findPathToAny(g, SPAWN_TILE, approach), `${i}`).not.toBeNull()
    }
  })

  it('leaves the east lot’s cars reachable', () => {
    for (const sp of PARKING_SPACES) {
      const approach = approachTilesFor(g, parkedCarRect(sp))
      expect(findPathToAny(g, LOT_ENTRY_TILES[0], approach)).not.toBeNull()
    }
  })
})

describe('the service garage', () => {
  const ground = ['east-lot', 'showroom-wing', 'service-bay'] as const
  const built = buildLayout([...ground])
  const inGarage = (tx: number, tz: number) =>
    tx >= GARAGE.tx && tx < GARAGE.tx + GARAGE.w && tz >= GARAGE.tz && tz < GARAGE.tz + GARAGE.h
  /** Every slot full, as in the wing's tests. */
  function fullGrid(l: Layout) {
    const g = createGrid(l)
    applyToGrid(g, inventory)
    for (const p of PLATFORMS) g.setRectBlocked(p.rect, true)
    for (const sp of PARKING_SPACES) g.setRectBlocked(parkedCarRect(sp), true)
    return g
  }
  const g = fullGrid(built)

  it('stands in the parcel’s north-east corner, clear of the wing, the spaces and the lane', () => {
    for (const [tx, tz] of tiles(GARAGE)) {
      expect(tx >= WING.tx + WING.w, `${tx},${tz}`).toBe(true)
      expect(tx < GRID_WIDTH - 1 && tz > 0, `${tx},${tz}`).toBe(true)
    }
    for (const sp of PARKING_SPACES) {
      expect(tiles(sp.rect).some(([tx, tz]) => inGarage(tx, tz))).toBe(false)
    }
    for (const sp of CUSTOMER_PARKING) {
      expect(tiles(sp.rect).some(([tx, tz]) => inGarage(tx, tz))).toBe(false)
    }
    // Room in front of it for the service drive.
    for (let tx = GARAGE.tx; tx < GARAGE.tx + GARAGE.w; tx++) {
      expect(g.isWalkable(tx, GARAGE.tz + GARAGE.h), `${tx}`).toBe(true)
    }
    expect(g.isWalkable(GARAGE_SIGN.tx, GARAGE_SIGN.tz)).toBe(false)
  })

  it('is nothing until it is built, and needs the east lot', () => {
    for (const l of [buildLayout(['east-lot']), buildLayout(['service-bay'])]) {
      expect(zoneAt(l, 52, 4)).not.toBe('garage')
      expect(wallAt(l, GARAGE.tx, 4)).toBeNull()
      expect(l.props.some((p) => p.id === SERVICE_CHAIR_ID)).toBe(false)
      expect(l.blocked).toEqual([])
    }
  })

  it('is indoors, walled, with a door per bay and one for clients', () => {
    expect(zoneAt(built, 52, 4)).toBe('garage')
    expect(isIndoor(built, 52, 4)).toBe(true)
    expect(wallAt(built, GARAGE.tx, 4)).toBe('solid')
    expect(wallAt(built, 52, GARAGE.tz)).toBe('solid')
    expect(wallAt(built, 55, GARAGE.tz + GARAGE.h - 1)).toBe('solid')
    for (const bay of SERVICE_BAYS) {
      for (const [tx, tz] of tiles(bay.door)) expect(wallAt(built, tx, tz)).toBeNull()
      // A car drives straight in through its door onto the lift.
      expect(bay.door.tx).toBe(bay.rect.tx)
      expect(bay.door.w).toBe(bay.rect.w)
    }
  })

  it('blocks the lifts, and reaches each bay, the counter and every chair from the street', () => {
    expect(serviceBays([...ground])).toBe(SERVICE_BAYS)
    expect(serviceBays(['east-lot'])).toEqual([])
    for (const bay of SERVICE_BAYS) {
      for (const [tx, tz] of tiles(bay.rect)) expect(g.isWalkable(tx, tz)).toBe(false)
      const approach = approachTilesFor(g, bay.rect)
      expect(approach.length).toBeGreaterThan(2)
      expect(findPathToAny(g, SIDEWALK_ENDS[2], approach)).not.toBeNull()
    }
    for (const id of [SERVICE_CHAIR_ID, ...SERVICE_WAIT_IDS]) {
      const chair = built.props.find((p) => p.id === id)!
      expect(chair, id).toBeDefined()
      const approach = approachTilesFor(g, chair.rect)
      expect(findPathToAny(g, SIDEWALK_ENDS[2], approach), id).not.toBeNull()
    }
    for (const t of GARAGE_STANDBY_TILES) {
      expect(inGarage(t.tx, t.tz)).toBe(true)
      expect(findPath(g, SIDEWALK_ENDS[2], t), `${t.tx},${t.tz}`).not.toBeNull()
    }
  })

  it('places its furniture inside it, off walls and without overlapping anything', () => {
    const added = built.props.filter((p) => p.id.startsWith('service-'))
    expect(added.length).toBe(3 + SERVICE_WAIT_IDS.length)
    const owner = new Map<string, string>()
    const lifts = SERVICE_BAYS.map((b, i) => ({ id: `lift-${i}`, rect: b.rect, blocks: true }))
    for (const p of [...built.props, ...lifts]) {
      for (const [tx, tz] of tiles(p.rect)) {
        expect(wallAt(built, tx, tz), `${p.id} on a wall`).toBeNull()
        if (p.blocks === false) continue
        const key = `${tx},${tz}`
        expect(owner.get(key), `${p.id} overlaps ${owner.get(key)}`).toBeUndefined()
        owner.set(key, p.id)
      }
    }
    for (const p of added)
      expect(
        tiles(p.rect).every(([tx, tz]) => inGarage(tx, tz)),
        p.id,
      ).toBe(true)
  })

  it('leaves the lot’s and the wing’s cars and chairs reachable', () => {
    for (const sp of PARKING_SPACES) {
      const approach = approachTilesFor(g, parkedCarRect(sp))
      expect(findPathToAny(g, LOT_ENTRY_TILES[0], approach)).not.toBeNull()
    }
    for (const d of SALES_DESKS) {
      const chair = built.props.find((p) => p.id === d.chairId)!
      expect(findPathToAny(g, SPAWN_TILE, approachTilesFor(g, chair.rect))).not.toBeNull()
    }
  })
})
