import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import type { Group } from 'three'
import { isClosed } from '../sim/clock'
import { CUSTOMER_SPEED } from '../sim/customers'
import type { Tile } from '../sim/grid'
import { approachTilesFor, interactableCenter } from '../sim/interactables'
import { SIDEWALK_ENDS } from '../sim/layout'
import { NAZMA_ID, NAZMA_VARIANT, nextTarget, POACH_SECONDS } from '../sim/nazma'
import { createRng, hashSeed } from '../sim/rng'
import { isPaused, useGame } from '../state/store'
import { Character } from './Character'
import { Interactable } from './Interactable'
import { ambientPos, gameTime, grid, interactables, staffPos } from './runtime'
import {
  createWalker,
  frameSeconds,
  inwardHeading,
  pathTo,
  releaseWalker,
  turnToward,
  walk,
  type Walker,
} from './walker'

/** A dark hoodie, over the staff uniform he still has. */
const HOODIE_TINT = '#26262b'
/** Seconds (at game speed) he spends rubbing grime into one car. */
export const SMUDGE_SECONDS = 6
/** Caught: he hurries for the street this much faster than a stroll. */
const RUN_FACTOR = 2
const BADGE_HEIGHT = 1.5
/** Close enough to the employee he's poaching to talk them round. */
const CHAT_REACH = 1.6
/** As close as he can get (say, across a desk), stopped: near enough to talk. */
const CHAT_FAR = 2.6
/** Following someone on the move: game seconds between new paths to where they are now. */
const FOLLOW_REPLAN_SECONDS = 0.5

interface NazmaWalker extends Walker {
  /**
   * `target:<carId>` while working through his list, `poach:<employeeId>` on
   * his way to (or chatting with) someone, then `leave` or `flee`.
   */
  task: string
  /** Seconds spent smudging the car, or talking to the employee, he's at. */
  timer: number
  /** Poaching: game seconds until he looks again where his target is. */
  replan: number
}

/** Nazma on the lot, if he's here, and the day he came in on. */
const visit: { walker: NazmaWalker | null; day: number } = { walker: null, day: 0 }

function arrive(day: number): NazmaWalker {
  const spawn = createRng(hashSeed(`${NAZMA_ID}-${day}`)).pick(SIDEWALK_ENDS)
  const w: NazmaWalker = {
    ...createWalker(NAZMA_ID, spawn, inwardHeading(spawn)),
    task: '',
    timer: 0,
    replan: 0,
  }
  ambientPos.set(NAZMA_ID, w.pos)
  return w
}

function leave(): void {
  visit.walker = null
  ambientPos.delete(NAZMA_ID)
  releaseWalker(NAZMA_ID)
}

/** The sidewalk end nearest to him, for a quick getaway. */
function nearestExit(w: Walker): Tile {
  let best = SIDEWALK_ENDS[0]
  let bestDist = Infinity
  for (const end of SIDEWALK_ENDS) {
    const p = grid.tileToWorld(end.tx, end.tz)
    const d = Math.hypot(p.x - w.pos.x, p.z - w.pos.z)
    if (d < bestDist) {
      best = end
      bestDist = d
    }
  }
  return best
}

/**
 * Poaching: walks up to the employee (following them if they move) and talks
 * to them for `POACH_SECONDS`, then the store hears they're thinking of
 * quitting. Someone let go (or gone home) is no use to him.
 */
function poach(w: NazmaWalker, employeeId: string, seconds: number): void {
  const game = useGame.getState()
  const e = game.roster.find((x) => x.id === employeeId)
  const at = staffPos.get(employeeId)
  if (!e || e.fired || e.status === 'off' || e.status === 'leaving' || !at) {
    game.nazmaPoach(employeeId)
    return
  }
  const dist = Math.hypot(at.x - w.pos.x, at.z - w.pos.z)
  const near = dist < CHAT_REACH || (w.waypoints.length === 0 && dist < CHAT_FAR)
  if (near) {
    w.waypoints = []
    turnToward(w, at, seconds)
    w.anim.current = 'idle'
    if (!game.nazma?.chatting) game.nazmaChat()
    w.timer += seconds
    if (w.timer >= POACH_SECONDS) game.nazmaPoach(employeeId)
    return
  }
  // They've moved off: after them.
  if ((w.replan -= seconds) <= 0 || (w.waypoints.length === 0 && !w.unreachable)) {
    w.replan = FOLLOW_REPLAN_SECONDS
    const tile = grid.worldToTile(at.x, at.z)
    if (tile) pathTo(w, approachTilesFor(grid, { ...tile, w: 1, h: 1 }))
  }
  walk(w, CUSTOMER_SPEED, seconds, at)
}

/**
 * Walks to each car on his list and smudges it, or to the employee he means
 * to poach, then strolls off. Caught, he drops what he's doing and runs for
 * the nearest sidewalk end.
 */
function update(w: NazmaWalker, seconds: number): void {
  const game = useGame.getState()
  const nazma = game.nazma
  if (!nazma) return leave()
  const target = nazma.status === 'onLot' && !isClosed(game.clock) ? nextTarget(nazma) : null
  const kind = nazma.scheme === 'poach' ? 'poach' : 'target'
  const task = nazma.status === 'runOff' ? 'flee' : target ? `${kind}:${target}` : 'leave'
  if (target && kind === 'poach') {
    if (task !== w.task) {
      w.task = task
      w.timer = 0
      w.replan = 0
      w.faceTo = null
    }
    return poach(w, target, seconds)
  }
  const it = target ? interactables.get(target) : undefined

  if (task !== w.task) {
    w.task = task
    w.timer = 0
    w.faceTo = it ? interactableCenter(grid, it) : null
    if (task === 'flee' || task === 'leave') pathTo(w, [nearestExit(w)])
    else if (it) pathTo(w, it.approachTiles)
    else w.unreachable = true
  }

  const speed = task === 'flee' ? CUSTOMER_SPEED * RUN_FACTOR : CUSTOMER_SPEED
  walk(w, speed, seconds, w.faceTo)
  if (task === 'flee') w.anim.current = w.waypoints.length > 0 ? 'sprint' : 'idle'
  if (w.waypoints.length > 0) return

  if (task === 'flee' || task === 'leave') {
    game.nazmaLeft()
    return leave()
  }
  // Sold, or out of reach: on to the next one without a smudge.
  if (!it || w.unreachable) {
    game.nazmaSmudge(target!)
    return
  }
  w.anim.current = 'interact-right'
  w.timer += seconds
  if (w.timer >= SMUDGE_SECONDS) game.nazmaSmudge(target!)
}

/**
 * Nazma, on the days he visits (see `sim/nazma.ts`): in from the sidewalk at
 * his arrival time, round the cars he means to smudge, then off again, or
 * sprinting off once caught. His plan lives in the store; the walk is all here.
 */
export function Nazma() {
  const [present, setPresent] = useState(false)
  const group = useRef<Group>(null)
  const catchable = useGame((s) => s.nazma?.status === 'onLot')

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const day = game.clock.day
    if (visit.walker && visit.day !== day) leave()
    const due =
      game.nazma?.status === 'coming' &&
      gameTime.minute >= game.nazma.arrivalMinute &&
      !isClosed(game.clock)
    if (!visit.walker && due && !isPaused(game)) {
      visit.walker = arrive(day)
      visit.day = day
      game.nazmaArrived()
    }
    const w = visit.walker
    if (w) update(w, frameSeconds(rawDelta, game.timeScale).seconds)
    const here = !!visit.walker
    if (here !== present) setPresent(here)
    if (visit.walker && group.current) {
      group.current.position.set(visit.walker.pos.x, 0, visit.walker.pos.z)
      group.current.rotation.y = visit.walker.heading
    }
  })

  if (!present || !visit.walker) return null
  return (
    <group ref={group} position={[visit.walker.pos.x, 0, visit.walker.pos.z]}>
      <Interactable id={NAZMA_ID} disabled={!catchable}>
        <Suspense fallback={null}>
          <Character
            variant={NAZMA_VARIANT}
            anim={visit.walker.anim}
            moveSpeed={CUSTOMER_SPEED}
            bodyTint={HOODIE_TINT}
          />
        </Suspense>
      </Interactable>
      <Html position={[0, BADGE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
        <div className="staff-badge nazma-badge">Nazma</div>
      </Html>
    </group>
  )
}
