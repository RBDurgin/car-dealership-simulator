import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import { toWaypoints } from '../sim/agent'
import { ARCHETYPES } from '../sim/archetypes'
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
import { doorTile } from '../sim/driving'
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
  ambientPos,
  customerPos,
  customersAtCar,
  gameTime,
  grid,
  interactables,
  playerPos,
  staffPos,
  walkInSpawns,
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
/** A couple's companion walks a touch faster, so they catch up when left behind. */
const COMPANION_SPEED = CUSTOMER_SPEED * 1.15
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

/** A couple's other half: tags along after the customer, with no state of their own. */
interface Companion extends Walker {
  /** The customer's tile when the companion last planned a path to them. */
  followTile: Tile | null
}

const walkers = new Map<string, CustomerWalker>()
const groups = new Map<string, Group>()
/** Companions and their scene groups, by the customer they're with. */
const companions = new Map<string, Companion>()
const companionGroups = new Map<string, Group>()

/** Still driving in: they're in their car (scene/DrivenCar), not on foot. */
const inCar = (c: Customer) => !!c.vehicle && !c.vehicle.parked

/**
 * The customer's walker, created on first sight: at a sidewalk end, where
 * they were on the sidewalk if they're a passer-by who walked in, or behind
 * their car once they've parked.
 */
function walkerFor(c: Customer): CustomerWalker {
  let w = walkers.get(c.id)
  if (w) return w
  const rng = createRng(hashSeed(c.id))
  const walkIn = walkInSpawns.get(c.id)
  walkInSpawns.delete(c.id)
  const spawn = c.vehicle
    ? doorTile(c.vehicle.spot)
    : walkIn
      ? grid.worldToTile(walkIn.pos.x, walkIn.pos.z)
      : rng.pick(SIDEWALK_ENDS)
  // They leave the way they came: back to their car, or on either lane of the
  // sidewalk; a passer-by carries on their way.
  const exit = c.vehicle
    ? spawn
    : (walkIn?.exit ?? rng.pick(SIDEWALK_ENDS.filter((t) => t.tx === spawn.tx)))
  w = {
    // A driver steps out facing the showroom.
    ...createWalker(c.id, spawn, c.vehicle ? Math.PI : (walkIn?.heading ?? inwardHeading(spawn))),
    rng,
    exit,
    task: null,
    lingerUntil: null,
    timer: 0,
    emote: null,
    followTile: null,
    sofaSeat: null,
  }
  if (walkIn) w.pos = { ...walkIn.pos }
  walkers.set(c.id, w)
  customerPos.set(c.id, w.pos)
  return w
}

/** A couple's companion, created next to the customer on first sight. Null for anyone alone. */
function companionFor(c: Customer, lead: CustomerWalker): Companion | null {
  if (!c.companion) return null
  let m = companions.get(c.id)
  if (m) return m
  const tile = grid.worldToTile(lead.pos.x, lead.pos.z)
  m = { ...createWalker(`${c.id}:companion`, tile, lead.heading), followTile: null }
  companions.set(c.id, m)
  ambientPos.set(m.id, m.pos)
  return m
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
  // Their companion goes with them.
  const m = companions.get(id)
  if (m) ambientPos.delete(m.id)
  companions.delete(id)
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
  // Just answered an offer: nod or shake their head first. A counter gets a
  // single "hmm, not quite" shake, and they stay to talk it over.
  if (w.task === 'considering' && c.phase === 'following') {
    w.emote = { anim: 'emote-yes', left: EMOTE_SECONDS }
  } else if (w.task === 'considering' && c.leaveReason === 'refused') {
    w.emote = { anim: 'emote-no', left: EMOTE_SECONDS }
  } else if (w.task === 'considering' && c.phase === 'talking') {
    w.emote = { anim: 'emote-no', left: EMOTE_SECONDS / 2 }
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
      // Back to their car, if they came in one.
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
        const minutes = w.rng.int(LINGER_MINUTES.min, LINGER_MINUTES.max)
        w.lingerUntil = gameTime.minute + minutes * ARCHETYPES[c.archetype].linger
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
      // A driver gets in, and scene/DrivenCar takes the car away.
      game.dispatchCustomer({ type: c.vehicle ? 'droveOff' : 'despawn', id: c.id })
      break
  }
}

/**
 * Keeps a follower's path pointed at `target` (the player, or a companion's
 * customer), stopping a short way off.
 */
function follow(w: Walker & { followTile: Tile | null }, target: Vec2): void {
  const d = Math.hypot(target.x - w.pos.x, target.z - w.pos.z)
  if (d <= FOLLOW_STOP) {
    w.waypoints = []
    return
  }
  const tile = grid.worldToTile(target.x, target.z)
  const moved = !w.followTile || w.followTile.tx !== tile.tx || w.followTile.tz !== tile.tz
  if (d < FOLLOW_START || (w.waypoints.length > 0 && !moved)) return
  w.followTile = tile
  // Their own tile, or next to it if they're sitting on something.
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
  if (task === 'follow') follow(w, playerPos)
  walk(w, CUSTOMER_SPEED, seconds, task === 'follow' ? playerPos : w.faceTo)
  if (w.waypoints.length === 0) onArrived(c, w)
}

/**
 * A companion sticks with their customer, and once they've caught up looks at
 * whatever the customer is looking at: the car, or whoever is helping them.
 */
function updateCompanion(
  c: Customer,
  lead: CustomerWalker,
  m: Companion,
  seconds: number,
  player: PlayerIntent,
): void {
  follow(m, lead.pos)
  const look = attending(c, lead.task ?? '', player) ? handlerPos(c) : (lead.faceTo ?? lead.pos)
  walk(m, COMPANION_SPEED, seconds, look)
}

const CustomerFigure = memo(function CustomerFigure({
  id,
  variant,
  anim,
  companionVariant,
  companionAnim,
}: {
  id: string
  variant: CustomerVariant
  anim: Walker['anim']
  /** A couple's other half, who walks separately but hovers and clicks as one with them. */
  companionVariant: CustomerVariant | null
  companionAnim: Walker['anim'] | null
}) {
  // Clickable while there's something to do with them (greet, make an offer).
  const helpable = useGame((s) => {
    const c = s.customers.find((x) => x.id === id)
    return !!c && customerActions(c).length > 0
  })
  return (
    <>
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
      {companionVariant && companionAnim && (
        <group
          ref={(g) => {
            if (g) companionGroups.set(id, g)
            else companionGroups.delete(id)
          }}
        >
          <Interactable id={id} disabled={!helpable}>
            <Suspense fallback={null}>
              <Character
                variant={companionVariant}
                anim={companionAnim}
                moveSpeed={COMPANION_SPEED}
              />
            </Suspense>
          </Interactable>
        </group>
      )}
    </>
  )
})

/**
 * Every customer in the world, moved by one `useFrame`: they walk in from the
 * sidewalk (a passer-by who wandered in picks up from where they were), with a
 * couple's companion tagging along, browse their cars, wait, stop to talk when the player or a
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
      if (inCar(c)) continue
      live.add(c.id)
      const w = walkerFor(c)
      update(c, w, seconds, realSeconds, player)
      // Removed if they just walked off the map.
      const m = walkers.has(c.id) && companionFor(c, w)
      if (m) updateCompanion(c, w, m, seconds, player)
    }
    // Anyone the store no longer knows about (despawned, or a new day) goes too.
    for (const id of walkers.keys()) if (!live.has(id)) removeWalker(id)
    syncGroups(groups, walkers)
    syncGroups(companionGroups, companions)
  })

  return (
    <>
      {customers
        .filter((c) => !inCar(c))
        .map((c) => {
          const w = walkerFor(c)
          const m = companionFor(c, w)
          return (
            <CustomerFigure
              key={c.id}
              id={c.id}
              variant={c.variant}
              anim={w.anim}
              companionVariant={c.companion}
              companionAnim={m?.anim ?? null}
            />
          )
        })}
    </>
  )
}
