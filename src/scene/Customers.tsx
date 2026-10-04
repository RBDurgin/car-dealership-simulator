import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import { dampAngle, headingTo, stepAlongPath, toWaypoints } from '../sim/agent'
import { SEAT_HEIGHT, type CharacterAnim } from '../sim/characters'
import {
  currentBrowseCarId,
  CUSTOMER_SPEED,
  LINGER_MINUTES,
  type Customer,
  type CustomerVariant,
} from '../sim/customers'
import { CONVERSATION_PHASES, customerActions } from '../sim/deal'
import type { Tile, Vec2 } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import { GUEST_CHAIR_ID, LOT_ENTRY_TILES, PROPS, SIDEWALK_ENDS } from '../sim/layout'
import { findPathToAny } from '../sim/pathfinding'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { useGame } from '../state/store'
import { Character } from './Character'
import { CustomerBubble } from './CustomerBubble'
import { Interactable } from './Interactable'
import { customerPos, gameTime, grid, interactables, playerPos, rectBounds } from './runtime'

const TURN_RATE = 10
/** Movement is integrated in steps no longer than this, so a sped-up clock stays stable. */
const MAX_STEP_S = 0.05
/**
 * Real seconds per frame at most, before the dev time scale. Matches GameClock so
 * linger timers (game minutes) and walking (real seconds) keep pace at a low frame rate.
 */
const MAX_FRAME_S = 0.25
/** Real seconds a customer thinks over an offer before answering. */
const CONSIDER_SECONDS = 1.5
/** Real seconds of nodding or shaking their head after answering (two loops of the clip). */
const EMOTE_SECONDS = 1.3
/** A follower stops this close to the player, and sets off again once they're this far. */
const FOLLOW_STOP = 1.3
const FOLLOW_START = 2
const GUEST_CHAIR = PROPS.find((p) => p.id === GUEST_CHAIR_ID)!
/** How close to the guest chair a customer must get before sitting down on it. */
const SIT_REACH = 1.6

/** What the player is up to, as far as customers care. */
interface PlayerIntent {
  /** Whoever the player's current action is aimed at. */
  targetId: string | null
  /** Heading to the desk to close a deal: the customer goes to the guest chair. */
  closingDeal: boolean
}

/** A customer's body in the world. Positions and timers stay here, never in the store. */
interface Walker {
  pos: Vec2
  heading: number
  anim: { current: CharacterAnim }
  /** World-side randomness (spawn side, which side of a car to stand on, linger time). */
  rng: Rng
  exit: Tile
  task: string | null
  waypoints: Vec2[]
  faceTo: Vec2 | null
  /** No path to the current task's goal. */
  unreachable: boolean
  /** Game minute they're done looking at the current car, once they're there. */
  lingerUntil: number | null
  /** Real seconds spent on the current task (for thinking over an offer). */
  timer: number
  /** A short nod or head shake that plays before anything else. */
  emote: { anim: CharacterAnim; left: number } | null
  /** Sitting on the guest chair; `stand` is where they got on from. */
  seat: { stand: Vec2 } | null
  /** The player's tile when a follower last planned a path to them. */
  followTile: Tile | null
}

const walkers = new Map<string, Walker>()
const groups = new Map<string, Group>()

/** The customer's walker, created at a sidewalk end on first sight. */
function walkerFor(c: Customer): Walker {
  let w = walkers.get(c.id)
  if (w) return w
  const rng = createRng(hashSeed(c.id))
  const spawn = rng.pick(SIDEWALK_ENDS)
  // They leave the way they came, on either lane.
  const exit = rng.pick(SIDEWALK_ENDS.filter((t) => t.tx === spawn.tx))
  const pos = grid.tileToWorld(spawn.tx, spawn.tz)
  w = {
    pos,
    heading: spawn.tx === 0 ? Math.PI / 2 : -Math.PI / 2,
    anim: { current: 'idle' },
    rng,
    exit,
    task: null,
    waypoints: [],
    faceTo: null,
    unreachable: false,
    lingerUntil: null,
    timer: 0,
    emote: null,
    seat: null,
    followTile: null,
  }
  walkers.set(c.id, w)
  customerPos.set(c.id, pos)
  return w
}

function removeWalker(id: string): void {
  walkers.delete(id)
  customerPos.delete(id)
}

/** What they're doing in the world. A new key means they need a new path. */
function taskKey(c: Customer, player: PlayerIntent): string {
  switch (c.phase) {
    case 'arriving':
      return 'arrive'
    case 'browsing':
      return `browse:${c.browsed}`
    case 'following':
      return player.closingDeal ? 'toChair' : 'follow'
    case 'leaving':
      return 'leave'
    default:
      return c.phase
  }
}

/** Starts walking toward the goal for the customer's current task, from wherever they are. */
function plan(c: Customer, w: Walker, task: string): void {
  // Just answered an offer: nod or shake their head first.
  if (w.task === 'considering' && c.phase === 'following') {
    w.emote = { anim: 'emote-yes', left: EMOTE_SECONDS }
  } else if (w.task === 'considering' && c.leaveReason === 'refused') {
    w.emote = { anim: 'emote-no', left: EMOTE_SECONDS }
  }
  w.task = task
  w.waypoints = []
  w.unreachable = false
  w.lingerUntil = null
  w.timer = 0
  w.followTile = null
  if (w.seat && c.phase !== 'signing') {
    w.pos.x = w.seat.stand.x
    w.pos.z = w.seat.stand.z
    w.seat = null
  }

  let goals: Tile[]
  switch (c.phase) {
    case 'arriving':
      goals = [w.rng.pick(LOT_ENTRY_TILES), ...LOT_ENTRY_TILES]
      w.faceTo = null
      break
    case 'browsing': {
      const it = interactables.get(currentBrowseCarId(c) ?? '')
      if (!it) {
        w.unreachable = true // sold before they got to it
        return
      }
      // A random side of the car first, so a crowd spreads out a bit.
      goals = it.approachTiles.length > 0 ? [w.rng.pick(it.approachTiles), ...it.approachTiles] : []
      w.faceTo = interactableCenter(grid, it)
      break
    }
    case 'leaving':
      goals = [w.exit]
      w.faceTo = null
      break
    case 'following': {
      w.faceTo = null
      if (task === 'follow') return // `follow` paths to the player as they move
      // To the guest chair, by whichever side is nearest.
      const start = grid.worldToTile(w.pos.x, w.pos.z)
      const tiles = findPathToAny(grid, start, approachTilesFor(grid, GUEST_CHAIR.rect))
      if (tiles) w.waypoints = toWaypoints(grid, tiles, w.pos)
      else w.unreachable = true
      return
    }
    default:
      // Waiting for the player, talking or signing: stay put, still facing the
      // last thing they looked at.
      return
  }
  const start = grid.worldToTile(w.pos.x, w.pos.z)
  const tiles = findPathToAny(grid, start, goals.slice(0, 1)) ?? findPathToAny(grid, start, goals)
  if (tiles) w.waypoints = toWaypoints(grid, tiles, w.pos)
  else w.unreachable = true
}

/**
 * Reports progress to the store once a walker has stopped at its goal (or given
 * up on it). Called every frame while they stand still; phases with nothing to
 * report are ignored.
 */
function onArrived(c: Customer, w: Walker): void {
  const game = useGame.getState()
  switch (c.phase) {
    case 'arriving':
      game.dispatchCustomer({ type: 'arrive', id: c.id })
      break
    case 'browsing':
      if (w.unreachable || !interactables.has(currentBrowseCarId(c) ?? '')) {
        // Can't get to it, or it sold while they were on their way: move on.
        game.dispatchCustomer({ type: 'browsed', id: c.id })
      } else if (w.lingerUntil === null) {
        w.lingerUntil = gameTime.minute + w.rng.int(LINGER_MINUTES.min, LINGER_MINUTES.max)
      } else if (gameTime.minute >= w.lingerUntil) {
        game.dispatchCustomer({ type: 'browsed', id: c.id })
      }
      break
    case 'following': {
      if (w.task !== 'toChair' || w.seat) break
      const chair = rectBounds(GUEST_CHAIR.rect)
      if (Math.hypot(chair.x - w.pos.x, chair.z - w.pos.z) > SIT_REACH) break
      w.seat = { stand: { x: w.pos.x, z: w.pos.z } }
      w.pos.x = chair.x
      w.pos.z = chair.z
      w.heading = (GUEST_CHAIR.facing * Math.PI) / 2
      game.dispatchCustomer({ type: 'seat', id: c.id })
      break
    }
    case 'leaving':
      removeWalker(c.id)
      game.dispatchCustomer({ type: 'despawn', id: c.id })
      break
  }
}

/** Keeps a follower's path pointed at the player, stopping a short way off. */
function follow(w: Walker): void {
  const d = Math.hypot(playerPos.x - w.pos.x, playerPos.z - w.pos.z)
  if (d <= FOLLOW_STOP) {
    w.waypoints = []
    return
  }
  const tile = grid.worldToTile(playerPos.x, playerPos.z)
  const moved = !w.followTile || w.followTile.tx !== tile.tx || w.followTile.tz !== tile.tz
  if (d < FOLLOW_START || (w.waypoints.length > 0 && !moved)) return
  w.followTile = tile
  // The player's own tile, or next to it if they're sitting on something.
  const goals = [tile, ...approachTilesFor(grid, { ...tile, w: 1, h: 1 })]
  const tiles = findPathToAny(grid, grid.worldToTile(w.pos.x, w.pos.z), goals)
  w.waypoints = tiles ? toWaypoints(grid, tiles, w.pos) : []
}

function update(
  c: Customer,
  w: Walker,
  seconds: number,
  realSeconds: number,
  player: PlayerIntent,
): void {
  const task = taskKey(c, player)
  if (task !== w.task) plan(c, w, task)

  const turnDt = Math.min(seconds, MAX_STEP_S)
  if (w.emote) {
    w.anim.current = w.emote.anim
    w.emote.left -= realSeconds
    if (w.emote.left > 0) return
    w.emote = null
  }
  if (w.seat) {
    w.anim.current = 'sit'
    return
  }
  // Being greeted, or talking: stand still and face the player.
  if (player.targetId === c.id || CONVERSATION_PHASES.includes(c.phase)) {
    w.heading = dampAngle(w.heading, headingTo(w.pos, playerPos), TURN_RATE, turnDt)
    w.anim.current = 'idle'
    w.timer += realSeconds
    if (c.phase === 'considering' && w.timer >= CONSIDER_SECONDS) {
      useGame.getState().answerOffer(c.id)
    }
    return
  }
  if (task === 'follow') follow(w)

  let moved = 0
  let dx = 0
  let dz = 0
  for (let left = seconds; left > 1e-9 && w.waypoints.length > 0; left -= MAX_STEP_S) {
    const s = stepAlongPath(grid, w.pos, w.waypoints, CUSTOMER_SPEED, Math.min(left, MAX_STEP_S))
    w.pos.x = s.x
    w.pos.z = s.z
    moved += s.moved
    dx += s.dx
    dz += s.dz
  }

  const faceTo = task === 'follow' ? playerPos : w.faceTo
  if (moved > 1e-6) {
    w.heading = dampAngle(w.heading, Math.atan2(dx, dz), TURN_RATE, turnDt)
  } else if (faceTo) {
    w.heading = dampAngle(w.heading, headingTo(w.pos, faceTo), TURN_RATE, turnDt)
  }
  w.anim.current = moved > 1e-6 ? 'walk' : 'idle'

  if (w.waypoints.length === 0) onArrived(c, w)
}

const CustomerFigure = memo(function CustomerFigure({
  id,
  variant,
  anim,
}: {
  id: string
  variant: CustomerVariant
  anim: Walker['anim']
}) {
  // Clickable while there's something to do with them (greet, make an offer).
  const helpable = useGame((s) => {
    const c = s.customers.find((x) => x.id === id)
    return !!c && customerActions(c).length > 0
  })
  return (
    <group
      ref={(g) => {
        if (g) groups.set(id, g)
        else groups.delete(id)
      }}
    >
      <Interactable id={id} disabled={!helpable}>
        <Suspense fallback={null}>
          <Character variant={variant} anim={anim} moveSpeed={CUSTOMER_SPEED} />
        </Suspense>
      </Interactable>
      <CustomerBubble id={id} />
    </group>
  )
})

/**
 * Every customer in the world, moved by one `useFrame`: they walk in from the
 * sidewalk, browse their cars, wait, stop to talk when the player comes over,
 * follow the player to the office to sign, and walk back out. Phase changes go
 * to the store; positions stay in the walkers. Customers don't collide with each
 * other or the player.
 */
export function Customers() {
  const customers = useGame((s) => s.customers)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const realSeconds = Math.min(rawDelta, MAX_FRAME_S)
    const seconds = realSeconds * game.timeScale
    const player: PlayerIntent = {
      targetId: game.activeAction?.targetId ?? null,
      closingDeal: game.activeAction?.action === 'closeDeal',
    }
    const live = new Set<string>()
    for (const c of game.customers) {
      live.add(c.id)
      update(c, walkerFor(c), seconds, realSeconds, player)
    }
    // Anyone the store no longer knows about (despawned, or a new day) goes too.
    for (const id of walkers.keys()) if (!live.has(id)) removeWalker(id)

    for (const [id, g] of groups) {
      const w = walkers.get(id)
      if (!w) continue
      g.position.set(w.pos.x, w.seat ? SEAT_HEIGHT : 0, w.pos.z)
      g.rotation.y = w.heading
    }
  })

  return (
    <>
      {customers.map((c) => (
        <CustomerFigure key={c.id} id={c.id} variant={c.variant} anim={walkerFor(c).anim} />
      ))}
    </>
  )
}
