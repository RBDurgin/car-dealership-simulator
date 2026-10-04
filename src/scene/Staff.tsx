import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, Suspense } from 'react'
import type { Group } from 'three'
import type { Tile } from '../sim/grid'
import { approachTilesFor } from '../sim/interactables'
import { PROPS, SIDEWALK_ENDS } from '../sim/layout'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { POSTS, ROLE_BADGES, STAFF_SPEED, type Employee, type Role } from '../sim/staff'
import { useGame } from '../state/store'
import { Character } from './Character'
import { Interactable } from './Interactable'
import { grid, staffPos } from './runtime'
import {
  createWalker,
  frameSeconds,
  inwardHeading,
  pathTo,
  releaseWalker,
  sitOn,
  standUp,
  syncGroups,
  walk,
  type Walker,
} from './walker'

/** Just above a ~1.2 unit tall character's head, like customer bubbles. */
const BADGE_HEIGHT = 1.5
/** Where staff without a post of their own (yet) stand: just inside the showroom entrance. */
const STANDBY_TILES: Tile[] = [
  { tx: 20, tz: 11 },
  { tx: 21, tz: 11 },
  { tx: 22, tz: 11 },
  { tx: 23, tz: 12 },
]
/** What standby staff face: the middle of the showroom. */
const SHOWROOM_CENTER = grid.tileToWorld(22, 8)

/** An employee's body in the world. Positions stay here, never in the store. */
interface StaffWalker extends Walker {
  rng: Rng
  exit: Tile
  /** 'post' (going to or at their post) or 'leave'. A new task means a new path. */
  task: string | null
}

const walkers = new Map<string, StaffWalker>()
const groups = new Map<string, Group>()

function walkerFor(e: Employee): StaffWalker {
  let w = walkers.get(e.id)
  if (w) return w
  const rng = createRng(hashSeed(e.id))
  const spawn = rng.pick(SIDEWALK_ENDS)
  const exit = rng.pick(SIDEWALK_ENDS.filter((t) => t.tx === spawn.tx))
  w = { ...createWalker(e.id, spawn, inwardHeading(spawn)), rng, exit, task: null }
  walkers.set(e.id, w)
  staffPos.set(e.id, w.pos)
  return w
}

function removeWalker(id: string): void {
  walkers.delete(id)
  staffPos.delete(id)
  releaseWalker(id)
}

const postChair = (role: Role) => PROPS.find((p) => p.id === POSTS[role])

function plan(e: Employee, w: StaffWalker, task: string): void {
  w.task = task
  standUp(w)
  if (task === 'leave') {
    w.faceTo = null
    pathTo(w, [w.exit])
    return
  }
  const chair = postChair(e.role)
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
  const chair = postChair(e.role)
  // Can't reach the chair: work standing up rather than not at all.
  if (chair && !w.seat) sitOn(w, chair)
  if (e.status === 'arriving') game.dispatchStaff({ type: 'atPost', id: e.id })
}

function update(e: Employee, w: StaffWalker, seconds: number): void {
  const task = e.status === 'leaving' ? 'leave' : 'post'
  if (task !== w.task) plan(e, w, task)
  if (w.seat) {
    w.anim.current = 'sit'
    return
  }
  walk(w, STAFF_SPEED, seconds, w.faceTo)
  if (w.waypoints.length === 0) onArrived(e, w)
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
 * walk in from the sidewalk at opening (or when hired), work from their post,
 * and walk out at closing (or when fired). Shift changes go to the store;
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
      update(e, walkerFor(e), seconds)
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
