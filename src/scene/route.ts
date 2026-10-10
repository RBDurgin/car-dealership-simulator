import { dampAngle } from '../sim/agent'
import { blockedAhead, routeLength, type Leg } from '../sim/driving'
import type { Vec2 } from '../sim/grid'
import { MAX_STEP_S } from './walker'

/** How quickly a vehicle turns to face where it's going. */
const STEER_RATE = 8
/** Game seconds a vehicle waits for someone in the way before edging through anyway. */
const GIVE_UP_SECONDS = 4
/** And how long it then ignores who's in front, to get clear. */
const PUSH_ON_SECONDS = 1.5

/** A car or bike following a fixed route in world space. Lives in scene code, never in the store. */
export interface RouteMover {
  /** The route being driven, in world space, and how far along it the vehicle is. */
  legs: Leg[]
  leg: number
  next: number
  /** Shared with `runtime.vehiclePos`. */
  at: { pos: Vec2; heading: number; moving: boolean }
  speed: number
  /** Game seconds held up by someone in the way, and left to push on regardless. */
  waited: number
  pushOn: number
}

export interface Handling {
  /** Top speed on this leg, here (tiles per game second). */
  limit: (leg: Leg, pos: Vec2) => number
  /** Speeding up and braking, in tiles per second per second. */
  accel: number
  brake: number
  /** Anyone it should stop for. Only asked while it isn't pushing on. */
  obstacles: () => Iterable<Vec2>
}

/** Starts `m` along `legs` (in world space) from the top, at a standstill. */
export function startRoute(m: RouteMover, legs: Leg[]): void {
  m.legs = legs
  m.leg = 0
  m.next = 1
  m.speed = 0
  m.waited = 0
  m.pushOn = 0
  m.at.moving = true
}

/** Distance left to the end of the current leg, where the vehicle stops (or turns about). */
function legLeft(m: RouteMover): number {
  const { points } = m.legs[m.leg]
  return routeLength([m.at.pos, ...points.slice(m.next)])
}

/**
 * Drives along the route for `seconds`: speeds up to the limit, brakes to stop
 * at each leg's end, waits for anyone in front (pushing on after a while so it
 * can't be stuck for good), and steers to face the way it's going (away from
 * it, backing up). Returns true once the route is done.
 */
export function followRoute(m: RouteMover, seconds: number, h: Handling): boolean {
  if (m.leg >= m.legs.length) return true
  const leg = m.legs[m.leg]
  const target = leg.points[m.next]
  const dir = { x: target.x - m.at.pos.x, z: target.z - m.at.pos.z }
  if (m.pushOn > 0) m.pushOn -= seconds
  else if (blockedAhead(m.at.pos, dir, h.obstacles())) {
    m.speed = 0
    m.waited += seconds
    if (m.waited >= GIVE_UP_SECONDS) m.pushOn = PUSH_ON_SECONDS
    return false
  }
  m.waited = 0

  const brakeTo = Math.sqrt(2 * h.brake * legLeft(m))
  m.speed = Math.min(m.speed + h.accel * seconds, h.limit(leg, m.at.pos), Math.max(0.3, brakeTo))

  let left = m.speed * seconds
  while (left > 1e-9 && m.next < leg.points.length) {
    const p = leg.points[m.next]
    const dx = p.x - m.at.pos.x
    const dz = p.z - m.at.pos.z
    const d = Math.hypot(dx, dz)
    if (d > 1e-6) {
      const facing = leg.reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz)
      m.at.heading = dampAngle(m.at.heading, facing, STEER_RATE, Math.min(seconds, MAX_STEP_S))
    }
    if (d <= left) {
      m.at.pos.x = p.x
      m.at.pos.z = p.z
      left -= d
      m.next++
    } else {
      m.at.pos.x += (dx / d) * left
      m.at.pos.z += (dz / d) * left
      left = 0
    }
  }
  if (m.next >= leg.points.length) {
    m.leg++
    m.next = 1
    m.speed = 0
  }
  return m.leg >= m.legs.length
}
