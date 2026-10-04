import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import { dampAngle, headingTo, stepAlongPath, toWaypoints } from '../sim/agent'
import type { CharacterAnim } from '../sim/characters'
import {
  currentBrowseCarId,
  CUSTOMER_SPEED,
  LINGER_MINUTES,
  type Customer,
  type CustomerVariant,
} from '../sim/customers'
import type { Tile, Vec2 } from '../sim/grid'
import { interactableCenter } from '../sim/interactables'
import { LOT_ENTRY_TILES, SIDEWALK_ENDS } from '../sim/layout'
import { findPathToAny } from '../sim/pathfinding'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { useGame } from '../state/store'
import { Character } from './Character'
import { CustomerBubble } from './CustomerBubble'
import { customerPos, gameTime, grid, interactables } from './runtime'

const TURN_RATE = 10
/** Movement is integrated in steps no longer than this, so a sped-up clock stays stable. */
const MAX_STEP_S = 0.05
/**
 * Real seconds per frame at most, before the dev time scale. Matches GameClock so
 * linger timers (game minutes) and walking (real seconds) keep pace at a low frame rate.
 */
const MAX_FRAME_S = 0.25

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
function taskKey(c: Customer): string {
  switch (c.phase) {
    case 'arriving':
      return 'arrive'
    case 'browsing':
      return `browse:${c.browsed}`
    case 'leaving':
      return 'leave'
    default:
      return c.phase
  }
}

/** Starts walking toward the goal for the customer's current phase, from wherever they are. */
function plan(c: Customer, w: Walker): void {
  w.task = taskKey(c)
  w.waypoints = []
  w.unreachable = false
  w.lingerUntil = null

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
    default:
      // Waiting for the player, or (from 2e) in a conversation: stay put, still
      // facing the last car they looked at.
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
    case 'leaving':
      removeWalker(c.id)
      game.dispatchCustomer({ type: 'despawn', id: c.id })
      break
  }
}

function update(c: Customer, w: Walker, seconds: number): void {
  if (taskKey(c) !== w.task) plan(c, w)

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

  const turnDt = Math.min(seconds, MAX_STEP_S)
  if (moved > 1e-6) {
    w.heading = dampAngle(w.heading, Math.atan2(dx, dz), TURN_RATE, turnDt)
  } else if (w.faceTo) {
    w.heading = dampAngle(w.heading, headingTo(w.pos, w.faceTo), TURN_RATE, turnDt)
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
  return (
    <group
      ref={(g) => {
        if (g) groups.set(id, g)
        else groups.delete(id)
      }}
    >
      <Suspense fallback={null}>
        <Character variant={variant} anim={anim} moveSpeed={CUSTOMER_SPEED} />
      </Suspense>
      <CustomerBubble id={id} />
    </group>
  )
})

/**
 * Every customer in the world, moved by one `useFrame`: they walk in from the
 * sidewalk, browse their cars, wait, and walk back out. Phase changes go to the
 * store; positions stay in the walkers. Customers don't collide with each other
 * or the player.
 */
export function Customers() {
  const customers = useGame((s) => s.customers)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const seconds = Math.min(rawDelta, MAX_FRAME_S) * game.timeScale
    const live = new Set<string>()
    for (const c of game.customers) {
      live.add(c.id)
      update(c, walkerFor(c), seconds)
    }
    // Anyone the store no longer knows about (despawned, or a new day) goes too.
    for (const id of walkers.keys()) if (!live.has(id)) removeWalker(id)

    for (const [id, g] of groups) {
      const w = walkers.get(id)
      if (!w) continue
      g.position.set(w.pos.x, 0, w.pos.z)
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
