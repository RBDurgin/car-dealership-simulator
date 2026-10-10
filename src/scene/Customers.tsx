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
import { doorTile, serviceDoorTile } from '../sim/driving'
import type { Tile, Vec2 } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import {
  GUEST_CHAIR_ID,
  LOT_ENTRY_TILES,
  SERVICE_COUNTER_ID,
  SERVICE_WAIT_IDS,
  SIDEWALK_ENDS,
  SOFA_IDS,
  type Prop,
} from '../sim/layout'
import { findPathToAny } from '../sim/pathfinding'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { useGame } from '../state/store'
import { Character } from './Character'
import { CustomerBubble } from './CustomerBubble'
import { Interactable } from './Interactable'
import {
  ambientPos,
  atCounter,
  customerPos,
  customersAtCar,
  gameTime,
  grid,
  interactables,
  layout,
  playerPos,
  rectBounds,
  serviceCarsHome,
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
/** A guest chair by id: the office's, or a sales desk's (the wing's only once it's up). */
const guestChair = (id: string | null) => layout.props.find((p) => p.id === (id ?? GUEST_CHAIR_ID))
/** The sofas standing today: the lounge's, and the wing's once it's up. */
const sofas = () => SOFA_IDS.flatMap((id) => layout.props.filter((p) => p.id === id))
/** One seat per tile of each sofa, where buyers wait for finance, the lounge's first. */
const sofaSeats = (): Prop[] =>
  sofas().flatMap((sofa) =>
    Array.from({ length: sofa.rect.w }, (_, i) => ({
      ...sofa,
      id: `${sofa.id}-${i + 1}`,
      rect: { tx: sofa.rect.tx + i, tz: sofa.rect.tz, w: 1, h: 1 },
    })),
  )
/** Who has each sofa seat, by seat id. */
const sofaTaken = new Map<string, string>()
/** Who has each of the garage's waiting chairs, by chair id. */
const waitTaken = new Map<string, string>()
const prop = (id: string) => layout.props.find((p) => p.id === id)

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
  /** A service client's waiting chair in the garage, heading to it or sitting in it. */
  waitChair: Prop | null
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
const inCar = (c: Customer) =>
  (!!c.vehicle && !c.vehicle.parked) || (!!c.service && !c.service.parked)

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
  // A service client steps out of their car, or walks back in for it later.
  const serviceDoor = c.service && !c.service.returned ? serviceDoorTile(c.service.spot) : null
  const spawn = c.vehicle
    ? doorTile(c.vehicle.spot)
    : serviceDoor
      ? serviceDoor
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
    waitChair: null,
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

/** Gives up their waiting chair in the garage, if they have one. */
function leaveWaitChair(w: CustomerWalker): void {
  if (w.waitChair) waitTaken.delete(w.waitChair.id)
  w.waitChair = null
}

function removeWalker(id: string): void {
  const w = walkers.get(id)
  if (w) leaveSofa(w)
  if (w) leaveWaitChair(w)
  atCounter.delete(id)
  walkers.delete(id)
  customerPos.delete(id)
  customersAtCar.delete(id)
  releaseWalker(id)
  // Their companion goes with them.
  const m = companions.get(id)
  if (m) ambientPos.delete(m.id)
  companions.delete(id)
}

/**
 * A service client's task: to the counter to check in, then to a waiting
 * chair (or off down the sidewalk, leaving the car), and to their car once
 * it's `ready`.
 */
function serviceTask(c: Customer, ready: ReadonlySet<string>): string {
  switch (c.phase) {
    case 'waiting':
      return 'toCounter'
    case 'servicing':
      if (ready.has(c.id)) return 'collect'
      return c.service!.dropOff && !c.service!.returned ? 'goAway' : 'waitChair'
    case 'leaving':
      return 'leave'
    default:
      return c.phase
  }
}

/** What they're doing in the world. A new key means they need a new path. */
function taskKey(c: Customer, player: PlayerIntent, ready: ReadonlySet<string>): string {
  if (c.service) return serviceTask(c, ready)
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
  if (w.task === 'considering' && (c.phase === 'following' || c.phase === 'servicing')) {
    w.emote = { anim: 'emote-yes', left: EMOTE_SECONDS }
  } else if (
    w.task === 'considering' &&
    (c.leaveReason === 'refused' || c.leaveReason === 'declined')
  ) {
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
  if (task !== 'waitChair') leaveWaitChair(w)
  atCounter.delete(c.id)
  if (c.service) return planService(c, w, task)

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
      // Back to their car, if they came in one. A seller who sold us theirs,
      // or a buyer who traded theirs in, walks off down the sidewalk.
      goals = c.vehicle || !(c.selling || c.trade) ? [w.exit] : [w.rng.pick(SIDEWALK_ENDS)]
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
      // A free sofa seat; with the sofas full they stand by the lounge's.
      const seat = sofaSeats().find((p) => !sofaTaken.has(p.id))
      w.faceTo = null
      if (seat) {
        sofaTaken.set(seat.id, c.id)
        w.sofaSeat = seat
      }
      pathTo(w, approachTilesFor(grid, (seat ?? sofas()[0]).rect))
      return
    }
    default:
      // Waiting for the player, talking or signing: stay put, still facing the
      // last thing they looked at.
      return
  }
  pathTo(w, goals, true)
}

/** Starts a service client walking toward the goal for `task`. */
function planService(c: Customer, w: CustomerWalker, task: string): void {
  const counter = prop(SERVICE_COUNTER_ID)
  w.faceTo = null
  switch (task) {
    case 'toCounter':
      // The front of the counter, facing it.
      if (!counter) return
      w.faceTo = rectBounds(counter.rect)
      pathTo(
        w,
        approachTilesFor(grid, counter.rect).filter((t) => t.tz > counter.rect.tz),
      )
      return
    case 'waitChair': {
      // A free chair; with them all taken, they stand by the counter.
      const chair = SERVICE_WAIT_IDS.map(prop).find((p) => p && !waitTaken.has(p.id))
      if (chair) {
        waitTaken.set(chair.id, c.id)
        w.waitChair = chair
      }
      const near = chair ?? counter
      if (near) pathTo(w, approachTilesFor(grid, near.rect))
      return
    }
    case 'goAway':
      pathTo(w, [w.rng.pick(SIDEWALK_ENDS), ...SIDEWALK_ENDS], true)
      return
    case 'collect':
    case 'leave':
      pathTo(w, [serviceDoorTile(c.service!.spot)], true)
      return
    default:
      // Being checked in: stay put.
      return
  }
}

/** Reports a service client's progress once they've stopped at their goal. */
function onServiceArrived(c: Customer, w: CustomerWalker): void {
  const game = useGame.getState()
  switch (w.task) {
    case 'toCounter':
      atCounter.add(c.id)
      break
    case 'waitChair':
      if (w.waitChair && !w.seat) sitOn(w, w.waitChair)
      break
    case 'goAway':
      game.serviceWentAway(c.id)
      break
    case 'collect':
      // They wait by the space until the car is back in it.
      if (serviceCarsHome.has(c.id)) game.serviceCollect(c.id)
      break
    case 'leave':
      // The car may still be on its way back from a bay.
      if (!serviceCarsHome.has(c.id)) break
      removeWalker(c.id)
      game.dispatchCustomer({ type: 'droveOff', id: c.id })
      break
  }
}

/**
 * Reports progress to the store once a walker has stopped at its goal (or given
 * up on it). Called every frame while they stand still; phases with nothing to
 * report are ignored.
 */
function onArrived(c: Customer, w: CustomerWalker): void {
  if (c.service) return onServiceArrived(c, w)
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
  ready: ReadonlySet<string>,
): void {
  const task = taskKey(c, player, ready)
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
    return !!c && customerActions(c, s.serviceJobs).length > 0
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
    // Service clients whose car is done.
    const ready = new Set(
      game.serviceJobs.flatMap((j) => (j.status === 'ready' && j.customerId ? [j.customerId] : [])),
    )
    const live = new Set<string>()
    for (const c of game.customers) {
      if (inCar(c)) continue
      live.add(c.id)
      const w = walkerFor(c)
      update(c, w, seconds, realSeconds, player, ready)
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
