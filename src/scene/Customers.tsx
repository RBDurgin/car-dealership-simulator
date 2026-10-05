import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import { toWaypoints } from '../sim/agent'
import type { CharacterAnim } from '../sim/characters'
import {
  currentBrowseCarId,
  CUSTOMER_SPEED,
  LINGER_MINUTES,
  PLAYER_ID,
  staffHandled,
  type Customer,
  type CustomerVariant,
} from '../sim/customers'
import { CONVERSATION_PHASES, customerActions } from '../sim/deal'
import type { Tile, Vec2 } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import { GUEST_CHAIR_ID, LOT_ENTRY_TILES, PROPS, SIDEWALK_ENDS, type Prop } from '../sim/layout'
import { findPathToAny } from '../sim/pathfinding'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { useGame } from '../state/store'
import { Character } from './Character'
import { CustomerBubble } from './CustomerBubble'
import { Interactable } from './Interactable'
import {
  customerPos,
  customersAtCar,
  gameTime,
  grid,
  interactables,
  playerPos,
  staffPos,
} from './runtime'
import {
  createWalker,
  crowdCost,
  frameSeconds,
  inwardHeading,
  pathTo,
  releaseWalker,
  sitOn,
  standUp,
  syncGroups,
  turnToward,
  walk,
  type Walker,
} from './walker'

/** Real seconds a customer thinks over an offer before answering. */
const CONSIDER_SECONDS = 1.5
/** Real seconds of nodding or shaking their head after answering (two loops of the clip). */
const EMOTE_SECONDS = 1.3
/** A follower stops this close to the player, and sets off again once they're this far. */
const FOLLOW_STOP = 1.3
const FOLLOW_START = 2
/** A guest chair by id: the office's, or a sales desk's. */
const guestChair = (id: string | null) => PROPS.find((p) => p.id === (id ?? GUEST_CHAIR_ID))
const SOFA = PROPS.find((p) => p.id === 'lounge-sofa')!
/** One seat per tile of the lounge sofa, where buyers wait for finance. */
const SOFA_SEATS: Prop[] = Array.from({ length: SOFA.rect.w }, (_, i) => ({
  ...SOFA,
  id: `${SOFA.id}-${i + 1}`,
  rect: { tx: SOFA.rect.tx + i, tz: SOFA.rect.tz, w: 1, h: 1 },
}))
/** Who has each sofa seat, by seat id. */
const sofaTaken = new Map<string, string>()

/** What the player is up to, as far as customers care. */
interface PlayerIntent {
  /** Whoever the player's current action is aimed at. */
  targetId: string | null
  /** Heading to the desk to close a deal: their buyer goes to the guest chair. */
  closingDeal: boolean
}

/** A customer's body in the world. Positions and timers stay here, never in the store. */
interface CustomerWalker extends Walker {
  /** World-side randomness (spawn side, which side of a car to stand on, linger time). */
  rng: Rng
  exit: Tile
  task: string | null
  /** Game minute they're done looking at the current car, once they're there. */
  lingerUntil: number | null
  /** Real seconds spent on the current task (for thinking over an offer). */
  timer: number
  /** A short nod or head shake that plays before anything else. */
  emote: { anim: CharacterAnim; left: number } | null
  /** The player's tile when a follower last planned a path to them. */
  followTile: Tile | null
  /** The sofa seat they're heading to or sitting on while waiting for finance. */
  sofaSeat: Prop | null
}

const walkers = new Map<string, CustomerWalker>()
const groups = new Map<string, Group>()

/** The customer's walker, created at a sidewalk end on first sight. */
function walkerFor(c: Customer): CustomerWalker {
  let w = walkers.get(c.id)
  if (w) return w
  const rng = createRng(hashSeed(c.id))
  const spawn = rng.pick(SIDEWALK_ENDS)
  // They leave the way they came, on either lane.
  const exit = rng.pick(SIDEWALK_ENDS.filter((t) => t.tx === spawn.tx))
  w = {
    ...createWalker(c.id, spawn, inwardHeading(spawn)),
    rng,
    exit,
    task: null,
    lingerUntil: null,
    timer: 0,
    emote: null,
    followTile: null,
    sofaSeat: null,
  }
  walkers.set(c.id, w)
  customerPos.set(c.id, w.pos)
  return w
}

/** Gives up their sofa seat, if they have one. */
function leaveSofa(w: CustomerWalker): void {
  if (w.sofaSeat) sofaTaken.delete(w.sofaSeat.id)
  w.sofaSeat = null
}

function removeWalker(id: string): void {
  const w = walkers.get(id)
  if (w) leaveSofa(w)
  walkers.delete(id)
  customerPos.delete(id)
  customersAtCar.delete(id)
  releaseWalker(id)
}

/** What they're doing in the world. A new key means they need a new path. */
function taskKey(c: Customer, player: PlayerIntent): string {
  switch (c.phase) {
    case 'arriving':
      return 'arrive'
    case 'browsing':
      return `browse:${c.browsed}`
    case 'following':
      // Sent to a desk by staff, or the player is taking them to sign. A
      // salesperson's buyer waits to be told where to go.
      if (staffHandled(c)) return c.chairId ? `toChair:${c.chairId}` : 'awaitLead'
      return player.closingDeal ? `toChair:${GUEST_CHAIR_ID}` : 'follow'
    case 'queued':
      return 'toSofa'
    case 'leaving':
      return 'leave'
    default:
      return c.phase
  }
}

/** Starts walking toward the goal for the customer's current task, from wherever they are. */
function plan(c: Customer, w: CustomerWalker, task: string): void {
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
  customersAtCar.delete(c.id)
  w.timer = 0
  w.followTile = null
  if (c.phase !== 'signing') standUp(w)
  if (task !== 'toSofa') leaveSofa(w)

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
      // A random free side of the car first, so a crowd spreads out.
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
      if (task === 'follow') {
        releaseWalker(c.id) // `follow` paths to the player as they move
        return
      }
      if (task === 'awaitLead') return
      // To the guest chair, by whichever side is nearest.
      const chair = guestChair(c.chairId)
      if (chair) pathTo(w, approachTilesFor(grid, chair.rect))
      return
    }
    case 'queued': {
      // A free sofa seat; with the sofa full they stand by it.
      const seat = SOFA_SEATS.find((p) => !sofaTaken.has(p.id))
      w.faceTo = null
      if (seat) {
        sofaTaken.set(seat.id, c.id)
        w.sofaSeat = seat
      }
      pathTo(w, approachTilesFor(grid, (seat ?? SOFA).rect))
      return
    }
    default:
      // Waiting for the player, talking or signing: stay put, still facing the
      // last thing they looked at.
      return
  }
  pathTo(w, goals, true)
}

/**
 * Reports progress to the store once a walker has stopped at its goal (or given
 * up on it). Called every frame while they stand still; phases with nothing to
 * report are ignored.
 */
function onArrived(c: Customer, w: CustomerWalker): void {
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
        customersAtCar.add(c.id)
      } else if (gameTime.minute >= w.lingerUntil) {
        game.dispatchCustomer({ type: 'browsed', id: c.id })
      }
      break
    case 'following': {
      if (!w.task?.startsWith('toChair:') || w.seat) break
      const chair = guestChair(w.task.slice('toChair:'.length))
      if (!chair || !sitOn(w, chair)) break
      game.dispatchCustomer({ type: 'seat', id: c.id })
      break
    }
    case 'queued':
      if (w.sofaSeat) sitOn(w, w.sofaSeat)
      break
    case 'leaving':
      removeWalker(c.id)
      game.dispatchCustomer({ type: 'despawn', id: c.id })
      break
  }
}

/** Keeps a follower's path pointed at the player, stopping a short way off. */
function follow(w: CustomerWalker): void {
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
  const tiles = findPathToAny(grid, grid.worldToTile(w.pos.x, w.pos.z), goals, crowdCost(w.id))
  w.waypoints = tiles ? toWaypoints(grid, tiles, w.pos) : []
}

/** Where whoever is helping them stands: a salesperson, or the player. */
function handlerPos(c: Customer): Vec2 {
  if (c.handlerId && c.handlerId !== PLAYER_ID) return staffPos.get(c.handlerId) ?? playerPos
  return playerPos
}

/**
 * Someone is on their way over or talking with them, so they stand still and
 * face them: the player heading over to greet, a salesperson who claimed them,
 * a conversation, or a salesperson's buyer waiting to be shown to a desk.
 */
function attending(c: Customer, task: string, player: PlayerIntent): boolean {
  if (player.targetId === c.id || CONVERSATION_PHASES.includes(c.phase)) return true
  if (task === 'awaitLead') return true
  return staffHandled(c) && (c.phase === 'browsing' || c.phase === 'waiting')
}

function update(
  c: Customer,
  w: CustomerWalker,
  seconds: number,
  realSeconds: number,
  player: PlayerIntent,
): void {
  const task = taskKey(c, player)
  if (task !== w.task) plan(c, w, task)

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
  // Being greeted, or talking: stand still and face whoever is helping them.
  if (attending(c, task, player)) {
    turnToward(w, handlerPos(c), seconds)
    w.anim.current = 'idle'
    w.timer += realSeconds
    if (c.phase === 'considering' && w.timer >= CONSIDER_SECONDS) {
      useGame.getState().answerOffer(c.id)
    }
    return
  }
  if (task === 'follow') follow(w)
  walk(w, CUSTOMER_SPEED, seconds, task === 'follow' ? playerPos : w.faceTo)
  if (w.waypoints.length === 0) onArrived(c, w)
}

const CustomerFigure = memo(function CustomerFigure({
  id,
  variant,
  anim,
}: {
  id: string
  variant: CustomerVariant
  anim: CustomerWalker['anim']
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
 * sidewalk, browse their cars, wait, stop to talk when the player or a
 * salesperson comes over, follow the player to the office to sign (or walk to
 * a salesperson's desk, or wait on the lounge sofa until finance calls them),
 * and walk back out. Phase changes go
 * to the store; positions stay in the walkers. Customers spread out around cars
 * and step around each other, staff and the player (see `sim/crowd.ts`).
 */
export function Customers() {
  const customers = useGame((s) => s.customers)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const { realSeconds, seconds } = frameSeconds(rawDelta, game.timeScale)
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
    syncGroups(groups, walkers)
  })

  return (
    <>
      {customers.map((c) => (
        <CustomerFigure key={c.id} id={c.id} variant={c.variant} anim={walkerFor(c).anim} />
      ))}
    </>
  )
}
