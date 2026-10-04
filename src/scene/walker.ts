import type { Group } from 'three'
import { dampAngle, headingTo, toWaypoints } from '../sim/agent'
import { SEAT_HEIGHT, type CharacterAnim } from '../sim/characters'
import {
  createStuckGuard,
  crowdStep,
  freeTiles,
  occupancy,
  occupiedCost,
  rearm,
  watchProgress,
  type StuckGuard,
} from '../sim/crowd'
import type { Tile, Vec2 } from '../sim/grid'
import type { Prop } from '../sim/layout'
import { findPathToAny } from '../sim/pathfinding'
import { crowdAgents, grid, rectBounds, reservations } from './runtime'

/**
 * The body of anyone walking around the world under the game's control
 * (customers, staff): position, heading, path and seat. Shared by the scene
 * components that move them; each extends it with its own bookkeeping.
 */
export interface Walker {
  /** The customer's or employee's id, which is also their id in the crowd. */
  id: string
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
  stuck: StuckGuard
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
export function createWalker(id: string, tile: Tile, heading: number): Walker {
  return {
    id,
    pos: grid.tileToWorld(tile.tx, tile.tz),
    heading,
    anim: { current: 'idle' },
    waypoints: [],
    faceTo: null,
    unreachable: false,
    seat: null,
    stuck: createStuckGuard(),
  }
}

/** Gives up a walker's claimed goal tile, when they leave the world. */
export function releaseWalker(id: string): void {
  reservations.release(id)
}

/** A* step costs that steer `id` around everyone else standing in the world. */
export function crowdCost(id: string) {
  return occupiedCost(occupancy(grid, crowdAgents(), id))
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
 * (so a randomly picked goal wins when it's reachable). Goals nobody else has
 * claimed come first; the one picked is claimed, so the next walker goes
 * elsewhere. The path steers around people. Flags `unreachable` if no goal is reachable.
 */
export function pathTo(w: Walker, goals: Tile[], preferFirst = false): void {
  const start = grid.worldToTile(w.pos.x, w.pos.z)
  const cost = crowdCost(w.id)
  const find = (ts: Tile[]) => (ts.length > 0 ? findPathToAny(grid, start, ts, cost) : null)
  const free = freeTiles(grid, reservations, goals, w.id)
  const tiles =
    (preferFirst ? find(free.slice(0, 1)) : null) ??
    find(free) ??
    (preferFirst ? find(goals.slice(0, 1)) : null) ??
    find(goals)
  w.waypoints = tiles ? toWaypoints(grid, tiles, w.pos) : []
  w.unreachable = !tiles
  if (tiles) {
    const goal = tiles[tiles.length - 1]
    reservations.reserve(grid.index(goal.tx, goal.tz), w.id)
  } else {
    reservations.release(w.id)
  }
}

/** Stalled behind someone: a fresh path to the same goal, around whoever is in the way. */
function replan(w: Walker): void {
  const last = w.waypoints[w.waypoints.length - 1]
  if (!last) return
  const tiles = findPathToAny(
    grid,
    grid.worldToTile(w.pos.x, w.pos.z),
    [grid.worldToTile(last.x, last.z)],
    crowdCost(w.id),
  )
  if (!tiles) return
  w.waypoints = toWaypoints(grid, tiles, w.pos)
  rearm(w.stuck, w.waypoints)
}

/**
 * Walks along the path for `seconds` in small substeps, kept apart from the
 * crowd. Walkers stood still get nudged too, so people spread out. Returns the
 * distance walked (pushes not included) and its direction.
 */
export function moveAlong(w: Walker, speed: number, seconds: number) {
  let moved = 0
  let dx = 0
  let dz = 0
  const push = !w.seat
  if (!push && w.waypoints.length === 0) return { moved, dx, dz }
  const neighbours = crowdAgents()
  for (let left = seconds; left > 1e-9; left -= MAX_STEP_S) {
    const dt = Math.min(left, MAX_STEP_S)
    const s = crowdStep(grid, w, w.waypoints, speed, dt, neighbours, push && !w.stuck.ghost)
    moved += s.moved
    dx += s.dx
    dz += s.dz
    if (!push && w.waypoints.length === 0) break
  }
  if (watchProgress(w.stuck, w.pos, w.waypoints, seconds) === 'replan') replan(w)
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
