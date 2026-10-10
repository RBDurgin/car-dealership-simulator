import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import type { Group } from 'three'
import { isClosed } from '../sim/clock'
import { CUSTOMER_SPEED, PLAYER_ID } from '../sim/customers'
import type { Vec2 } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import { SHOP_GATE } from '../sim/layout'
import { COFFEE_STOP, NAZMA_ID, NAZMA_VARIANT, nextStop, STOP_SECONDS } from '../sim/nazma'
import { BIKE_BAYS, bikeId, nazmaRide } from '../sim/riding'
import { playWorldCue } from '../audio/sfxBridge'
import { isPaused, useGame } from '../state/store'
import {
  bayToWorld,
  bikeHandling,
  parkedBike,
  routeToWorld,
  walkStraight,
  type Ride,
} from './bikes'
import { Character } from './Character'
import { Motorcycle, Rider } from './Motorcycle'
import { followRoute, startRoute } from './route'
import {
  ambientPos,
  gameTime,
  grid,
  interactables,
  playerPos,
  staffPos,
  vehiclePos,
} from './runtime'
import {
  createWalker,
  frameSeconds,
  pathTo,
  releaseWalker,
  turnToward,
  walk,
  type Walker,
} from './walker'

/** A pink baker's apron, a mint scooter-ish tank and a cream helmet. */
const APRON_TINT = '#f9a8d4'
const BIKE_PAINT = '#6ee7b7'
const HELMET = '#fef3c7'
/** He takes it easy: gentle on the road, and walking pace on the sidewalk and his forecourt. */
const RIDE: Ride = { road: 4, offRoad: 1.5, accel: 2.5, brake: 4 }
const BIKE_ID = bikeId(NAZMA_ID)
/** The sidewalk tile beside his parked bike on the lot side, where he steps on and off the grid. */
const LOT_STEP = {
  tx: Math.round(BIKE_BAYS.nazmaLot.pos.x),
  tz: Math.round(BIKE_BAYS.nazmaLot.pos.z) - 1,
}
const BADGE_HEIGHT = 1.5
/** Close enough to whoever he's visiting to chat. */
const CHAT_REACH = 1.6
/** As close as he can get (say, across a desk), stopped: near enough to chat. */
const CHAT_FAR = 2.6
/** Following someone on the move: game seconds between new paths to where they are now. */
const FOLLOW_REPLAN_SECONDS = 0.5
/** Game seconds he waves for on reaching someone, before the chat. */
const WAVE_SECONDS = 1.2

interface NazmaWalker extends Walker {
  /** `stop:<id>` while making his stops, then `leave`. */
  task: string
  /** Seconds spent at the stop he's at. */
  timer: number
  /** Visiting someone: game seconds until he looks again where they are. */
  replan: number
}

/**
 * - to-bike: out of the shop door to his bike out front
 * - ride-out: over the road to the lot's sidewalk
 * - lot: making his stops (the store has him `onLot`)
 * - mount: from the sidewalk tile back onto his bike
 * - ride-home: back over the road to the shop
 * - to-door: from his bike in through the shop door
 */
type Stage = 'to-bike' | 'ride-out' | 'lot' | 'mount' | 'ride-home' | 'to-door'

/** Nazma out of his shop, if he is, where he's got to, and the day he came over on. */
const visit: { walker: NazmaWalker | null; stage: Stage; day: number } = {
  walker: null,
  stage: 'to-bike',
  day: 0,
}

/** His bike: out front of the shop, unless he's riding it or it's parked over on the lot side. */
const bike = parkedBike(BIKE_BAYS.nazmaShop)

/** Puts his bike back out front of the shop (a new day, or a fresh start). */
function parkAtShop(): void {
  Object.assign(bike, parkedBike(BIKE_BAYS.nazmaShop))
  vehiclePos.set(BIKE_ID, bike.at)
}

const worldOf = (t: { tx: number; tz: number }): Vec2 => grid.tileToWorld(t.tx, t.tz)

/** Out of the shop door, heading for his bike. */
function arrive(): NazmaWalker {
  const w: NazmaWalker = {
    ...createWalker(NAZMA_ID, SHOP_GATE, Math.PI),
    task: '',
    timer: 0,
    replan: 0,
  }
  visit.stage = 'to-bike'
  ambientPos.set(NAZMA_ID, w.pos)
  return w
}

function leave(): void {
  visit.walker = null
  ambientPos.delete(NAZMA_ID)
  releaseWalker(NAZMA_ID)
}

/** Gets on his bike and rides `way`. */
function ride(w: NazmaWalker, way: 'out' | 'home'): void {
  ambientPos.delete(NAZMA_ID)
  releaseWalker(NAZMA_ID)
  w.waypoints = []
  w.anim.current = 'sit'
  visit.stage = way === 'out' ? 'ride-out' : 'ride-home'
  startRoute(bike, routeToWorld(nazmaRide(way)))
  playWorldCue('motorbike', { kind: 'ambient', id: BIKE_ID })
}

/** Off his bike where it stopped, on foot again. */
function dismount(w: NazmaWalker): void {
  bike.at.moving = false
  w.pos.x = bike.at.pos.x
  w.pos.z = bike.at.pos.z
  w.anim.current = 'idle'
  ambientPos.set(NAZMA_ID, w.pos)
}

/** Where the person at stop `id` stands, or null if they're not around to visit. */
function personAt(id: string): Vec2 | null {
  if (id === PLAYER_ID) return playerPos
  const e = useGame.getState().roster.find((x) => x.id === id)
  if (!e || e.fired || e.status === 'off' || e.status === 'leaving') return null
  return staffPos.get(id) ?? null
}

/** Walks up to the person at stop `id` (following them if they move), waves and chats. */
function visitPerson(w: NazmaWalker, id: string, seconds: number): void {
  const game = useGame.getState()
  const at = personAt(id)
  if (!at) return game.nazmaStop(id)
  const dist = Math.hypot(at.x - w.pos.x, at.z - w.pos.z)
  const near = dist < CHAT_REACH || (w.waypoints.length === 0 && dist < CHAT_FAR)
  if (near) {
    w.waypoints = []
    turnToward(w, at, seconds)
    w.anim.current = w.timer < WAVE_SECONDS ? 'emote-yes' : 'idle'
    if (w.timer >= WAVE_SECONDS && !game.nazma?.chatting) game.nazmaChat()
    w.timer += seconds
    if (w.timer >= WAVE_SECONDS + STOP_SECONDS) game.nazmaStop(id)
    return
  }
  if ((w.replan -= seconds) <= 0 || (w.waypoints.length === 0 && !w.unreachable)) {
    w.replan = FOLLOW_REPLAN_SECONDS
    const tile = grid.worldToTile(at.x, at.z)
    pathTo(w, approachTilesFor(grid, { ...tile, w: 1, h: 1 }))
    // Nowhere to stand near them: never mind.
    if (w.unreachable) return game.nazmaStop(id)
  }
  walk(w, CUSTOMER_SPEED, seconds, at)
}

/**
 * One frame of his visit, stage by stage: out to his bike, the ride over, the
 * lot (`update`), back onto his bike, the ride home and in through the door.
 * The store hears `nazmaArrived` as he gets off his bike on the lot side and
 * `nazmaLeft` once he's back in the shop.
 */
function step(w: NazmaWalker, seconds: number): void {
  const game = useGame.getState()
  if (!game.nazma) return leave()
  switch (visit.stage) {
    case 'to-bike':
      w.anim.current = 'walk'
      if (walkStraight(w, bayToWorld(BIKE_BAYS.nazmaShop), CUSTOMER_SPEED, seconds)) ride(w, 'out')
      return
    case 'ride-out':
      if (!followRoute(bike, seconds, bikeHandling(BIKE_ID, RIDE))) return
      dismount(w)
      visit.stage = 'lot'
      game.nazmaArrived()
      return
    case 'lot':
      return update(w, seconds)
    case 'mount':
      w.anim.current = 'walk'
      if (walkStraight(w, bayToWorld(BIKE_BAYS.nazmaLot), CUSTOMER_SPEED, seconds)) ride(w, 'home')
      return
    case 'ride-home':
      if (!followRoute(bike, seconds, bikeHandling(BIKE_ID, RIDE))) return
      dismount(w)
      visit.stage = 'to-door'
      return
    case 'to-door':
      w.anim.current = 'walk'
      if (!walkStraight(w, worldOf(SHOP_GATE), CUSTOMER_SPEED, seconds)) return
      game.nazmaLeft()
      return leave()
  }
}

/**
 * Each of his stops in turn: a wave and a chat with the player or one of the
 * staff, or a coffee from the lounge machine. Then back to his bike. Closing
 * time sends him home early.
 */
function update(w: NazmaWalker, seconds: number): void {
  const game = useGame.getState()
  const nazma = game.nazma
  if (!nazma) return leave()
  const stop = nazma.status === 'onLot' && !isClosed(game.clock) ? nextStop(nazma) : null
  const task = stop ? `stop:${stop}` : 'leave'
  const coffee = stop === COFFEE_STOP ? interactables.get(COFFEE_STOP) : undefined
  if (task !== w.task) {
    w.task = task
    w.timer = 0
    w.replan = 0
    w.faceTo = coffee ? interactableCenter(grid, coffee) : null
    if (task === 'leave') pathTo(w, [LOT_STEP])
    else if (coffee) pathTo(w, coffee.approachTiles)
  }
  if (stop && stop !== COFFEE_STOP) return visitPerson(w, stop, seconds)

  walk(w, CUSTOMER_SPEED, seconds, w.faceTo)
  if (w.waypoints.length > 0) return
  if (task === 'leave') {
    // At the sidewalk by his bike: on it, and home.
    visit.stage = 'mount'
    return
  }
  if (!coffee || w.unreachable) return game.nazmaStop(stop!)
  w.anim.current = 'interact-right'
  w.timer += seconds
  if (w.timer >= STOP_SECONDS) game.nazmaStop(stop!)
}

type Shown = 'none' | 'riding' | 'walking'
const shownOf = (): Shown =>
  !visit.walker
    ? 'none'
    : visit.stage === 'ride-out' || visit.stage === 'ride-home'
      ? 'riding'
      : 'walking'

/**
 * Nazma, on the days he pops over from the cupcake shop (see `sim/nazma.ts`):
 * out to his bike at his arrival time, over the road to the lot's sidewalk,
 * round his stops, and home again the same way. His bike stands out front of
 * the shop the rest of the time. He changes nothing in the store but his own
 * visit, and nothing targets him.
 */
export function Nazma() {
  const [shown, setShown] = useState<Shown>('none')
  const group = useRef<Group>(null)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const day = game.clock.day
    if (visit.day !== day) {
      if (visit.walker) leave()
      parkAtShop()
      visit.day = day
    }
    const due =
      game.nazma?.status === 'coming' &&
      gameTime.minute >= game.nazma.arrivalMinute &&
      !isClosed(game.clock)
    if (!visit.walker && due && !isPaused(game)) visit.walker = arrive()
    const w = visit.walker
    if (w && !isPaused(game)) step(w, frameSeconds(rawDelta, game.timeScale).seconds)
    const now = shownOf()
    if (now !== shown) setShown(now)
    if (visit.walker && group.current) {
      group.current.position.set(visit.walker.pos.x, 0, visit.walker.pos.z)
      group.current.rotation.y = visit.walker.heading
    }
  })

  const w = visit.walker
  const badge = (
    <Html position={[0, BADGE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className="staff-badge nazma-badge">Nazma</div>
    </Html>
  )
  return (
    <>
      <Motorcycle bike={bike} paint={BIKE_PAINT}>
        {shown === 'riding' && w && (
          <>
            <Rider variant={NAZMA_VARIANT} anim={w.anim} tint={APRON_TINT} helmet={HELMET} />
            {badge}
          </>
        )}
      </Motorcycle>
      {shown === 'walking' && w && (
        <group ref={group} position={[w.pos.x, 0, w.pos.z]}>
          <Suspense fallback={null}>
            <Character
              variant={NAZMA_VARIANT}
              anim={w.anim}
              moveSpeed={CUSTOMER_SPEED}
              bodyTint={APRON_TINT}
            />
          </Suspense>
          {badge}
        </group>
      )}
    </>
  )
}
