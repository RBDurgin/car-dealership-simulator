import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import type { Customer } from '../sim/customers'
import { hasBuyersInHand } from '../sim/deal'
import type { Tile, Vec2 } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import { expansionsUp } from '../sim/expansions'
import {
  GARAGE,
  GARAGE_STANDBY_TILES,
  GUARD_PATROL_TILES,
  patrolTiles,
  PORTER_STANDBY_TILES,
  SERVICE_BAYS,
  SIDEWALK_ENDS,
} from '../sim/layout'
import { JAGUAR_ID } from '../sim/jaguar'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { buyBlocker } from '../sim/sellers'
import {
  financeSeconds,
  GUARD_CHASE_SPEED,
  PORTER_WASH_SECONDS,
  postChairId,
  ROLE_BADGES,
  SALES_COUNTER_SECONDS,
  SALES_PITCH_SECONDS,
  SALES_SIGN_SECONDS,
  skillSeconds,
  STAFF_SPEED,
  type Employee,
  type Role,
} from '../sim/staff'
import { bayCount } from '../sim/service'
import {
  nextGuardTask,
  nextMechanicTask,
  nextPorterTask,
  nextSalesTask,
  type SalesTask,
} from '../sim/staffAi'
import { useGame } from '../state/store'
import { Character } from './Character'
import { Interactable } from './Interactable'
import {
  ambientPos,
  customerPos,
  customersAtCar,
  grid,
  interactables,
  layout,
  staffPos,
} from './runtime'
import {
  createWalker,
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

/** Just above a ~1.2 unit tall character's head, like customer bubbles. */
const BADGE_HEIGHT = 1.5
/** Where staff without a chair to work from stand: by the reception desk. */
const STANDBY_TILES: Tile[] = [
  { tx: 18, tz: 11 },
  { tx: 19, tz: 11 },
  { tx: 18, tz: 12 },
  { tx: 19, tz: 12 },
]
/** What standby staff face: the middle of the showroom. */
const SHOWROOM_CENTER = grid.tileToWorld(22, 8)
/** What the porter faces while waiting for a car to need a wash: the lot. */
const LOT_CENTER = grid.tileToWorld(20, 18)
/** What mechanics waiting for work face: the middle of the garage. */
const GARAGE_CENTER = grid.tileToWorld(GARAGE.tx + GARAGE.w / 2, GARAGE.tz + GARAGE.h / 2)
/** Game seconds the guard stands at each patrol stop, looking over the lot. */
const PATROL_PAUSE_SECONDS = 5
/** Close enough to Jaguar for the guard to run him off. */
const CATCH_REACH = 1.2
/** Chasing Jaguar: game seconds between new paths to where he is now. */
const CHASE_REPLAN_SECONDS = 0.4

/** Where staff without a chair wait, and what they face. */
function standby(e: Employee): { tiles: Tile[]; faceTo: Vec2 } {
  if (e.role === 'porter') return { tiles: PORTER_STANDBY_TILES, faceTo: LOT_CENTER }
  if (e.role === 'security') return { tiles: GUARD_PATROL_TILES, faceTo: LOT_CENTER }
  if (e.role === 'mechanic') return { tiles: GARAGE_STANDBY_TILES, faceTo: GARAGE_CENTER }
  return { tiles: STANDBY_TILES, faceTo: SHOWROOM_CENTER }
}

/** An employee's body in the world. Positions stay here, never in the store. */
interface StaffWalker extends Walker {
  rng: Rng
  exit: Tile
  /**
   * 'post' (going to or at their post), 'leave', a salesperson's task with
   * its customer (`greet:customer-3`), or the car a porter is washing
   * (`wash:lot-car-2`). A new task means a new path.
   */
  task: string | null
  /** Finance: the buyer whose paperwork is under way, and game seconds left on it. */
  paperwork: { customerId: string; left: number } | null
  /**
   * Game seconds spent on the current task (a salesperson's pitch or paperwork,
   * a wash, a guard's stop), or until a chasing guard's next new path.
   */
  timer: number
  /** A guard's patrol stops reached so far. */
  leg: number
  /** Customers (or, for the porter, cars) they couldn't get to; they leave them be. */
  unreachableIds: Set<string>
}

const walkers = new Map<string, StaffWalker>()
const groups = new Map<string, Group>()

function walkerFor(e: Employee): StaffWalker {
  let w = walkers.get(e.id)
  if (w) return w
  const rng = createRng(hashSeed(e.id))
  const spawn = rng.pick(SIDEWALK_ENDS)
  const exit = rng.pick(SIDEWALK_ENDS.filter((t) => t.tx === spawn.tx))
  w = {
    ...createWalker(e.id, spawn, inwardHeading(spawn)),
    rng,
    exit,
    task: null,
    paperwork: null,
    timer: 0,
    leg: 0,
    unreachableIds: new Set(),
  }
  walkers.set(e.id, w)
  staffPos.set(e.id, w.pos)
  return w
}

function removeWalker(id: string): void {
  walkers.delete(id)
  staffPos.delete(id)
  releaseWalker(id)
}

/** A prop standing today (the wing's desks only once it's up). */
const propById = (id: string | null) => (id ? layout.props.find((p) => p.id === id) : undefined)
const postChair = (e: Employee) => {
  const game = useGame.getState()
  return propById(postChairId(e, game.roster, expansionsUp(game)))
}

function plan(e: Employee, w: StaffWalker, task: string): void {
  w.task = task
  w.timer = 0
  standUp(w)
  if (task === 'leave') {
    w.faceTo = null
    pathTo(w, [w.exit])
    return
  }
  const chair = postChair(e)
  if (chair) {
    w.faceTo = null
    pathTo(w, approachTilesFor(grid, chair.rect))
  } else {
    const { tiles, faceTo } = standby(e)
    w.faceTo = faceTo
    pathTo(w, [w.rng.pick(tiles), ...tiles], true)
  }
}

/** Reports progress once they've stopped at their goal (or given up on it). */
function onArrived(e: Employee, w: StaffWalker): void {
  const game = useGame.getState()
  if (w.task === 'leave') {
    removeWalker(e.id)
    game.dispatchStaff({ type: 'left', id: e.id })
    return
  }
  const chair = postChair(e)
  // Can't reach the chair: work standing up rather than not at all.
  if (chair && !w.seat) sitOn(w, chair)
  if (e.status === 'arriving') game.dispatchStaff({ type: 'atPost', id: e.id })
}

/**
 * The finance manager at their desk works through the paperwork of the buyer
 * sitting opposite, and signs it off once done.
 */
function doPaperwork(
  e: Employee,
  w: StaffWalker,
  seconds: number,
  customers: readonly Customer[],
): void {
  const c = customers.find((x) => x.handlerId === e.id && x.phase === 'signing')
  if (!c) {
    w.paperwork = null
    return
  }
  if (w.paperwork?.customerId !== c.id) {
    w.paperwork = { customerId: c.id, left: financeSeconds(e.skill) }
  }
  w.paperwork.left -= seconds
  if (w.paperwork.left > 0) return
  w.paperwork = null
  useGame.getState().staffSign(e.id, c.id)
}

/** The key a salesperson's task is planned under: a new key means a new path. */
const salesKey = (t: SalesTask) => (t.kind === 'idle' ? 'post' : `${t.kind}:${t.customerId}`)

/**
 * A salesperson's next move: claim a customer and walk over (`greet`), talk
 * up the car and make an offer (`offer`), send a buyer to finance or their desk
 * (`lead`), then sit down and sign (`sign`). Between customers they sit at
 * their desk (`post`).
 */
function updateSales(
  e: Employee,
  w: StaffWalker,
  seconds: number,
  customers: readonly Customer[],
): void {
  const game = useGame.getState()
  const task = nextSalesTask(e, customers, {
    roster: game.roster,
    playerTargetId: game.activeAction?.targetId ?? null,
    exclude: w.unreachableIds,
    atCar: customersAtCar,
    buying: !buyBlocker(game),
    expansions: expansionsUp(game),
  })
  if (
    task.kind === 'greet' &&
    !customers.some((c) => c.id === task.customerId && c.handlerId === e.id)
  ) {
    // Somebody new: claim them first. Someone else got there first: try again next frame.
    if (!game.staffClaim(e.id, task.customerId)) return
  }
  if (task.kind === 'lead') return game.staffLead(e.id)

  const key = salesKey(task)
  if (key !== w.task) planSales(e, w, task, key)
  if (task.kind === 'idle') return updatePost(e, w, seconds)

  if (task.kind === 'greet') {
    walk(w, STAFF_SPEED, seconds, customerPos.get(task.customerId) ?? null)
    if (w.waypoints.length > 0) return
    if (w.unreachable) {
      // Leave them to someone who can get to them.
      w.unreachableIds.add(task.customerId)
      game.dispatchCustomer({ type: 'cancel', id: task.customerId })
      return
    }
    game.staffGreet(e.id)
    return
  }
  if (task.kind === 'offer') {
    const at = customerPos.get(task.customerId)
    if (at) turnToward(w, at, seconds)
    w.anim.current = 'idle'
    // The clock starts over each time they get an answer: a counter brings a quicker re-pitch.
    const c = customers.find((x) => x.id === task.customerId)
    if (c?.phase !== 'talking') {
      w.timer = 0
      return
    }
    w.timer += seconds
    const base = c.haggle ? SALES_COUNTER_SECONDS : SALES_PITCH_SECONDS
    if (w.timer >= skillSeconds(base, e.skill)) game.staffOffer(e.id)
    return
  }
  // sign: to their desk chair, then the paperwork once the buyer sits down.
  if (!w.seat) {
    walk(w, STAFF_SPEED, seconds, null)
    if (w.waypoints.length > 0) return
    const chair = propById(task.chairId)
    if (chair) sitOn(w, chair)
  } else {
    w.anim.current = 'sit'
  }
  const c = customers.find((x) => x.id === task.customerId)
  if (c?.phase !== 'signing') return
  w.timer += seconds
  if (w.timer >= skillSeconds(SALES_SIGN_SECONDS, e.skill)) game.staffSign(e.id, c.id)
}

/** Sets off on a salesperson's new task. */
function planSales(e: Employee, w: StaffWalker, task: SalesTask, key: string): void {
  if (task.kind === 'idle') return plan(e, w, 'post')
  w.task = key
  w.timer = 0
  w.faceTo = null
  if (task.kind === 'offer') {
    w.waypoints = []
    return
  }
  standUp(w)
  if (task.kind === 'greet') {
    const at = customerPos.get(task.customerId)
    const tile = at && grid.worldToTile(at.x, at.z)
    if (tile) pathTo(w, approachTilesFor(grid, { ...tile, w: 1, h: 1 }))
    else w.unreachable = true
    return
  }
  if (task.kind === 'sign') {
    const chair = propById(task.chairId)
    if (chair) pathTo(w, approachTilesFor(grid, chair.rect))
  }
}

const WASH_PREFIX = 'wash:'

/** The cars porters other than `id` are washing. */
function washesBesides(id: string): Set<string> {
  const cars = new Set<string>()
  for (const [other, w] of walkers) {
    if (other !== id && w.task?.startsWith(WASH_PREFIX)) cars.add(w.task.slice(WASH_PREFIX.length))
  }
  return cars
}

/**
 * The lot porter's loop: walk to the dirtiest car that needs it and wash it,
 * then the next; with every car clean enough, wait at the standby spot.
 */
function updatePorter(e: Employee, w: StaffWalker, seconds: number): void {
  const game = useGame.getState()
  const task = nextPorterTask(e, game.inventory, {
    playerTargetId: game.activeAction?.targetId ?? null,
    exclude: w.unreachableIds,
    current: w.task?.startsWith(WASH_PREFIX) ? w.task.slice(WASH_PREFIX.length) : null,
    taken: washesBesides(e.id),
  })
  if (task.kind === 'idle') {
    if (w.task !== 'post') plan(e, w, 'post')
    return updatePost(e, w, seconds)
  }
  const it = interactables.get(task.carId)
  const key = `${WASH_PREFIX}${task.carId}`
  if (key !== w.task) {
    w.task = key
    w.timer = 0
    standUp(w)
    w.faceTo = it ? interactableCenter(grid, it) : null
    if (it) pathTo(w, it.approachTiles)
    else w.unreachable = true
  }
  walk(w, STAFF_SPEED, seconds, w.faceTo)
  if (w.waypoints.length > 0) return
  if (w.unreachable || !it) {
    w.unreachableIds.add(task.carId)
    return
  }
  w.anim.current = 'interact-right'
  w.timer += seconds
  if (w.timer >= skillSeconds(PORTER_WASH_SECONDS, e.skill)) game.staffWash(e.id, task.carId)
}

const JOB_PREFIX = 'job:'

/** The jobs mechanics other than `id` are on their way to, and the bay each is headed for. */
function jobsBesides(id: string): Map<string, number> {
  const jobs = new Map<string, number>()
  for (const [other, w] of walkers) {
    if (other === id || !w.task?.startsWith(JOB_PREFIX)) continue
    const [jobId, bay] = w.task.slice(JOB_PREFIX.length).split('@')
    jobs.set(jobId, Number(bay))
  }
  return jobs
}

/**
 * A mechanic's day: walk to the bay of the next job (a client's car first,
 * then our own reconditioning), start on it and work it until it's done;
 * with nothing to do, wait in the garage. The job's time runs on the clock
 * (see the store's `tickClock`), not here.
 */
function updateMechanic(e: Employee, w: StaffWalker, seconds: number): void {
  const game = useGame.getState()
  const task = nextMechanicTask(e, game.serviceJobs, {
    roster: game.roster,
    bays: bayCount(expansionsUp(game)),
    taken: jobsBesides(e.id),
  })
  if (task.kind === 'idle') {
    if (w.task !== 'post') plan(e, w, 'post')
    return updatePost(e, w, seconds)
  }
  const bay = SERVICE_BAYS[task.bay]
  const key = `${JOB_PREFIX}${task.jobId}@${task.bay}`
  if (key !== w.task) {
    w.task = key
    w.timer = 0
    standUp(w)
    const b = grid.tileToWorld(bay.rect.tx, bay.rect.tz)
    w.faceTo = { x: b.x + (bay.rect.w - 1) / 2, z: b.z + (bay.rect.h - 1) / 2 }
    pathTo(w, approachTilesFor(grid, bay.rect))
  }
  walk(w, STAFF_SPEED, seconds, w.faceTo)
  if (w.waypoints.length > 0) return
  const job = game.serviceJobs.find((j) => j.id === task.jobId)
  if (job?.status !== 'inBay' || job.mechanicId !== e.id) {
    game.staffStartJob(e.id, task.jobId, task.bay)
  }
  w.anim.current = 'interact-right'
}

/**
 * The security guard's rounds: stop by stop round the patrol, pausing at each
 * to look over the lot. Once Jaguar comes within sight they run after him and,
 * on reaching him, run him off.
 */
function updateGuard(e: Employee, w: StaffWalker, seconds: number): void {
  const game = useGame.getState()
  const jaguar = game.jaguar?.status === 'onLot' ? ambientPos.get(JAGUAR_ID) : undefined
  const task = nextGuardTask(e, {
    jaguar: jaguar ? grid.worldToTile(jaguar.x, jaguar.z) : null,
    at: grid.worldToTile(w.pos.x, w.pos.z),
    leg: w.leg,
    chasing: w.task === 'chase',
    patrol: patrolTiles(expansionsUp(game)),
  })
  if (task.kind === 'idle') {
    if (w.task !== 'post') plan(e, w, 'post')
    return updatePost(e, w, seconds)
  }
  if (task.kind === 'chase' && jaguar) {
    if (w.task !== 'chase') {
      w.task = 'chase'
      w.timer = 0
      w.faceTo = null
      standUp(w)
    }
    if (Math.hypot(jaguar.x - w.pos.x, jaguar.z - w.pos.z) < CATCH_REACH) {
      w.waypoints = []
      game.jaguarRunOff('guard')
      return
    }
    // He keeps moving: head for where he is now.
    if ((w.timer -= seconds) <= 0) {
      w.timer = CHASE_REPLAN_SECONDS
      const tile = grid.worldToTile(jaguar.x, jaguar.z)
      pathTo(w, approachTilesFor(grid, { ...tile, w: 1, h: 1 }))
    }
    const moving = walk(w, GUARD_CHASE_SPEED, seconds, jaguar)
    w.anim.current = moving ? 'sprint' : 'idle'
    return
  }
  if (task.kind !== 'patrol') return
  const key = `patrol:${w.leg}`
  if (key !== w.task) {
    w.task = key
    w.timer = 0
    w.faceTo = LOT_CENTER
    standUp(w)
    pathTo(w, [task.tile])
  }
  walk(w, STAFF_SPEED, seconds, w.faceTo)
  if (w.waypoints.length > 0) return
  w.timer += seconds
  if (w.unreachable || w.timer >= PATROL_PAUSE_SECONDS) w.leg++
}

/** Going to or working from their post, and reporting in on arrival. */
function updatePost(e: Employee, w: StaffWalker, seconds: number): void {
  if (w.seat) {
    w.anim.current = 'sit'
    return
  }
  walk(w, STAFF_SPEED, seconds, w.faceTo)
  if (w.waypoints.length === 0) onArrived(e, w)
}

function update(
  e: Employee,
  w: StaffWalker,
  seconds: number,
  customers: readonly Customer[],
): void {
  // Sent home (closing, or let go) with buyers still in hand: finish them first.
  const leaving = e.status === 'leaving' && !hasBuyersInHand(customers, e.id)
  if (e.role === 'sales' && !leaving) return updateSales(e, w, seconds, customers)
  if (e.role === 'porter' && !leaving) return updatePorter(e, w, seconds)
  if (e.role === 'security' && !leaving) return updateGuard(e, w, seconds)
  if (e.role === 'mechanic' && !leaving) return updateMechanic(e, w, seconds)
  const task = leaving ? 'leave' : 'post'
  if (task !== w.task) plan(e, w, task)
  updatePost(e, w, seconds)
  if (e.role === 'finance' && w.task === 'post' && w.waypoints.length === 0) {
    doPaperwork(e, w, seconds, customers)
  }
}

/** Role label over an employee's head, so staff read as staff; a "?" while they think of quitting. */
function StaffBadge({ role, quitting }: { role: Role; quitting: boolean }) {
  return (
    <Html position={[0, BADGE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className={quitting ? 'staff-badge quitting-badge' : 'staff-badge'}>
        {ROLE_BADGES[role]}
      </div>
    </Html>
  )
}

const StaffFigure = memo(function StaffFigure({
  employee,
  anim,
}: {
  employee: Employee
  anim: Walker['anim']
}) {
  return (
    <group
      ref={(g) => {
        if (g) groups.set(employee.id, g)
        else groups.delete(employee.id)
      }}
    >
      <Interactable id={employee.id}>
        <Suspense fallback={null}>
          <Character variant={employee.variant} anim={anim} moveSpeed={STAFF_SPEED} />
        </Suspense>
      </Interactable>
      <StaffBadge role={employee.role} quitting={employee.quitting} />
    </group>
  )
})

/** Staff who are on the lot: on their way in, at work, or walking home. */
const onLot = (e: Employee) => e.status !== 'off'

/**
 * Every employee in the world, moved by one `useFrame` (like Customers): they
 * walk in from the sidewalk at opening (or when hired), work from their post
 * (the finance manager signs buyers' paperwork at the office desk, the porter
 * washes the dirtiest cars, the guard patrols the lot and chases off Jaguar,
 * mechanics work the garage's bays), and walk
 * out at closing (or when fired). Shift changes go to the store;
 * positions stay in the walkers.
 */
export function Staff() {
  const roster = useGame((s) => s.roster)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const { seconds } = frameSeconds(rawDelta, game.timeScale)
    const live = new Set<string>()
    for (const e of game.roster) {
      if (!onLot(e)) continue
      live.add(e.id)
      update(e, walkerFor(e), seconds, game.customers)
    }
    for (const id of walkers.keys()) if (!live.has(id)) removeWalker(id)
    syncGroups(groups, walkers)
  })

  return (
    <>
      {roster.filter(onLot).map((e) => (
        <StaffFigure key={e.id} employee={e} anim={walkerFor(e).anim} />
      ))}
    </>
  )
}
