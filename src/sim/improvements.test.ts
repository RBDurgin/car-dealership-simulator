import { describe, expect, it } from 'vitest'
import {
  buyImprovement,
  effectsOf,
  IMPROVEMENT_FOOTPRINTS,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  improvementBlocker,
  improvementFootprints,
  improvementProps,
  installed,
  MAX_ACCEPT_BONUS,
  MAX_EXPECT_CUT,
  MAX_PATIENCE_SAVED,
  NO_EFFECTS,
  slotTier,
  swappedModel,
} from './improvements'
import { applyToGrid, buildInventory, carProp } from './inventory'
import { approachTilesFor, buildInteractables, pathToInteractable } from './interactables'
import {
  buildLayout,
  DESK_CHAIR_ID,
  GUEST_CHAIR_ID,
  OFFICE_COMPUTER_ID,
  createGrid,
  LOT_ENTRY_TILES,
  PARKING_SPACES,
  parkedCarRect,
  PROPS,
  SALES_DESKS,
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
    expect(effectsOf(['big-sign', 'tube-man'])).toEqual({
      ...NO_EFFECTS,
      walkInChance: 0.1,
      passersBy: 4,
    })
    expect(effectsOf(['polished-floor', 'lounge-tv'])).toEqual({
      ...NO_EFFECTS,
      expectCut: 0.12,
      acceptBonus: 0.02,
      patienceSaved: 0.15,
    })
  })

  it('caps the indoor effects with everything up, short of ending haggling or patience', () => {
    const all = effectsOf(IMPROVEMENT_IDS)
    expect(all.expectCut).toBeLessThanOrEqual(MAX_EXPECT_CUT)
    expect(all.acceptBonus).toBeLessThanOrEqual(MAX_ACCEPT_BONUS)
    expect(all.patienceSaved).toBeLessThanOrEqual(MAX_PATIENCE_SAVED)
    expect(MAX_EXPECT_CUT).toBeLessThan(1)
    expect(MAX_PATIENCE_SAVED).toBeLessThan(1)
  })

  it('swaps the sofa and adds the lounge props only once they’re up', () => {
    expect(swappedModel([], 'lounge-sofa')).toBeNull()
    expect(swappedModel(['designer-sofa'], 'lounge-sofa')).toBe('loungeDesignSofa')
    expect(swappedModel(['designer-sofa'], 'sign')).toBeNull()
    expect(improvementProps(['big-sign'])).toEqual([])
    expect(improvementProps(['lounge-tv', 'coffee-bar']).map((p) => p.id)).toEqual([
      'lounge-tv-cabinet',
      'lounge-tv',
      'coffee-bar-1',
      'coffee-bar-2',
      'coffee-stool-1',
      'coffee-stool-2',
    ])
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
  const outdoor = Object.values(IMPROVEMENT_FOOTPRINTS) as Rect[]
  const indoor = improvementProps(IMPROVEMENT_IDS)
  for (const rect of improvementFootprints(IMPROVEMENT_IDS)) grid.setRectBlocked(rect, true)
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

  it('only the tube man and the blocking lounge props need ground of their own', () => {
    expect(improvementFootprints(['big-sign', 'pylon-sign', 'designer-sofa'])).toEqual([])
    expect(improvementFootprints(['polished-floor', 'spotlights', 'turntables'])).toEqual([])
    expect(improvementFootprints(['tube-man'])).toEqual([IMPROVEMENT_FOOTPRINTS['tube-man']])
    expect(improvementFootprints(['lounge-tv'])).toEqual([{ tx: 31, tz: 9, w: 2, h: 1 }])
  })

  it('put the lounge props in the lounge, clear of the fixed props and each other', () => {
    const blocking = indoor.filter((p) => p.blocks !== false)
    const own = blocking.flatMap((p) => tiles(p.rect))
    expect(new Set(own).size).toBe(own.length)
    for (const p of indoor) {
      for (const key of tiles(p.rect)) {
        const [tx, tz] = key.split(',').map(Number)
        expect(zoneAt(layout, tx, tz), p.id).toBe('lounge')
      }
    }
    for (const key of own) expect(taken.has(key), key).toBe(false)
  })

  it('leave the desk, the computer, the coffee machine and every seat reachable', () => {
    const its = buildInteractables(grid, PROPS)
    for (const id of [DESK_CHAIR_ID, OFFICE_COMPUTER_ID, 'coffee-machine']) {
      expect(pathToInteractable(grid, SPAWN_TILE, its.get(id)!), id).not.toBeNull()
    }
    const sofa = PROPS.find((p) => p.id === 'lounge-sofa')!
    const seats = [
      ...[GUEST_CHAIR_ID, ...SALES_DESKS.map((d) => d.guestChairId)].map(
        (id) => PROPS.find((p) => p.id === id)!.rect,
      ),
      ...Array.from({ length: sofa.rect.w }, (_, i) => ({
        ...sofa.rect,
        tx: sofa.rect.tx + i,
        w: 1,
      })),
    ]
    for (const seat of seats) {
      expect(findPathToAny(grid, SPAWN_TILE, approachTilesFor(grid, seat))).not.toBeNull()
    }
  })

  it('stand on the lot, clear of props, parking spaces, the entry and the spawn', () => {
    for (const rect of outdoor) {
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
    // Spaces on ground that isn't bought yet are checked in layout.test.ts.
    for (const space of PARKING_SPACES.filter((s) => !s.requires)) {
      const car = carProp({ ...inventory[0], rect: parkedCarRect(space) })
      const approach = approachTilesFor(grid, car.rect)
      expect(approach.length).toBeGreaterThan(0)
      expect(findPathToAny(grid, LOT_ENTRY_TILES[0], approach)).not.toBeNull()
    }
  })
})
