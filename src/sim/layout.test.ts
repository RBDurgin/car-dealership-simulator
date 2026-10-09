import { describe, expect, it } from 'vitest'
import {
  buildLayout,
  createGrid,
  CUSTOMER_PARKING,
  DESK_CHAIR_ID,
  DISPLAY_CARS,
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
  PORTER_STANDBY_TILES,
  PROPS,
  RECEPTION_CHAIR_ID,
  SALES_DESKS,
  SIDEWALK_ENDS,
  SPAWN_TILE,
  wallAt,
  zoneAt,
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
      ...SALES_DESKS.flatMap((d) => [d.chairId, d.guestChairId]),
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
    for (const car of DISPLAY_CARS) {
      const approach = approachTilesFor(grid, car.rect)
      expect(approach.length, car.model).toBeGreaterThanOrEqual(4)
      expect(findPathToAny(grid, SPAWN_TILE, approach), car.model).not.toBeNull()
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
})
