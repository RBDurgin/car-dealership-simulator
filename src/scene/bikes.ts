import type { Leg } from '../sim/driving'
import type { Vec2 } from '../sim/grid'
import { isBikeId, onRoad, type BikeBay } from '../sim/riding'
import type { Handling, RouteMover } from './route'
import { crowdAgents, grid, vehiclePos } from './runtime'
import type { Walker } from './walker'

/**
 * What Nazma's and Jaguar's motorcycles share in the world (scene/Nazma,
 * scene/Jaguar): turning `sim/riding` routes into world space, what a bike
 * stops for, how it handles, and walking a rider straight to or from it off
 * the grid.
 */

export const routeToWorld = (legs: Leg[]): Leg[] =>
  legs.map((l) => ({ ...l, points: l.points.map((p) => grid.tileToWorld(p.x, p.z)) }))

export const bayToWorld = (bay: BikeBay): Vec2 => grid.tileToWorld(bay.pos.x, bay.pos.z)

/** A bike standing in `bay`, ready to set off. */
export function parkedBike(bay: BikeBay): RouteMover {
  return {
    legs: [],
    leg: 0,
    next: 1,
    at: { pos: bayToWorld(bay), heading: bay.heading, moving: false },
    speed: 0,
    waited: 0,
    pushOn: 0,
  }
}

/** Anyone bike `id` should stop for: people about, and the cars and other bikes on the move. */
function obstacles(id: string): Vec2[] {
  const people = crowdAgents()
    .filter((a) => !isBikeId(a.id))
    .map((a) => a.pos)
  const moving = [...vehiclePos].filter(([other, v]) => other !== id && v.moving)
  return [...people, ...moving.map(([, v]) => v.pos)]
}

/** Top speeds (tiles per game second) on the road and off it, and how hard it speeds up and brakes. */
export interface Ride {
  road: number
  offRoad: number
  accel: number
  brake: number
}

export function bikeHandling(id: string, ride: Ride): Handling {
  return {
    limit: (_, pos) => (onRoad(pos.z + grid.height / 2 - 0.5) ? ride.road : ride.offRoad),
    accel: ride.accel,
    brake: ride.brake,
    obstacles: () => obstacles(id),
  }
}

/**
 * Walks `w` straight toward `to`, off the grid (over the road, or between a
 * shop door and a bike). Returns true once there.
 */
export function walkStraight(w: Walker, to: Vec2, speed: number, seconds: number): boolean {
  const dx = to.x - w.pos.x
  const dz = to.z - w.pos.z
  const dist = Math.hypot(dx, dz)
  const step = speed * seconds
  if (dist <= step) {
    w.pos.x = to.x
    w.pos.z = to.z
    return true
  }
  w.pos.x += (dx / dist) * step
  w.pos.z += (dz / dist) * step
  w.heading = Math.atan2(dx, dz)
  return false
}
