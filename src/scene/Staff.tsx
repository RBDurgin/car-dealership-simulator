import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import type { Customer } from '../sim/customers'
import { hasBuyersInHand } from '../sim/deal'
import type { Tile } from '../sim/grid'
import { approachTilesFor } from '../sim/interactables'
import { PROPS, SIDEWALK_ENDS } from '../sim/layout'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import {
  financeSeconds,
  postChairId,
  ROLE_BADGES,
  SALES_PITCH_SECONDS,
  SALES_SIGN_SECONDS,
  skillSeconds,
  STAFF_SPEED,
  type Employee,
  type Role,
} from '../sim/staff'
import { nextSalesTask, type SalesTask } from '../sim/staffAi'
import { useGame } from '../state/store'
import { Character } from './Character'
import { Interactable } from './Interactable'
import { customerPos, customersAtCar, grid, staffPos } from './runtime'
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

/** An employee's body in the world. Positions stay here, never in the store. */
interface StaffWalker extends Walker {
  rng: Rng
  exit: Tile
  /**
   * 'post' (going to or at their post), 'leave', or a salesperson's task with
   * its customer (`greet:customer-3`). A new task means a new path.
   */
  task: string | null
  /** Finance: the buyer whose paperwork is under way, and game seconds left on it. */
  paperwork: { customerId: string; left: number } | null
  /** Game seconds spent on the current task (a salesperson's pitch or paperwork). */
  timer: number
  /** Customers this salesperson couldn't get to; they leave them to someone else. */
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

const propById = (id: string | null) => (id ? PROPS.find((p) => p.id === id) : undefined)
const postChair = (e: Employee) => propById(postChairId(e, useGame.getState().roster))

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
    w.faceTo = SHOWROOM_CENTER
    pathTo(w, [w.rng.pick(STANDBY_TILES), ...STANDBY_TILES], true)
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
    w.timer += seconds
    if (w.timer >= skillSeconds(SALES_PITCH_SECONDS, e.skill)) game.staffOffer(e.id)
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
  const task = leaving ? 'leave' : 'post'
  if (task !== w.task) plan(e, w, task)
  updatePost(e, w, seconds)
  if (e.role === 'finance' && w.task === 'post' && w.waypoints.length === 0) {
    doPaperwork(e, w, seconds, customers)
  }
}

/** Role label over an employee's head, so staff read as staff. */
function StaffBadge({ role }: { role: Role }) {
  return (
    <Html position={[0, BADGE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className="staff-badge">{ROLE_BADGES[role]}</div>
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
      <StaffBadge role={employee.role} />
    </group>
  )
})

/** Staff who are on the lot: on their way in, at work, or walking home. */
const onLot = (e: Employee) => e.status !== 'off'

/**
 * Every employee in the world, moved by one `useFrame` (like Customers): they
 * walk in from the sidewalk at opening (or when hired), work from their post
 * (the finance manager signs buyers' paperwork at the office desk), and walk
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
