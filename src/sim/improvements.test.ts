import { describe, expect, it } from 'vitest'
import {
  buyImprovement,
  effectsOf,
  IMPROVEMENT_FOOTPRINTS,
  IMPROVEMENTS,
  improvementBlocker,
  improvementFootprints,
  installed,
  NO_EFFECTS,
  slotTier,
} from './improvements'
import { applyToGrid, buildInventory, carProp } from './inventory'
import { approachTilesFor } from './interactables'
import {
  buildLayout,
  createGrid,
  LOT_ENTRY_TILES,
  PARKING_SPACES,
  parkedCarRect,
  PROPS,
  SIDEWALK_ENDS,
  SPAWN_TILE,
  zoneAt,
  type Rect,
} from './layout'
import { findPath, findPathToAny } from './pathfinding'
import { turnInTile } from './pedestrians'
import { createRng } from './rng'

describe('improvement effects', () => {
  it('adds nothing with nothing up', () => {
    expect(effectsOf([])).toEqual(NO_EFFECTS)
  })

  it('sums the slots', () => {
    expect(effectsOf(['big-sign', 'tube-man'])).toEqual({ walkInChance: 0.1, passersBy: 4 })
  })

  it('counts only the top tier of a slot', () => {
    expect(slotTier(['big-sign', 'pylon-sign'], 'sign')).toBe(2)
    expect(slotTier(['tube-man'], 'sign')).toBe(0)
    expect(effectsOf(['big-sign', 'pylon-sign'])).toEqual(effectsOf(['pylon-sign']))
    expect(effectsOf(['big-sign', 'pylon-sign']).walkInChance).toBe(
      IMPROVEMENTS['pylon-sign'].effects.walkInChance,
    )
  })

  it('puts up what was bought before today', () => {
    const owned = [
      { id: 'big-sign' as const, day: 2 },
      { id: 'tube-man' as const, day: 4 },
    ]
    expect(installed(owned, 2)).toEqual([])
    expect(installed(owned, 3)).toEqual(['big-sign'])
    expect(installed(owned, 5)).toEqual(['big-sign', 'tube-man'])
  })
})

describe('buying improvements', () => {
  const book = { cash: 20_000, improvements: [] }

  it('pays from cash and records the day', () => {
    const r = buyImprovement(book, 'tube-man', 3)
    expect(r).toEqual({
      ok: true,
      cash: 20_000 - IMPROVEMENTS['tube-man'].cost,
      improvements: [{ id: 'tube-man', day: 3 }],
    })
  })

  it('refuses one it can’t pay for, one already bought, or a tier without the one below', () => {
    expect(improvementBlocker({ ...book, cash: 100 }, 'tube-man')).toBe('Not enough cash for that.')
    expect(
      improvementBlocker({ ...book, improvements: [{ id: 'tube-man', day: 1 }] }, 'tube-man'),
    ).toBe('Already bought.')
    expect(improvementBlocker(book, 'pylon-sign')).toBe('Needs the bigger sign first.')
    const withSign = { ...book, improvements: [{ id: 'big-sign' as const, day: 1 }] }
    expect(improvementBlocker(withSign, 'pylon-sign')).toBeNull()
    expect(buyImprovement({ ...book, cash: 0 }, 'big-sign', 1).ok).toBe(false)
  })
})

describe('improvement footprints', () => {
  const layout = buildLayout()
  const inventory = buildInventory(createRng(1))
  const grid = createGrid(layout)
  applyToGrid(grid, inventory)
  const footprints = Object.values(IMPROVEMENT_FOOTPRINTS) as Rect[]
  for (const rect of improvementFootprints(['big-sign', 'pylon-sign', 'tube-man'])) {
    grid.setRectBlocked(rect, true)
  }
  const tiles = (r: Rect) =>
    Array.from({ length: r.w * r.h }, (_, i) => `${r.tx + (i % r.w)},${r.tz + Math.floor(i / r.w)}`)
  const taken = new Set(
    [
      ...PROPS.map((p) => p.rect),
      ...PARKING_SPACES.map((s) => s.rect),
      ...LOT_ENTRY_TILES.map((t) => ({ ...t, w: 1, h: 1 })),
      { ...SPAWN_TILE, w: 1, h: 1 },
    ].flatMap(tiles),
  )

  it('only the tube man needs ground of its own', () => {
    expect(improvementFootprints(['big-sign', 'pylon-sign'])).toEqual([])
    expect(improvementFootprints(['tube-man'])).toEqual([IMPROVEMENT_FOOTPRINTS['tube-man']])
  })

  it('stand on the lot, clear of props, parking spaces, the entry and the spawn', () => {
    for (const rect of footprints) {
      for (const key of tiles(rect)) {
        const [tx, tz] = key.split(',').map(Number)
        expect(zoneAt(layout, tx, tz)).toBe('asphalt')
        expect(taken.has(key), key).toBe(false)
      }
    }
  })

  it('leave the way in from the street and every parked car reachable', () => {
    for (const end of SIDEWALK_ENDS) {
      expect(findPath(grid, end, turnInTile({ from: end }))).not.toBeNull()
      for (const entry of LOT_ENTRY_TILES) expect(findPath(grid, end, entry)).not.toBeNull()
    }
    for (const space of PARKING_SPACES) {
      const car = carProp({ ...inventory[0], rect: parkedCarRect(space) })
      const approach = approachTilesFor(grid, car.rect)
      expect(approach.length).toBeGreaterThan(0)
      expect(findPathToAny(grid, LOT_ENTRY_TILES[0], approach)).not.toBeNull()
    }
  })
})
