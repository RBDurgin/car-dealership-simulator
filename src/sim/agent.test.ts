import { describe, expect, it } from 'vitest'
import { angleDiff, dampAngle, headingTo, stepAlongPath, toWaypoints } from './agent'
import { Grid } from './grid'
import { findPath } from './pathfinding'

describe('angles', () => {
  it('takes the short way round', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2)
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
  })

  it('eases toward the target without overshooting', () => {
    const a = dampAngle(0, 1, 10, 0.016)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(1)
    expect(dampAngle(0, 1, 10, 100)).toBeCloseTo(1)
  })

  it('faces +z at heading 0 and +x at π/2', () => {
    expect(headingTo({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0)
    expect(headingTo({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2)
  })
})

describe('stepAlongPath', () => {
  const grid = new Grid(10, 10)

  it('moves toward the next waypoint at speed', () => {
    const wps = [{ x: 3, z: 0 }]
    const s = stepAlongPath(grid, { x: 0, z: 0 }, wps, 2, 0.5)
    expect(s.x).toBeCloseTo(1)
    expect(s.z).toBeCloseTo(0)
    expect(s.moved).toBeCloseTo(1)
    expect(wps).toHaveLength(1)
  })

  it('shifts off a waypoint once reached', () => {
    const wps = [
      { x: 0.5, z: 0 },
      { x: 2, z: 0 },
    ]
    const s = stepAlongPath(grid, { x: 0, z: 0 }, wps, 2, 0.5)
    expect(s.x).toBeCloseTo(0.5)
    expect(wps).toEqual([{ x: 2, z: 0 }])
  })

  it('does nothing without waypoints', () => {
    const s = stepAlongPath(grid, { x: 1, z: 1 }, [], 2, 0.5)
    expect(s).toEqual({ x: 1, z: 1, dx: 0, dz: 0, moved: 0 })
  })

  it('drops the path when pinned against a wall', () => {
    const walled = new Grid(10, 10)
    walled.blockRect(6, 0, 1, 10) // world x in [1, 2]
    const wps = [{ x: 3.5, z: 0.5 }]
    // Already touching the wall and heading straight into it.
    const s = stepAlongPath(walled, { x: 0.7, z: 0.5 }, wps, 2, 0.1)
    expect(s.moved).toBe(0)
    expect(wps).toHaveLength(0)
  })

  it('follows a smoothed path around an obstacle to the goal', () => {
    const g = new Grid(10, 10)
    g.blockRect(4, 0, 1, 8)
    const tiles = findPath(g, { tx: 1, tz: 1 }, { tx: 8, tz: 1 })!
    let pos = g.tileToWorld(1, 1)
    const wps = toWaypoints(g, tiles, pos)
    for (let i = 0; i < 1000 && wps.length > 0; i++) {
      const s = stepAlongPath(g, pos, wps, 2, 0.05)
      pos = { x: s.x, z: s.z }
    }
    const goal = g.tileToWorld(8, 1)
    expect(pos.x).toBeCloseTo(goal.x)
    expect(pos.z).toBeCloseTo(goal.z)
  })
})
