import { useFrame } from '@react-three/fiber'
import { Suspense, useState } from 'react'
import type { Group } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { dampAngle } from '../sim/agent'
import type { Customer } from '../sim/customers'
import {
  bayPose,
  bayToSpot,
  blockedAhead,
  drivenCleanliness,
  inboundRoute,
  outboundRoute,
  parkedPose,
  routeLength,
  serviceInbound,
  serviceOutbound,
  servicePose,
  spotToBay,
  stockInbound,
  stockOutbound,
  stockPose,
  type Leg,
  type RoadEnd,
} from '../sim/driving'
import type { Vec2 } from '../sim/grid'
import type { InventoryCar } from '../sim/inventory'
import { promptsDue, promptsMade } from '../sim/talkingPoints'
import { HEAD_BACK_MINUTES } from '../sim/testDrive'
import type { CarModel } from '../sim/layout'
import { createRng, hashSeed } from '../sim/rng'
import { vehicleTargetId } from '../sim/sellers'
import type { ServiceJob } from '../sim/service'
import { useGame } from '../state/store'
import { CarBody } from './Props'
import { Interactable } from './Interactable'
import {
  crowdAgents,
  driveClock,
  gameTime,
  grid,
  lifts,
  serviceCarsHome,
  vehiclePos,
} from './runtime'
import { frameSeconds, MAX_STEP_S, report } from './walker'

/** Top speed on the road and on the lot, in tiles per game second. */
const ROAD_SPEED = 5
const LOT_SPEED = 3
/** Backing out of a space. */
const REVERSE_SPEED = 1.5
/** Speeding up and braking, in tiles per second per second. */
const ACCEL = 3
const BRAKE = 4
/** Tile row of the fence: south of it is the sidewalk and the road. */
const FENCE_Z = 24
/** How quickly the car turns to face where it's going. */
const STEER_RATE = 8
/** Game seconds a car waits for someone in the way before edging through anyway. */
const GIVE_UP_SECONDS = 4
/** And how long it then ignores who's in front, to get clear. */
const PUSH_ON_SECONDS = 1.5

type Stage = 'in' | 'parked' | 'out'

/**
 * A test drive's stage: standing in its space while they walk to it, on the
 * road out, off the map, on the way back and back in its space.
 */
type DriveStage = 'waiting' | 'leaving' | 'away' | 'returning' | 'back'

/** Game minutes a test drive car spends off the map at the least, however long the drive out took. */
const MIN_AWAY_MINUTES = 2

/** A stock car out on a test drive. */
interface DriveTrip {
  /** The shopper driving it. */
  customerId: string
  space: number
  stage: DriveStage
  /** Game minute it set off, and when it turns for home once off the map. */
  departed: number
  awayUntil: number
  /** The store has been told it's back. */
  reported: boolean
}

/** A visitor's car in the world. Lives here, never in the store. */
interface DrivenCar {
  /** Its customer's id. */
  id: string
  model: CarModel
  condition: number
  cleanliness: number
  spot: number
  /** The road end it came from, and leaves by. */
  end: RoadEnd
  stage: Stage
  /** The route being driven, in world space, and how far along it the car is. */
  legs: Leg[]
  leg: number
  next: number
  /** Shared with `vehiclePos`. */
  at: { pos: Vec2; heading: number; moving: boolean }
  speed: number
  /** Game seconds held up by someone in the way, and left to push on regardless. */
  waited: number
  pushOn: number
  /** We bought it: it stays in its space until it goes into stock at closing. */
  bought: boolean
  /**
   * A service client's car: where it's headed (or standing), its service
   * space or a bay. Null for anyone parking in customer parking.
   */
  service: { place: 'spot' | number } | null
  /** Height off the ground: up with the lift while it's in a bay. */
  y: number
  /** A stock car out on a test drive (keyed by the car's id, not a customer's). Null otherwise. */
  drive: DriveTrip | null
}

const cars = new Map<string, DrivenCar>()
const groups = new Map<string, Group>()
/** The day the cars belong to: a new one clears any left over. */
let carsDay = 0

const toWorld = (legs: Leg[]): Leg[] =>
  legs.map((l) => ({ ...l, points: l.points.map((p) => grid.tileToWorld(p.x, p.z)) }))

function removeCar(id: string): void {
  const car = cars.get(id)
  if (typeof car?.service?.place === 'number') lifts.cars.delete(car.service.place)
  if (car?.drive) driveClock.delete(car.drive.customerId)
  cars.delete(id)
  vehiclePos.delete(id)
  serviceCarsHome.delete(id)
}

/** A visitor's car on first sight: at the end of the road, or in its space if they've parked. */
function createCar(c: Customer): DrivenCar {
  const vehicle = c.vehicle!
  const rng = createRng(hashSeed(`${c.id}:car`))
  const end: RoadEnd = rng.next() < 0.5 ? 'west' : 'east'
  const legs = toWorld(inboundRoute(vehicle.spot, end))
  const parked = parkedPose(vehicle.spot)
  const start = vehicle.parked ? grid.tileToWorld(parked.pos.x, parked.pos.z) : legs[0].points[0]
  const car: DrivenCar = {
    id: c.id,
    model: vehicle.car.model,
    condition: vehicle.car.condition,
    cleanliness: drivenCleanliness(c.id, vehicle.car.condition),
    spot: vehicle.spot,
    end,
    stage: vehicle.parked ? 'parked' : 'in',
    legs: vehicle.parked ? [] : legs,
    leg: 0,
    next: 1,
    at: {
      pos: { ...start },
      heading: vehicle.parked ? parked.heading : end === 'west' ? Math.PI / 2 : -Math.PI / 2,
      moving: !vehicle.parked,
    },
    speed: 0,
    waited: 0,
    pushOn: 0,
    bought: false,
    service: null,
    y: 0,
    drive: null,
  }
  cars.set(c.id, car)
  vehiclePos.set(c.id, car.at)
  return car
}

/**
 * A stock car out for customer `c`'s test drive, on first sight: standing in
 * its lot space while they walk to it. Keyed by the car's id.
 */
function createDriveCar(stock: InventoryCar, c: Customer): DrivenCar {
  const space = stock.spaceIndex!
  const rng = createRng(hashSeed(`${c.id}:drive`))
  const pose = stockPose(space)
  const car: DrivenCar = {
    id: stock.id,
    model: stock.model,
    condition: stock.used?.condition ?? 1,
    cleanliness: stock.cleanliness,
    spot: -1,
    end: rng.next() < 0.5 ? 'west' : 'east',
    stage: 'parked',
    legs: [],
    leg: 0,
    next: 1,
    at: { pos: grid.tileToWorld(pose.pos.x, pose.pos.z), heading: pose.heading, moving: false },
    speed: 0,
    waited: 0,
    pushOn: 0,
    bought: false,
    service: null,
    y: 0,
    drive: {
      customerId: c.id,
      space,
      stage: 'waiting',
      departed: 0,
      awayUntil: 0,
      reported: false,
    },
  }
  cars.set(stock.id, car)
  vehiclePos.set(stock.id, car.at)
  return car
}

/** A service client's car on first sight: at the end of the road, heading for its service space. */
function createServiceCar(c: Customer): DrivenCar {
  const visit = c.service!
  const rng = createRng(hashSeed(`${c.id}:car`))
  const end: RoadEnd = rng.next() < 0.5 ? 'west' : 'east'
  const legs = toWorld(serviceInbound(visit.spot, end))
  const car: DrivenCar = {
    id: c.id,
    model: visit.car.model,
    condition: visit.car.condition,
    cleanliness: drivenCleanliness(c.id, visit.car.condition),
    spot: visit.spot,
    end,
    stage: 'in',
    legs,
    leg: 0,
    next: 1,
    at: {
      pos: { ...legs[0].points[0] },
      heading: end === 'west' ? Math.PI / 2 : -Math.PI / 2,
      moving: true,
    },
    speed: 0,
    waited: 0,
    pushOn: 0,
    bought: false,
    service: { place: 'spot' },
    y: 0,
    drive: null,
  }
  cars.set(c.id, car)
  vehiclePos.set(c.id, car.at)
  return car
}

/** Sets a car off along `legs`. */
function setOff(car: DrivenCar, legs: Leg[]): void {
  car.legs = toWorld(legs)
  car.leg = 0
  car.next = 1
  car.speed = 0
  car.at.moving = true
}

/** Pulls out of its space and heads back the way it came. */
function driveOff(car: DrivenCar): void {
  car.stage = 'out'
  car.legs = toWorld(outboundRoute(car.spot, car.end))
  car.leg = 0
  car.next = 1
  car.speed = 0
  car.at.moving = true
}

/** Distance left to the end of the current leg, where the car stops (or turns about). */
function legLeft(car: DrivenCar): number {
  const { points } = car.legs[car.leg]
  return routeLength([car.at.pos, ...points.slice(car.next)])
}

/** The frame loop's lookups, cleared and refilled each frame instead of made anew. */
const byId = new Map<string, Customer>()
/** Stock cars out on a test drive, and the shopper driving each, by car id. */
const outCars = new Map<string, InventoryCar>()
const drivers = new Map<string, Customer>()
const bought = new Set<string>()
const jobs = new Map<string, ServiceJob>()

/** `obstacles`' list, kept between calls. */
const ahead: Vec2[] = []

/** Anyone a car should stop for: people standing about, and the other cars. Reused by the next call. */
function obstacles(self: string): Vec2[] {
  const own = `${self}:car`
  ahead.length = 0
  for (const a of crowdAgents()) if (!a.id.startsWith(own)) ahead.push(a.pos)
  for (const c of cars.values()) if (c.id !== self && c.stage !== 'parked') ahead.push(c.at.pos)
  return ahead
}

/**
 * Drives along the route for `seconds`: speeds up to the limit, brakes to stop
 * at each leg's end, waits for anyone in front (pushing on after a while so it
 * can't be stuck for good), and steers to face the way it's going (away from
 * it, backing out). Returns true once the route is done.
 */
function drive(car: DrivenCar, seconds: number): boolean {
  if (car.leg >= car.legs.length) return true
  const leg = car.legs[car.leg]
  const target = leg.points[car.next]
  const dir = { x: target.x - car.at.pos.x, z: target.z - car.at.pos.z }
  if (car.pushOn > 0) car.pushOn -= seconds
  else if (blockedAhead(car.at.pos, dir, obstacles(car.id))) {
    car.speed = 0
    car.waited += seconds
    if (car.waited >= GIVE_UP_SECONDS) car.pushOn = PUSH_ON_SECONDS
    return false
  }
  car.waited = 0

  const offRoad = grid.worldToTile(car.at.pos.x, car.at.pos.z).tz < FENCE_Z
  const limit = leg.reverse ? REVERSE_SPEED : offRoad ? LOT_SPEED : ROAD_SPEED
  const brakeTo = Math.sqrt(2 * BRAKE * legLeft(car))
  car.speed = Math.min(car.speed + ACCEL * seconds, limit, Math.max(0.3, brakeTo))

  let left = car.speed * seconds
  while (left > 1e-9 && car.next < leg.points.length) {
    const p = leg.points[car.next]
    const dx = p.x - car.at.pos.x
    const dz = p.z - car.at.pos.z
    const d = Math.hypot(dx, dz)
    if (d > 1e-6) {
      const facing = leg.reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz)
      car.at.heading = dampAngle(car.at.heading, facing, STEER_RATE, Math.min(seconds, MAX_STEP_S))
    }
    if (d <= left) {
      car.at.pos.x = p.x
      car.at.pos.z = p.z
      left -= d
      car.next++
    } else {
      car.at.pos.x += (dx / d) * left
      car.at.pos.z += (dz / d) * left
      left = 0
    }
  }
  if (car.next >= leg.points.length) {
    car.leg++
    car.next = 1
    car.speed = 0
  }
  return car.leg >= car.legs.length
}

/**
 * One car's frame. Returns false once it has driven off the map, or (one we
 * bought) gone into stock.
 */
function update(
  car: DrivenCar,
  c: Customer | undefined,
  bought: boolean,
  seconds: number,
): boolean {
  const game = useGame.getState()
  if (bought) car.bought = true
  // Ours now: it waits in its space, then becomes a lot car at closing.
  if (car.bought) return bought
  // Their customer got back in (or is gone): pull out.
  if (car.stage === 'parked' && !c) driveOff(car)
  if (car.stage === 'parked') return true
  if (!drive(car, seconds)) return true
  if (car.stage === 'out') return false
  // In its space.
  const parked = parkedPose(car.spot)
  car.at.heading = parked.heading
  car.at.moving = false
  car.stage = 'parked'
  if (c?.phase === 'arriving') game.dispatchCustomer({ type: 'parked', id: c.id })
  // Closing came while they were still driving in: straight back out.
  else if (c?.phase === 'leaving') game.dispatchCustomer({ type: 'droveOff', id: c.id })
  return true
}

/**
 * One service car's frame: it drives to where its job says it should be (its
 * space, a bay while it's worked on, or off once it's collected and its
 * driver has got in), always by way of its space. Returns false once it has
 * driven off the map.
 */
function updateService(
  car: DrivenCar,
  c: Customer | undefined,
  job: ServiceJob | undefined,
  seconds: number,
): boolean {
  const service = car.service!
  if (car.at.moving) {
    if (!drive(car, seconds)) return true
    if (car.stage === 'out') return false
    const pose = service.place === 'spot' ? servicePose(car.spot) : bayPose(service.place)
    car.at.heading = pose.heading
    car.at.moving = false
    car.stage = 'parked'
    if (service.place === 'spot' && c?.phase === 'arriving') {
      useGame.getState().dispatchCustomer({ type: 'parked', id: c.id })
    }
  }
  // Closing came while they were still driving in: straight back out.
  if (c?.phase === 'leaving' && !c.service?.parked) {
    useGame.getState().dispatchCustomer({ type: 'droveOff', id: c.id })
  }
  const want: 'spot' | number | 'gone' =
    job?.status === 'inBay' && job.bay !== null
      ? job.bay
      : !c && (!job || job.status === 'done')
        ? 'gone'
        : 'spot'
  const onLift = typeof service.place === 'number'
  if (onLift) lifts.cars.add(service.place as number)
  else serviceCarsHome.add(car.id)
  if (want === service.place) return true
  // Leaving where it stands: back to its space first, from a bay.
  serviceCarsHome.delete(car.id)
  if (onLift) {
    lifts.cars.delete(service.place as number)
    setOff(car, bayToSpot(service.place as number, car.spot))
    service.place = 'spot'
  } else if (want === 'gone') {
    car.stage = 'out'
    setOff(car, serviceOutbound(car.spot, car.end))
  } else {
    setOff(car, spotToBay(car.spot, want as number))
    service.place = want
  }
  return true
}

/**
 * One test drive car's frame: it waits in its space until they're in, drives
 * out of the gate and off the map, stays away for what's left of the drive
 * (as long again as the drive out took is kept for the way back; Head back
 * turns it round at once), then drives back into its space and tells the
 * store they're back. Returns false once the drive is over (the car is no
 * longer out) and it's in stock again.
 */
function updateDrive(
  car: DrivenCar,
  c: Customer | undefined,
  out: boolean,
  seconds: number,
): boolean {
  const trip = car.drive!
  if (!out) return false
  const now = gameTime.minute
  const minutes = c?.drive?.minutes ?? 0
  switch (trip.stage) {
    case 'waiting':
      if (c?.phase !== 'driving') break
      trip.departed = now
      trip.stage = 'leaving'
      car.stage = 'out'
      setOff(car, stockOutbound(trip.space, car.end))
      break
    case 'leaving': {
      if (!drive(car, seconds)) break
      // Off the map: gone until it's time to come back.
      const took = now - trip.departed
      trip.awayUntil = Math.max(now + MIN_AWAY_MINUTES, trip.departed + minutes - took)
      trip.stage = 'away'
      car.stage = 'parked'
      car.at.moving = false
      vehiclePos.delete(car.id)
      break
    }
    case 'away':
      if (c?.drive?.cut) trip.awayUntil = Math.min(trip.awayUntil, now + HEAD_BACK_MINUTES)
      if (now < trip.awayUntil) break
      trip.stage = 'returning'
      car.stage = 'in'
      setOff(car, stockInbound(trip.space, car.end))
      car.at.pos = { ...car.legs[0].points[0] }
      car.at.heading = car.end === 'west' ? Math.PI / 2 : -Math.PI / 2
      vehiclePos.set(car.id, car.at)
      break
    case 'returning': {
      if (!drive(car, seconds)) break
      const pose = stockPose(trip.space)
      car.at.heading = pose.heading
      car.at.moving = false
      car.stage = 'parked'
      trip.stage = 'back'
      break
    }
    case 'back':
      // They get out; the store puts the car back in stock.
      if (!trip.reported && c?.phase === 'driving') {
        trip.reported = true
        useGame.getState().driveBack(c.id)
      }
      break
  }
  // Talking points at a third and two thirds of the way, until it's back (or Head back).
  const onRoad = trip.stage === 'leaving' || trip.stage === 'away' || trip.stage === 'returning'
  if (c?.drive && onRoad && !c.drive.cut && c.phase === 'driving') {
    const due = promptsDue(now - trip.departed, minutes)
    if (due > promptsMade(c.drive)) {
      const id = c.id
      report(trip, `prompt:${due}`, () => useGame.getState().drivePrompt(id))
    }
  }
  if (c && trip.stage !== 'waiting' && trip.stage !== 'back') {
    const total = Math.max(minutes, 1)
    const left = trip.stage === 'returning' ? 0 : Math.max(0, trip.departed + total - now)
    driveClock.set(c.id, { left, total })
  } else if (c) driveClock.delete(c.id)
  return true
}

/** How high a car stands: on the lift's arms in a bay, else on the ground. */
function heightOf(car: DrivenCar): number {
  const bay = car.service?.place
  if (typeof bay !== 'number' || car.at.moving) return 0
  const h = lifts.heights[bay] ?? 0
  // The arms are under it once the lift starts up.
  return h + Math.min(0.11, h)
}

/**
 * Visitors' cars: each drives along the road, in through the gate and into
 * its customer-parking space on a fixed route (`sim/driving.ts`), and the
 * store hears `parked` once the driver gets out. Once they've got back in
 * (`droveOff`, from scene/Customers) it backs out and drives off the way it
 * came. A car we bought stays in its space until it goes into stock at
 * closing, and a seller's car (or a trade-in) can be clicked to appraise. A
 * service client's car drives in to its service space, to a bay and up on the
 * lift while it's worked on, back again when it's done, and off once it's
 * collected; it stays while its driver is away. A moving car waits
 * for anyone in front of it; walkers step around it through `vehiclePos`. Re-renders only when a car appears or leaves.
 */
export function DrivenCars() {
  const [ids, setIds] = useState<string[]>([])
  // A seller's car, or a trade-in, can be clicked to appraise while they're on the lot.
  const appraisable = useGame(
    useShallow((s) =>
      s.customers
        .filter((c) => (c.selling || c.trade) && c.vehicle?.parked && c.phase !== 'leaving')
        .map((c) => c.id),
    ),
  )

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    let changed = false
    if (carsDay !== game.clock.day) {
      for (const id of [...cars.keys()]) removeCar(id)
      carsDay = game.clock.day
      changed = true
    }
    byId.clear()
    for (const c of game.customers) byId.set(c.id, c)
    bought.clear()
    for (const p of game.purchases) bought.add(p.customerId)
    jobs.clear()
    for (const j of game.serviceJobs) if (j.customerId) jobs.set(j.customerId, j)
    outCars.clear()
    for (const car of game.inventory) if (car.status === 'out') outCars.set(car.id, car)
    drivers.clear()
    for (const c of game.customers) {
      const stock = c.drive && outCars.get(c.drive.carId)
      if (!stock) continue
      drivers.set(stock.id, c)
      if (cars.has(stock.id) || stock.spaceIndex === null) continue
      createDriveCar(stock, c)
      changed = true
    }
    for (const c of game.customers) {
      if (c.vehicle && !cars.has(c.id)) {
        createCar(c)
        changed = true
      } else if (c.service && !c.service.returned && !cars.has(c.id)) {
        createServiceCar(c)
        changed = true
      }
    }
    const { seconds } = frameSeconds(rawDelta, game.timeScale)
    // Only the car being updated is ever removed, which a Map's iteration allows.
    for (const car of cars.values()) {
      const c = byId.get(car.id)
      const going = car.drive
        ? updateDrive(car, drivers.get(car.id), outCars.has(car.id), seconds)
        : car.service
          ? updateService(car, c, jobs.get(car.id), seconds)
          : update(car, c, bought.has(car.id), seconds)
      if (going) continue
      removeCar(car.id)
      changed = true
    }
    for (const [id, g] of groups) {
      const car = cars.get(id)
      if (!car) continue
      car.y = heightOf(car)
      g.position.set(car.at.pos.x, car.y, car.at.pos.z)
      g.rotation.y = car.at.heading
      // Off the map on a test drive: not drawn.
      g.visible = car.drive?.stage !== 'away'
    }
    if (changed) setIds([...cars.keys()])
  })

  return (
    <>
      {ids.map((id) => {
        const car = cars.get(id)
        if (!car) return null
        return (
          <group
            key={id}
            position={[car.at.pos.x, car.y, car.at.pos.z]}
            rotation-y={car.at.heading}
            ref={(g) => {
              if (g) groups.set(id, g)
              else groups.delete(id)
            }}
          >
            {car.drive ? (
              <Suspense fallback={null}>
                <CarBody
                  model={car.model}
                  cleanliness={car.cleanliness}
                  condition={car.condition}
                />
              </Suspense>
            ) : (
              <Interactable id={vehicleTargetId(id)} disabled={!appraisable.includes(id)}>
                <Suspense fallback={null}>
                  <CarBody
                    model={car.model}
                    cleanliness={car.cleanliness}
                    condition={car.condition}
                  />
                </Suspense>
              </Interactable>
            )}
          </group>
        )
      })}
    </>
  )
}
