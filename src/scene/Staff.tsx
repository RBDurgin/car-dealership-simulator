import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import type { Customer } from '../sim/customers'
import { hasBuyersInHand } from '../sim/deal'
import type { Tile, Vec2 } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import { expansionsUp } from '../sim/expansions'
import { auctionOpen } from '../sim/auction'
import {
  BUYER_POST_TILES,
  GARAGE,
  GARAGE_STANDBY_TILES,
  GUARD_PATROL_TILES,
  patrolTiles,
  PORTER_STANDBY_TILES,
  SERVICE_BAYS,
  SIDEWALK_ENDS,
} from '../sim/layout'
import { isWarned, workSeconds } from '../sim/morale'
import { NAZMA_ID } from '../sim/nazma'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { buyBlocker } from '../sim/sellers'
import {
  ADVISOR_CALL_SECONDS,
  ADVISOR_CHECK_IN_SECONDS,
  BUYER_INSPECT_SECONDS,
  GUARD_CHASE_SPEED,
  PORTER_WASH_SECONDS,
  postChairId,
  ROLE_BADGES,
  SALES_COUNTER_SECONDS,
  SALES_PITCH_SECONDS,
  SALES_SIGN_SECONDS,
  STAFF_SPEED,
  type Employee,
  type Role,
} from '../sim/staff'
import { bayCount } from '../sim/service'
import {
  BREAK_MINUTES,
  nextBuyerTask,
  nextCheckIn,
  nextFinding,
  nextGuardTask,
  nextMechanicTask,
  nextPorterTask,
  nextSalesTask,
  wantsBreak,
  type BreakPart,
  type BuyerTask,
  type SalesTask,
} from '../sim/staffAi'
import { CLOSE_MINUTE, DEFAULT_DAY_MS, OPEN_MINUTE } from '../sim/clock'
import { breakSeats } from '../sim/improvements'
import { biddableLotsFor, upNow } from '../state/selectors'
import { useGame } from '../state/store'
import { financePaperwork } from '../state/derived'
import { Character } from './Character'
import { Interactable } from './Interactable'
import {
  ambientPos,
  atCounter,
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
  report,
} from './walker'
import { seniorWashScale } from '../sim/growth'

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
/** Close enough to Nazma for the guard to run him off. */
const CATCH_REACH = 1.2
/** Chasing Nazma: game seconds between new paths to where he is now. */
const CHASE_REPLAN_SECONDS = 0.4
/** At the test drive car: they get in once the shopper is this close to it… */
const BOARD_REACH = 3
/** …or after this many game seconds, however far behind the shopper is. */
const BOARD_WAIT_SECONDS = 8
/** A break's `BREAK_MINUTES` of the clock, in the seconds the frame loop counts, once seated. */
const BREAK_SECONDS = (BREAK_MINUTES * DEFAULT_DAY_MS) / 1000 / (CLOSE_MINUTE - OPEN_MINUTE)

/** Where staff without a chair wait, and what they face. */
function standby(e: Employee): { tiles: Tile[]; faceTo: Vec2 } {
  if (e.role === 'porter') return { tiles: PORTER_STANDBY_TILES, faceTo: LOT_CENTER }
  if (e.role === 'security') return { tiles: GUARD_PATROL_TILES, faceTo: LOT_CENTER }
  if (e.role === 'mechanic') return { tiles: GARAGE_STANDBY_TILES, faceTo: GARAGE_CENTER }
  if (e.role === 'buyer') return { tiles: BUYER_POST_TILES, faceTo: LOT_CENTER }
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
  /**
   * Finance: the buyer whose paperwork is under way, and game seconds left on
   * it. The service advisor: the client being checked in, or the job whose
   * extra work they're offering (`finding:<job id>`). The used-car manager:
   * the run-list lot they're looking over.
   */
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
  /** Out on a test drive in this car: hidden, and off the floor. Null otherwise. */
  away: string | null
  /** The used-car manager, away at the auction: hidden, and off the lot. */
  atAuction: boolean
  /** The parts of today they've had a break in. */
  breaks: BreakPart[]
  /** On a break: the break room chair they're headed for or sitting in. Null otherwise. */
  rest: { seatId: string } | null
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
    away: null,
    atAuction: false,
    breaks: [],
    rest: null,
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
  if (e.status === 'arriving') {
    report(w, 'atPost', () => game.dispatchStaff({ type: 'atPost', id: e.id }))
  }
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
    w.paperwork = { customerId: c.id, left: financePaperwork(useGame.getState(), c, e) }
  }
  w.paperwork.left -= seconds
  if (w.paperwork.left > 0) return
  w.paperwork = null
  useGame.getState().staffSign(e.id, c.id)
}

/**
 * The service advisor at the counter checks in the client who's been
 * standing there longest, taking a moment over each.
 */
function doCheckIns(
  e: Employee,
  w: StaffWalker,
  seconds: number,
  customers: readonly Customer[],
): void {
  const game = useGame.getState()
  const c = nextCheckIn(e, customers, atCounter, game.activeAction?.targetId ?? null)
  if (!c) return doFindings(e, w, seconds, customers)
  if (w.paperwork?.customerId !== c.id) {
    w.paperwork = { customerId: c.id, left: workSeconds(ADVISOR_CHECK_IN_SECONDS, e) }
  }
  w.paperwork.left -= seconds
  if (w.paperwork.left > 0) return
  w.paperwork = null
  game.staffCheckIn(e.id, c.id)
}

/**
 * With nobody at the counter, the service advisor tells clients (in the
 * garage's chairs, or by phone) about extra work the mechanics found.
 */
function doFindings(
  e: Employee,
  w: StaffWalker,
  seconds: number,
  customers: readonly Customer[],
): void {
  const game = useGame.getState()
  const clients = [...customers, ...game.serviceAway]
  const job = nextFinding(e, game.serviceJobs, clients, game.clock.minute)
  if (!job) {
    w.paperwork = null
    return
  }
  const key = `finding:${job.id}`
  if (w.paperwork?.customerId !== key) {
    w.paperwork = { customerId: key, left: workSeconds(ADVISOR_CALL_SECONDS, e) }
  }
  w.paperwork.left -= seconds
  if (w.paperwork.left > 0) return
  w.paperwork = null
  game.staffRecommend(e.id, job.id)
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
    // A car out on a drive is out of stock already, so no two drives take it.
    inventory: game.inventory,
  })
  if (
    task.kind === 'greet' &&
    !customers.some((c) => c.id === task.customerId && c.handlerId === e.id)
  ) {
    // Somebody new: claim them first. Someone else got there first: try again
    // once something has changed.
    const claimed = report(w, `claim:${task.customerId}`, () =>
      game.staffClaim(e.id, task.customerId),
    )
    if (!claimed) return
  }
  // No chair free for them yet: asked again once something has changed.
  if (task.kind === 'lead') return void report(w, 'lead', () => game.staffLead(e.id))
  // They asked to drive it: off to the car before any talk of price.
  if (task.kind === 'drive') return void report(w, 'drive', () => game.staffTestDrive(e.id))

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
  if (task.kind === 'ride') {
    const c = customers.find((x) => x.id === task.customerId)
    if (c?.phase === 'driving') return goAway(e, w, task.carId)
    walk(w, STAFF_SPEED, seconds, w.faceTo)
    if (w.waypoints.length > 0) return
    // At the car: in once the shopper has caught up (or they've waited long enough).
    w.anim.current = 'idle'
    w.timer += seconds
    const at = customerPos.get(task.customerId)
    const near = !!at && Math.hypot(at.x - w.pos.x, at.z - w.pos.z) <= BOARD_REACH
    if (near || w.timer >= BOARD_WAIT_SECONDS) report(w, 'board', () => game.staffBoard(e.id))
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
    if (w.timer >= workSeconds(base, e)) game.staffOffer(e.id)
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
  if (w.timer >= workSeconds(SALES_SIGN_SECONDS, e)) game.staffSign(e.id, c.id)
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
  if (task.kind === 'ride') {
    // To the side of the test drive car, facing it.
    const car = useGame.getState().inventory.find((x) => x.id === task.carId)
    if (!car) return
    w.faceTo = grid.tileToWorld(
      car.rect.tx + (car.rect.w - 1) / 2,
      car.rect.tz + (car.rect.h - 1) / 2,
    )
    pathTo(w, approachTilesFor(grid, car.rect))
    return
  }
  if (task.kind === 'sign') {
    const chair = propById(task.chairId)
    if (chair) pathTo(w, approachTilesFor(grid, chair.rect))
  }
}

/** In the test drive car and off: hidden, and out of everyone's way, until it's back. */
function goAway(e: Employee, w: StaffWalker, carId: string): void {
  if (w.away) return
  w.away = carId
  w.waypoints = []
  w.timer = 0
  standUp(w)
  staffPos.delete(e.id)
  releaseWalker(e.id)
}

/** Back from a test drive: they get out beside the car and carry on from there. */
function comeBack(e: Employee, w: StaffWalker): void {
  const car = useGame.getState().inventory.find((x) => x.id === w.away)
  w.away = null
  w.task = null
  if (car) {
    const tile = w.rng.pick(approachTilesFor(grid, car.rect))
    const at = grid.tileToWorld(tile.tx, tile.tz)
    w.pos.x = at.x
    w.pos.z = at.z
  }
  staffPos.set(e.id, w.pos)
}

/** Whether employee `id` is out on a test drive with a shopper. */
const outDriving = (customers: readonly Customer[], id: string) =>
  customers.some((c) => c.handlerId === id && c.phase === 'driving')

const WASH_PREFIX = 'wash:'

/** `washesBesides`' set, refilled by each call. */
const washing = new Set<string>()

/** The cars porters other than `id` are washing, in a set the next call reuses. */
function washesBesides(id: string): Set<string> {
  const cars = washing
  cars.clear()
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
  if (w.timer >= workSeconds(PORTER_WASH_SECONDS * seniorWashScale(e), e))
    game.staffWash(e.id, task.carId)
}

const JOB_PREFIX = 'job:'

/** `jobsBesides`' map, refilled by each call. */
const headedFor = new Map<string, number>()

/**
 * The jobs mechanics other than `id` are on their way to, and the bay each is
 * headed for, in a map the next call reuses.
 */
function jobsBesides(id: string): Map<string, number> {
  const jobs = headedFor
  jobs.clear()
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
 * to look over the lot. Once Nazma comes within sight they run after him and,
 * on reaching him, run him off.
 */
function updateGuard(e: Employee, w: StaffWalker, seconds: number): void {
  const game = useGame.getState()
  const nazma = game.nazma?.status === 'onLot' ? ambientPos.get(NAZMA_ID) : undefined
  const task = nextGuardTask(e, {
    nazma: nazma ? grid.worldToTile(nazma.x, nazma.z) : null,
    at: grid.worldToTile(w.pos.x, w.pos.z),
    leg: w.leg,
    chasing: w.task === 'chase',
    patrol: patrolTiles(expansionsUp(game)),
  })
  if (task.kind === 'idle') {
    if (w.task !== 'post') plan(e, w, 'post')
    return updatePost(e, w, seconds)
  }
  if (task.kind === 'chase' && nazma) {
    if (w.task !== 'chase') {
      w.task = 'chase'
      w.timer = 0
      w.faceTo = null
      standUp(w)
    }
    if (Math.hypot(nazma.x - w.pos.x, nazma.z - w.pos.z) < CATCH_REACH) {
      w.waypoints = []
      game.nazmaRunOff('guard')
      return
    }
    // He keeps moving: head for where he is now.
    if ((w.timer -= seconds) <= 0) {
      w.timer = CHASE_REPLAN_SECONDS
      const tile = grid.worldToTile(nazma.x, nazma.z)
      pathTo(w, approachTilesFor(grid, { ...tile, w: 1, h: 1 }))
    }
    const moving = walk(w, GUARD_CHASE_SPEED, seconds, nazma)
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

/** What the used-car manager does next (see `nextBuyerTask`). */
function buyerTask(e: Employee): BuyerTask {
  const game = useGame.getState()
  return nextBuyerTask(e, {
    day: game.clock.day,
    minute: game.clock.minute,
    open: auctionOpen(game.career),
    lots: biddableLotsFor(game),
    inspected: game.inspected,
    runOver: !!game.auction?.over,
  })
}

/**
 * The used-car manager off to the auction: out through the gate to the
 * sidewalk, then away (hidden, and off the lot) until the run is over. The
 * store has them bidding from `BUYER_LEAVE` whether or not they've got there.
 */
function toAuction(e: Employee, w: StaffWalker, seconds: number): void {
  if (w.atAuction) return
  const game = useGame.getState()
  // Straight there on the way in: they've still come to work.
  if (e.status === 'arriving') {
    report(w, 'atPost', () => game.dispatchStaff({ type: 'atPost', id: e.id }))
  }
  if (w.task !== 'auction') {
    w.task = 'auction'
    w.timer = 0
    w.faceTo = null
    w.paperwork = null
    standUp(w)
    pathTo(w, [w.exit])
  }
  walk(w, STAFF_SPEED, seconds, null)
  if (w.waypoints.length > 0) return
  w.atAuction = true
  staffPos.delete(e.id)
  releaseWalker(e.id)
}

/** Back from the auction: in from the sidewalk, and back to the kiosk. */
function backFromAuction(e: Employee, w: StaffWalker): void {
  w.atAuction = false
  w.task = null
  const at = grid.tileToWorld(w.exit.tx, w.exit.tz)
  w.pos.x = at.x
  w.pos.z = at.z
  staffPos.set(e.id, w.pos)
}

/**
 * The used-car manager at the kiosk: the day before an auction (and on its
 * morning) they look over the run list's lots one by one; otherwise they wait there.
 */
function updateBuyer(e: Employee, w: StaffWalker, seconds: number, task: BuyerTask): void {
  if (w.task !== 'post') plan(e, w, 'post')
  updatePost(e, w, seconds)
  if (task.kind !== 'inspect') {
    w.paperwork = null
    return
  }
  if (w.waypoints.length > 0) return
  if (w.paperwork?.customerId !== task.lotId) {
    w.paperwork = { customerId: task.lotId, left: workSeconds(BUYER_INSPECT_SECONDS, e) }
  }
  w.anim.current = 'interact-right'
  w.paperwork.left -= seconds
  if (w.paperwork.left > 0) return
  w.paperwork = null
  useGame.getState().staffInspect(e.id, task.lotId)
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
  // Out on a test drive: nothing to do on the lot until it's back.
  if (w.away) {
    if (outDriving(customers, e.id)) return
    comeBack(e, w)
  }
  // Sent home (closing, or let go) with buyers still in hand: finish them first.
  const leaving = e.status === 'leaving' && !hasBuyersInHand(customers, e.id)
  const buying = e.role === 'buyer' && !leaving ? buyerTask(e) : null
  if (buying?.kind === 'auction') {
    if (w.rest) endBreak(e, w)
    return toAuction(e, w, seconds)
  }
  if (w.atAuction) backFromAuction(e, w)
  if (onBreak(e, w, seconds, customers)) return
  if (buying) return updateBuyer(e, w, seconds, buying)
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
  if (e.role === 'advisor' && w.task === 'post' && w.waypoints.length === 0) {
    doCheckIns(e, w, seconds, customers)
  }
}

/** Whether employee `e` has nothing on: at their post with no customer, job or task under way. */
function idleNow(e: Employee, w: StaffWalker, customers: readonly Customer[]): boolean {
  if (e.status !== 'atPost' || e.fired || e.quitting) return false
  if (w.away || w.paperwork || w.waypoints.length > 0) return false
  if (customers.some((c) => c.handlerId === e.id && c.phase !== 'leaving')) return false
  const game = useGame.getState()
  if (e.role === 'security') {
    return !!w.task?.startsWith('patrol:') && game.nazma?.status !== 'onLot'
  }
  if (e.role === 'receptionist' && game.receptionCall?.employeeId === e.id) return false
  return w.task === 'post'
}

/** The break room chair nobody else on a break has taken, if there's one free. */
function freeSeat(id: string) {
  const seats = breakSeats(upNow(useGame.getState()))
  return seats.find((p) => {
    for (const [other, o] of walkers) if (other !== id && o.rest?.seatId === p.id) return false
    return true
  })
}

/**
 * Breaks (with a break room up): an idle employee whose time has come
 * (`wantsBreak`) walks to a free chair in the break room and sits a while,
 * then goes back to work. Closing, or being let go, ends one at once.
 * Whether they're on a break now (the rest of the update skipped).
 */
function onBreak(
  e: Employee,
  w: StaffWalker,
  seconds: number,
  customers: readonly Customer[],
): boolean {
  const game = useGame.getState()
  if (w.rest) {
    const id = w.rest.seatId
    const seat = breakSeats(upNow(game)).find((p) => p.id === id)
    if (e.status !== 'atPost' || !seat || w.timer >= BREAK_SECONDS) {
      endBreak(e, w)
      return false
    }
    if (!w.seat) {
      walk(w, STAFF_SPEED, seconds, null)
      if (w.waypoints.length > 0) return true
      // Can't sit: they take it standing up.
      if (!sitOn(w, seat)) w.anim.current = 'idle'
    }
    if (w.seat) w.anim.current = 'sit'
    w.timer += seconds
    return true
  }
  if (!idleNow(e, w, customers)) return false
  const seats = breakSeats(upNow(game))
  const part = wantsBreak(e, {
    minute: game.clock.minute,
    taken: w.breaks,
    waiting: customers.filter((c) => c.phase === 'waiting').length,
    onBreak: game.onBreak.length,
    breakRoom: seats.length > 0,
  })
  const seat = part && freeSeat(e.id)
  if (!part || !seat) return false
  report(w, 'break', () => game.staffBreak(e.id, true))
  if (!useGame.getState().onBreak.includes(e.id)) return false
  w.breaks.push(part)
  w.rest = { seatId: seat.id }
  w.task = 'break'
  w.timer = 0
  w.faceTo = null
  standUp(w)
  pathTo(w, approachTilesFor(grid, seat.rect))
  return true
}

/** Back from a break: up from the chair and back to work, with a new plan. */
function endBreak(e: Employee, w: StaffWalker): void {
  w.rest = null
  w.task = null
  w.timer = 0
  standUp(w)
  useGame.getState().staffBreak(e.id, false)
}

/** Role label over an employee's head, so staff read as staff; a "?" while they think of quitting. */
/** Their role over their head: red while quitting, with 😟 once they've warned they're unhappy. */
function StaffBadge({
  role,
  quitting,
  warned,
  senior,
}: {
  role: Role
  quitting: boolean
  warned: boolean
  senior: boolean
}) {
  return (
    <Html position={[0, BADGE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className={quitting ? 'staff-badge quitting-badge' : 'staff-badge'}>
        {warned && !quitting && <span aria-label="Unhappy">😟 </span>}
        {senior && <span aria-label="Senior">★ </span>}
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
      <StaffBadge
        role={employee.role}
        quitting={employee.quitting}
        warned={isWarned(employee)}
        senior={employee.senior}
      />
    </group>
  )
})

/** Staff who are on the lot: on their way in, at work, or walking home. */
const onLot = (e: Employee) => e.status !== 'off'

/** Who's on the lot this frame, cleared and refilled each frame instead of made anew. */
const live = new Set<string>()

/**
 * Every employee in the world, moved by one `useFrame` (like Customers): they
 * walk in from the sidewalk at opening (or when hired), work from their post
 * (the finance manager signs buyers' paperwork at the office desk, the porter
 * washes the dirtiest cars, the guard patrols the lot and chases off Nazma,
 * mechanics work the garage's bays, the service advisor checks clients in at
 * its counter, the used-car manager looks over the auction's run list from
 * the kiosk and goes to the auction), and walk
 * out at closing (or when fired). Shift changes go to the store;
 * positions stay in the walkers.
 */
export function Staff() {
  const roster = useGame((s) => s.roster)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const { seconds } = frameSeconds(rawDelta, game.timeScale)
    live.clear()
    for (const e of game.roster) {
      if (!onLot(e)) continue
      live.add(e.id)
      update(e, walkerFor(e), seconds, game.customers)
    }
    for (const id of walkers.keys()) if (!live.has(id)) removeWalker(id)
    syncGroups(groups, walkers)
    // Out on a test drive, or at the auction: not drawn.
    for (const [id, g] of groups) {
      const w = walkers.get(id)
      g.visible = !w?.away && !w?.atAuction
    }
  })

  return (
    <>
      {roster.filter(onLot).map((e) => (
        <StaffFigure key={e.id} employee={e} anim={walkerFor(e).anim} />
      ))}
    </>
  )
}
