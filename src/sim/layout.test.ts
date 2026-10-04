import { describe, expect, it } from 'vitest'
import {
  buildLayout,
  createGrid,
  OPENINGS,
  PARKING_SPACES,
  parkedCarRect,
  SPAWN_TILE,
  wallAt,
  zoneAt,
  type Rect,
} from './layout'
import { findPath } from './pathfinding'

const layout = buildLayout()
const grid = createGrid(layout)

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

  it('places props in bounds, off walls and without overlapping', () => {
    const owner = new Map<string, string>()
    for (const p of layout.props) {
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
})
