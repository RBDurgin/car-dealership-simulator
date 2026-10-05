import { describe, expect, it } from 'vitest'
import { CUSTOMER_VARIANTS } from './characters'
import { CLOSE_MINUTE, OPEN_MINUTE } from './clock'
import { buildLayout, createGrid, LOT_ENTRY_TILES, SIDEWALK_ENDS } from './layout'
import {
  PEDESTRIANS_PER_DAY,
  PEDESTRIAN_SPEED,
  planPedestrians,
  takeDuePedestrians,
  turnInTile,
  WALK_IN_CHANCE,
} from './pedestrians'
import { findPathToAny } from './pathfinding'
import { createRng } from './rng'

describe('planPedestrians', () => {
  const days = Array.from({ length: 100 }, (_, i) => planPedestrians(createRng(i), i + 1))

  it('sends a sorted stream of passers-by along the sidewalk during business hours', () => {
    for (const plan of days) {
      expect(plan.length).toBeGreaterThanOrEqual(PEDESTRIANS_PER_DAY.min)
      expect(plan.length).toBeLessThanOrEqual(PEDESTRIANS_PER_DAY.max)
      expect(plan.map((p) => p.minute)).toEqual(plan.map((p) => p.minute).sort((a, b) => a - b))
      expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length)
      for (const p of plan) {
        expect(p.minute).toBeGreaterThanOrEqual(OPEN_MINUTE)
        expect(p.minute).toBeLessThanOrEqual(CLOSE_MINUTE)
        expect(CUSTOMER_VARIANTS).toContain(p.variant)
        expect(SIDEWALK_ENDS).toContainEqual(p.from)
        expect(SIDEWALK_ENDS).toContainEqual(p.to)
        // End to end, keeping to their lane.
        expect(p.to.tz).toBe(p.from.tz)
        expect(p.to.tx).not.toBe(p.from.tx)
        expect(p.speed).toBeGreaterThanOrEqual(PEDESTRIAN_SPEED.min)
        expect(p.speed).toBeLessThanOrEqual(PEDESTRIAN_SPEED.max)
      }
    }
  })

  it('has about one in seven wander in', () => {
    const all = days.flat()
    const share = all.filter((p) => p.walkIn).length / all.length
    expect(share).toBeGreaterThan(WALK_IN_CHANCE - 0.04)
    expect(share).toBeLessThan(WALK_IN_CHANCE + 0.04)
  })

  it('is deterministic for a seed', () => {
    expect(planPedestrians(createRng(4), 2)).toEqual(planPedestrians(createRng(4), 2))
  })
})

describe('turnInTile', () => {
  const grid = createGrid(buildLayout())

  it('is on their lane, in line with a lot entry, and leads into the lot', () => {
    for (const from of SIDEWALK_ENDS) {
      const t = turnInTile({ from })
      expect(t.tz).toBe(from.tz)
      expect(LOT_ENTRY_TILES.map((e) => e.tx)).toContain(t.tx)
      expect(grid.isWalkable(t.tx, t.tz)).toBe(true)
      expect(findPathToAny(grid, t, LOT_ENTRY_TILES)).not.toBeNull()
    }
  })
})

describe('takeDuePedestrians', () => {
  const plan = planPedestrians(createRng(9), 1)

  it('releases each passer-by once their time comes', () => {
    const first = takeDuePedestrians(plan, 0, plan[0].minute)
    expect(first.due[0]).toBe(plan[0])
    expect(takeDuePedestrians(plan, first.next, plan[0].minute).due).toEqual([])
    const rest = takeDuePedestrians(plan, first.next, CLOSE_MINUTE)
    expect(first.due.length + rest.due.length).toBe(plan.length)
    expect(rest.next).toBe(plan.length)
  })
})
