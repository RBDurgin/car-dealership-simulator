import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import type { Group } from 'three'
import { OWNER_VARIANT } from '../sim/characters'
import { isClosed } from '../sim/clock'
import type { Tile } from '../sim/grid'
import { CUSTOMER_SPEED } from '../sim/customers'
import { OWNER_OFFICE_TILES, PROPS, SIDEWALK_ENDS } from '../sim/layout'
import { OWNER_ID } from '../sim/owner'
import { createRng, hashSeed, type Rng } from '../sim/rng'
import { isPaused, useGame } from '../state/store'
import { Character } from './Character'
import { ambientPos, gameTime, rectBounds } from './runtime'
import {
  createWalker,
  frameSeconds,
  inwardHeading,
  pathTo,
  releaseWalker,
  walk,
  type Walker,
} from './walker'

/** A dark suit, over whatever the model is wearing. */
const SUIT_TINT = '#3b4258'
/** Game minutes the owner looks around the office after setting the goal. */
const OWNER_STAY_MINUTES = 30
/** Just above a ~1.2 unit tall character's head, like staff badges. */
const BADGE_HEIGHT = 1.5
const OFFICE_DESK = PROPS.find((p) => p.id === 'office-desk')!

interface OwnerWalker extends Walker {
  rng: Rng
  exit: Tile
  task: 'toOffice' | 'inOffice' | 'leave'
  /** Game minute they head home, once they've said their piece. */
  leaveAt: number | null
}

/** The owner on the lot, if they're visiting, and the day they came in on. */
const visit: { walker: OwnerWalker | null; day: number } = { walker: null, day: 0 }

function arrive(day: number): OwnerWalker {
  const rng = createRng(hashSeed(`${OWNER_ID}-${day}`))
  const spawn = rng.pick(SIDEWALK_ENDS)
  const w: OwnerWalker = {
    ...createWalker(OWNER_ID, spawn, inwardHeading(spawn)),
    rng,
    exit: rng.pick(SIDEWALK_ENDS.filter((t) => t.tx === spawn.tx)),
    task: 'toOffice',
    leaveAt: null,
  }
  pathTo(w, [rng.pick(OWNER_OFFICE_TILES), ...OWNER_OFFICE_TILES], true)
  ambientPos.set(OWNER_ID, w.pos)
  return w
}

function leave(): void {
  visit.walker = null
  ambientPos.delete(OWNER_ID)
  releaseWalker(OWNER_ID)
}

/** Walks to the office, says what they want today, looks around a while and goes. */
function update(w: OwnerWalker, seconds: number): void {
  const game = useGame.getState()
  walk(w, CUSTOMER_SPEED, seconds, w.faceTo)
  if (w.waypoints.length > 0) return
  switch (w.task) {
    case 'toOffice':
      // In the office (or as close as they could get): today's goal.
      game.ownerArrived()
      w.task = 'inOffice'
      w.faceTo = rectBounds(OFFICE_DESK.rect)
      w.leaveAt = gameTime.minute + OWNER_STAY_MINUTES
      return
    case 'inOffice':
      if (gameTime.minute < (w.leaveAt ?? 0) && !isClosed(game.clock)) return
      w.task = 'leave'
      w.faceTo = null
      pathTo(w, [w.exit])
      return
    case 'leave':
      leave()
  }
}

/**
 * The owner, on the days they visit (see `sim/owner.ts`): in from the sidewalk
 * at opening, to the office to set the day's goal, then back out. Their goal
 * lives in the store; the walk is all here.
 */
export function Owner() {
  const [present, setPresent] = useState(false)
  const group = useRef<Group>(null)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    const day = game.clock.day
    // A new day: whoever was here last time has gone home.
    if (visit.walker && visit.day !== day) leave()
    if (!visit.walker && game.owner && visit.day !== day && !isPaused(game)) {
      visit.walker = arrive(day)
      visit.day = day
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
      <Suspense fallback={null}>
        <Character
          variant={OWNER_VARIANT}
          anim={visit.walker.anim}
          moveSpeed={CUSTOMER_SPEED}
          bodyTint={SUIT_TINT}
        />
      </Suspense>
      <Html position={[0, BADGE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
        <div className="staff-badge owner-badge">Owner</div>
      </Html>
    </group>
  )
}
