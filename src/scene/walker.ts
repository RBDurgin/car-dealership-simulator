import type { Group } from 'three'
import { dampAngle, headingTo, stepAlongPath, toWaypoints } from '../sim/agent'
import { SEAT_HEIGHT, type CharacterAnim } from '../sim/characters'
import type { Tile, Vec2 } from '../sim/grid'
import type { Prop } from '../sim/layout'
import { findPathToAny } from '../sim/pathfinding'
import { grid, rectBounds } from './runtime'

/**
 * The body of anyone walking around the world under the game's control
 * (customers, staff): position, heading, path and seat. Shared by the scene
 * components that move them; each extends it with its own bookkeeping.
 */
export interface Walker {
  pos: Vec2
  heading: number
  anim: { current: CharacterAnim }
  waypoints: Vec2[]
  /** What to turn toward when standing still. */
  faceTo: Vec2 | null
  /** No path to the current goal. */
  unreachable: boolean
  /** Sitting on a chair; `stand` is where they got on from. */
  seat: { stand: Vec2 } | null
}

export const TURN_RATE = 10
/** Movement is integrated in steps no longer than this, so a sped-up clock stays stable. */
export const MAX_STEP_S = 0.05
/**
 * Real seconds per frame at most, before the dev time scale. Matches GameClock so
 * game-minute timers and walking (real seconds) keep pace at a low frame rate.
 */
const MAX_FRAME_S = 0.25
/** How close to a chair a walker must get before sitting down on it. */
export const SIT_REACH = 1.6

/** A new walker standing at `tile`, facing `heading`. */
export function createWalker(tile: Tile, heading: number): Walker {
  return {
    pos: grid.tileToWorld(tile.tx, tile.tz),
    heading,
    anim: { current: 'idle' },
    waypoints: [],
    faceTo: null,
    unreachable: false,
    seat: null,
  }
}

/** Heading that walks into the lot from a sidewalk end. */
export function inwardHeading(tile: Tile): number {
  return tile.tx === 0 ? Math.PI / 2 : -Math.PI / 2
}

/** This frame's real seconds (clamped) and game-speed seconds. */
export function frameSeconds(rawDelta: number, timeScale: number) {
  const realSeconds = Math.min(rawDelta, MAX_FRAME_S)
  return { realSeconds, seconds: realSeconds * timeScale }
}

/**
 * Plans a path to the first reachable of `goals`, trying `goals[0]` alone first
 * (so a randomly picked goal wins when it's reachable). Flags `unreachable` if none is.
 */
export function pathTo(w: Walker, goals: Tile[], preferFirst = false): void {
  const start = grid.worldToTile(w.pos.x, w.pos.z)
  const tiles =
    (preferFirst ? findPathToAny(grid, start, goals.slice(0, 1)) : null) ??
    findPathToAny(grid, start, goals)
  w.waypoints = tiles ? toWaypoints(grid, tiles, w.pos) : []
  w.unreachable = !tiles
}

/** Walks along the path for `seconds` in small substeps. Returns the distance and direction. */
export function moveAlong(w: Walker, speed: number, seconds: number) {
  let moved = 0
  let dx = 0
  let dz = 0
  for (let left = seconds; left > 1e-9 && w.waypoints.length > 0; left -= MAX_STEP_S) {
    const s = stepAlongPath(grid, w.pos, w.waypoints, speed, Math.min(left, MAX_STEP_S))
    w.pos.x = s.x
    w.pos.z = s.z
    moved += s.moved
    dx += s.dx
    dz += s.dz
  }
  return { moved, dx, dz }
}

/**
 * Walks along the path, turns to face the way they're going (or `faceTo` once
 * stopped) and picks walk or idle. Returns true while still moving.
 */
export function walk(w: Walker, speed: number, seconds: number, faceTo: Vec2 | null): boolean {
  const turnDt = Math.min(seconds, MAX_STEP_S)
  const { moved, dx, dz } = moveAlong(w, speed, seconds)
  const moving = moved > 1e-6
  if (moving) w.heading = dampAngle(w.heading, Math.atan2(dx, dz), TURN_RATE, turnDt)
  else if (faceTo) turnToward(w, faceTo, seconds)
  w.anim.current = moving ? 'walk' : 'idle'
  return moving
}

export function turnToward(w: Walker, target: Vec2, seconds: number): void {
  w.heading = dampAngle(
    w.heading,
    headingTo(w.pos, target),
    TURN_RATE,
    Math.min(seconds, MAX_STEP_S),
  )
}

/** Sits on `chair` if they're within reach of it. Returns whether they sat. */
export function sitOn(w: Walker, chair: Prop): boolean {
  if (w.seat) return true
  const c = rectBounds(chair.rect)
  if (Math.hypot(c.x - w.pos.x, c.z - w.pos.z) > SIT_REACH) return false
  w.seat = { stand: { x: w.pos.x, z: w.pos.z } }
  w.pos.x = c.x
  w.pos.z = c.z
  w.heading = (chair.facing * Math.PI) / 2
  w.waypoints = []
  return true
}

/** Gets up off their chair, back to where they got on from. */
export function standUp(w: Walker): void {
  if (!w.seat) return
  w.pos.x = w.seat.stand.x
  w.pos.z = w.seat.stand.z
  w.seat = null
}

/** Copies walkers' positions and headings onto their scene groups. */
export function syncGroups(groups: Map<string, Group>, walkers: Map<string, Walker>): void {
  for (const [id, g] of groups) {
    const w = walkers.get(id)
    if (!w) continue
    g.position.set(w.pos.x, w.seat ? SEAT_HEIGHT : 0, w.pos.z)
    g.rotation.y = w.heading
  }
}
