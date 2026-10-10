import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import type { Group } from 'three'
import { isClosed } from '../sim/clock'
import { CUSTOMER_SPEED } from '../sim/customers'
import type { RoadEnd } from '../sim/driving'
import type { Vec2 } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import { JAGUAR_ID, JAGUAR_VARIANT, nextTarget, POACH_SECONDS } from '../sim/jaguar'
import {
  BIKE_BAYS,
  bikeId,
  JAGUAR_CROSSING,
  jaguarRideIn,
  jaguarRideOut,
  onwardEnd,
  pickRoadEnd,
} from '../sim/riding'
import { playWorldCue } from '../audio/sfxBridge'
import { isPaused, useGame } from '../state/store'
import { bayToWorld, bikeHandling, routeToWorld, walkStraight, type Ride } from './bikes'
import { Character } from './Character'
import { Interactable } from './Interactable'
import { Motorcycle, Rider } from './Motorcycle'
import { followRoute, startRoute, type RouteMover } from './route'
import { ambientPos, gameTime, grid, interactables, staffPos, vehiclePos } from './runtime'
import {
  createWalker,
  frameSeconds,
  pathTo,
  releaseWalker,
  turnToward,
  walk,
  type Walker,
} from './walker'

/** A brown leather jacket. */
const JACKET_TINT = '#3b2a20'
/** His bike's tank and his helmet. */
const BIKE_PAINT = '#b91c1c'
const HELMET = '#111317'
/** Quick on the road, quicker getting away, and slow pulling on and off the shoulder. */
const RIDE: Ride = { road: 5.5, offRoad: 2, accel: 4, brake: 5 }
const GETAWAY: Ride = { ...RIDE, road: 8, accel: 6 }
const BIKE_ID = bikeId(JAGUAR_ID)
/** Seconds (at game speed) he spends rubbing grime into one car. */
export const SMUDGE_SECONDS = 6
/** Caught: he hurries for the street this much faster than a stroll. */
const RUN_FACTOR = 2
const BADGE_HEIGHT = 1.5
/** Close enough to the employee he's poaching to talk them round. */
const CHAT_REACH = 1.6
/** As close as he can get (say, across a desk), stopped: near enough to talk. */
const CHAT_FAR = 2.6
/** Following someone on the move: game seconds between new paths to where they are now. */
const FOLLOW_REPLAN_SECONDS = 0.5

interface JaguarWalker extends Walker {
  /**
   * `target:<carId>` while working through his list, `poach:<employeeId>` on
   * his way to (or chatting with) someone, then `leave` or `flee`.
   */
  task: string
  /** Seconds spent smudging the car, or talking to the employee, he's at. */
  timer: number
  /** Poaching: game seconds until he looks again where his target is. */
  replan: number
}

/**
 * - ride-in: on his bike, along the road to his bay on the far shoulder
 * - cross-in: off it and walking straight over the road to the sidewalk
 * - lot: about his business (the store has him `onLot`)
 * - cross-out: done or run off, back over the road to his bike
 * - ride-out: on it and off the map
 */
type Stage = 'ride-in' | 'cross-in' | 'lot' | 'cross-out' | 'ride-out'

interface Bike extends RouteMover {
  /** The road end he rode in from; he rides off toward the other. */
  from: RoadEnd
}

/** Jaguar out and about, if he is, his bike, and the day he came on. */
const visit: { walker: JaguarWalker | null; bike: Bike | null; stage: Stage; day: number } = {
  walker: null,
  bike: null,
  stage: 'ride-in',
  day: 0,
}

const worldOf = (t: { tx: number; tz: number }): Vec2 => grid.tileToWorld(t.tx, t.tz)

/** On his bike at the end of the road he comes in by today, revving up. */
function arrive(day: number): JaguarWalker {
  const from = pickRoadEnd(day)
  const legs = routeToWorld(jaguarRideIn(from))
  const start = legs[0].points[0]
  const bike: Bike = {
    from,
    legs,
    leg: 0,
    next: 1,
    at: { pos: { ...start }, heading: from === 'west' ? Math.PI / 2 : -Math.PI / 2, moving: true },
    speed: 0,
    waited: 0,
    pushOn: 0,
  }
  const w: JaguarWalker = {
    ...createWalker(JAGUAR_ID, JAGUAR_CROSSING, Math.PI),
    task: '',
    timer: 0,
    replan: 0,
  }
  w.anim.current = 'sit'
  visit.bike = bike
  visit.stage = 'ride-in'
  vehiclePos.set(BIKE_ID, bike.at)
  playWorldCue('motorbike', { kind: 'ambient', id: BIKE_ID })
  return w
}

function leave(): void {
  visit.walker = null
  visit.bike = null
  ambientPos.delete(JAGUAR_ID)
  vehiclePos.delete(BIKE_ID)
  releaseWalker(JAGUAR_ID)
}

/**
 * Poaching: walks up to the employee (following them if they move) and talks
 * to them for `POACH_SECONDS`, then the store hears they're thinking of
 * quitting. Someone let go (or gone home) is no use to him.
 */
function poach(w: JaguarWalker, employeeId: string, seconds: number): void {
  const game = useGame.getState()
  const e = game.roster.find((x) => x.id === employeeId)
  const at = staffPos.get(employeeId)
  if (!e || e.fired || e.status === 'off' || e.status === 'leaving' || !at) {
    game.jaguarPoach(employeeId)
    return
  }
  const dist = Math.hypot(at.x - w.pos.x, at.z - w.pos.z)
  const near = dist < CHAT_REACH || (w.waypoints.length === 0 && dist < CHAT_FAR)
  if (near) {
    w.waypoints = []
    turnToward(w, at, seconds)
    w.anim.current = 'idle'
    if (!game.jaguar?.chatting) game.jaguarChat()
    w.timer += seconds
    if (w.timer >= POACH_SECONDS) game.jaguarPoach(employeeId)
    return
  }
  // They've moved off: after them.
  if ((w.replan -= seconds) <= 0 || (w.waypoints.length === 0 && !w.unreachable)) {
    w.replan = FOLLOW_REPLAN_SECONDS
    const tile = grid.worldToTile(at.x, at.z)
    if (tile) pathTo(w, approachTilesFor(grid, { ...tile, w: 1, h: 1 }))
  }
  walk(w, CUSTOMER_SPEED, seconds, at)
}

/**
 * Walks to each car on his list and smudges it, or to the employee he means
 * to poach, then strolls back toward his bike. Caught, he drops what he's
 * doing and runs for it.
 */
function update(w: JaguarWalker, seconds: number): void {
  const game = useGame.getState()
  const jaguar = game.jaguar
  if (!jaguar) return leave()
  const target = jaguar.status === 'onLot' && !isClosed(game.clock) ? nextTarget(jaguar) : null
  const kind = jaguar.scheme === 'poach' ? 'poach' : 'target'
  const task = jaguar.status === 'runOff' ? 'flee' : target ? `${kind}:${target}` : 'leave'
  if (target && kind === 'poach') {
    if (task !== w.task) {
      w.task = task
      w.timer = 0
      w.replan = 0
      w.faceTo = null
    }
    return poach(w, target, seconds)
  }
  const it = target ? interactables.get(target) : undefined

  if (task !== w.task) {
    w.task = task
    w.timer = 0
    w.faceTo = it ? interactableCenter(grid, it) : null
    if (task === 'flee' || task === 'leave') pathTo(w, [JAGUAR_CROSSING])
    else if (it) pathTo(w, it.approachTiles)
    else w.unreachable = true
  }

  const speed = task === 'flee' ? CUSTOMER_SPEED * RUN_FACTOR : CUSTOMER_SPEED
  walk(w, speed, seconds, w.faceTo)
  if (task === 'flee') w.anim.current = w.waypoints.length > 0 ? 'sprint' : 'idle'
  if (w.waypoints.length > 0) return

  if (task === 'flee' || task === 'leave') {
    // Off the lot: back over the road to his bike.
    visit.stage = 'cross-out'
    return
  }
  // Sold, or out of reach: on to the next one without a smudge.
  if (!it || w.unreachable) {
    game.jaguarSmudge(target!)
    return
  }
  w.anim.current = 'interact-right'
  w.timer += seconds
  if (w.timer >= SMUDGE_SECONDS) game.jaguarSmudge(target!)
}

/**
 * One frame of his visit, stage by stage: the ride in, the walk over the road,
 * the lot (`update`), the walk back and the ride off. The store hears
 * `jaguarArrived` as he steps onto the sidewalk and `jaguarLeft` once his
 * bike is off the map.
 */
function step(w: JaguarWalker, bike: Bike, seconds: number): void {
  const game = useGame.getState()
  const jaguar = game.jaguar
  if (!jaguar) return leave()
  const fleeing = jaguar.status === 'runOff'
  switch (visit.stage) {
    case 'ride-in': {
      if (!followRoute(bike, seconds, bikeHandling(BIKE_ID, RIDE))) return
      bike.at.moving = false
      // Closing came (or the day moved on) while he was on the road: he doesn't stop.
      if (jaguar.status !== 'coming' || isClosed(game.clock)) return rideOff(w, bike)
      visit.stage = 'cross-in'
      w.pos.x = bike.at.pos.x
      w.pos.z = bike.at.pos.z
      ambientPos.set(JAGUAR_ID, w.pos)
      w.anim.current = 'walk'
      return
    }
    case 'cross-in': {
      w.anim.current = 'walk'
      if (!walkStraight(w, worldOf(JAGUAR_CROSSING), CUSTOMER_SPEED, seconds)) return
      // Closing came while he was crossing: back to his bike.
      if (isClosed(game.clock)) {
        visit.stage = 'cross-out'
        return
      }
      visit.stage = 'lot'
      w.anim.current = 'idle'
      game.jaguarArrived()
      return
    }
    case 'lot':
      return update(w, seconds)
    case 'cross-out': {
      const speed = fleeing ? CUSTOMER_SPEED * RUN_FACTOR : CUSTOMER_SPEED
      w.anim.current = fleeing ? 'sprint' : 'walk'
      if (walkStraight(w, bayToWorld(BIKE_BAYS.jaguar), speed, seconds)) rideOff(w, bike)
      return
    }
    case 'ride-out': {
      if (!followRoute(bike, seconds, bikeHandling(BIKE_ID, fleeing ? GETAWAY : RIDE))) return
      game.jaguarLeft()
      return leave()
    }
  }
}

/** Back on his bike and away, the way he was heading. */
function rideOff(w: JaguarWalker, bike: Bike): void {
  ambientPos.delete(JAGUAR_ID)
  releaseWalker(JAGUAR_ID)
  w.waypoints = []
  w.anim.current = 'sit'
  visit.stage = 'ride-out'
  startRoute(bike, routeToWorld(jaguarRideOut(onwardEnd(bike.from))))
  playWorldCue('motorbike', { kind: 'ambient', id: BIKE_ID })
}

type Shown = 'none' | 'riding' | 'walking'
const shownOf = (): Shown =>
  !visit.walker
    ? 'none'
    : visit.stage === 'ride-in' || visit.stage === 'ride-out'
      ? 'riding'
      : 'walking'

/**
 * Jaguar, on the days he visits (see `sim/jaguar.ts`): he rides in along the
 * road at his arrival time, parks on the far shoulder and walks over, goes
 * round the cars he means to smudge (or the employee he means to poach), then
 * walks back and rides off, or sprints for his bike once caught. His plan
 * lives in the store; the ride and the walk are all here. His bike stays
 * parked on the shoulder while he's on the lot.
 */
export function Jaguar() {
  const [shown, setShown] = useState<Shown>('none')
  const group = useRef<Group>(null)
  const catchable = useGame((s) => s.jaguar?.status === 'onLot')

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const day = game.clock.day
    if (visit.walker && visit.day !== day) leave()
    const due =
      game.jaguar?.status === 'coming' &&
      gameTime.minute >= game.jaguar.arrivalMinute &&
      !isClosed(game.clock)
    if (!visit.walker && due && !isPaused(game)) {
      visit.walker = arrive(day)
      visit.day = day
    }
    const w = visit.walker
    if (w && visit.bike && !isPaused(game)) {
      step(w, visit.bike, frameSeconds(rawDelta, game.timeScale).seconds)
    }
    const now = shownOf()
    if (now !== shown) setShown(now)
    if (visit.walker && group.current) {
      group.current.position.set(visit.walker.pos.x, 0, visit.walker.pos.z)
      group.current.rotation.y = visit.walker.heading
    }
  })

  const w = visit.walker
  if (shown === 'none' || !w || !visit.bike) return null
  const badge = (
    <Html position={[0, BADGE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className="staff-badge jaguar-badge">Jaguar</div>
    </Html>
  )
  return (
    <>
      <Motorcycle bike={visit.bike} paint={BIKE_PAINT}>
        {shown === 'riding' && (
          <>
            <Rider variant={JAGUAR_VARIANT} anim={w.anim} tint={JACKET_TINT} helmet={HELMET} />
            {badge}
          </>
        )}
      </Motorcycle>
      {shown === 'walking' && (
        <group ref={group} position={[w.pos.x, 0, w.pos.z]}>
          <Interactable id={JAGUAR_ID} disabled={!catchable}>
            <Suspense fallback={null}>
              <Character
                variant={JAGUAR_VARIANT}
                anim={w.anim}
                moveSpeed={CUSTOMER_SPEED}
                bodyTint={JACKET_TINT}
              />
            </Suspense>
          </Interactable>
          {badge}
        </group>
      )}
    </>
  )
}
