import { useFrame } from '@react-three/fiber'
import { memo, Suspense, useState } from 'react'
import type { Group } from 'three'
import type { CustomerVariant } from '../sim/characters'
import {
  planPedestrians,
  takeDuePedestrians,
  turnInTile,
  type Pedestrian,
} from '../sim/pedestrians'
import { createRng } from '../sim/rng'
import { isPaused, useGame } from '../state/store'
import { Character } from './Character'
import { ambientPos, gameTime, grid, walkInSpawns } from './runtime'
import { createWalker, frameSeconds, inwardHeading, syncGroups, walk, type Walker } from './walker'

const PEDESTRIAN_SEED = 15_000

/** A passer-by's body: straight along their lane, maybe turning in at the driveway. */
interface PedestrianWalker extends Walker {
  ped: Pedestrian
  /** Heading for the turn-in point rather than the far end, to walk in once there. */
  turningIn: boolean
}

const walkers = new Map<string, PedestrianWalker>()
const groups = new Map<string, Group>()
/** The day the plan is for, and how far through it we are. */
const today: { day: number; plan: Pedestrian[]; next: number } = { day: 0, plan: [], next: 0 }

function spawn(p: Pedestrian): PedestrianWalker {
  const w: PedestrianWalker = {
    ...createWalker(p.id, p.from, inwardHeading(p.from)),
    ped: p,
    turningIn: p.walkIn,
  }
  // The sidewalk is open ground: no path to plan, just along their lane. One
  // who'll walk in stops at the driveway first, so a fast frame can't carry
  // them past it.
  const goal = p.walkIn ? turnInTile(p) : p.to
  w.waypoints = [grid.tileToWorld(goal.tx, goal.tz)]
  walkers.set(p.id, w)
  ambientPos.set(p.id, w.pos)
  return w
}

function remove(id: string): void {
  walkers.delete(id)
  ambientPos.delete(id)
}

/**
 * Hands a passer-by over to the store as a customer, if the lot still takes
 * visitors. Returns whether they walked in.
 */
function walkIn(w: PedestrianWalker): boolean {
  const id = useGame.getState().walkIn(w.ped.variant)
  if (!id) return false
  walkInSpawns.set(id, { pos: { ...w.pos }, heading: w.heading, exit: w.ped.to })
  remove(w.ped.id)
  return true
}

/** Moves a passer-by on. Returns false once they've left the sidewalk (either way). */
function update(w: PedestrianWalker, seconds: number): boolean {
  walk(w, w.ped.speed, seconds, null)
  if (w.waypoints.length > 0) return true
  // At the driveway: walk in, or carry on if the lot's done for the day.
  if (w.turningIn) {
    w.turningIn = false
    if (walkIn(w)) return false
    w.waypoints = [grid.tileToWorld(w.ped.to.tx, w.ped.to.tz)]
    return true
  }
  remove(w.ped.id)
  return false
}

const PedestrianFigure = memo(function PedestrianFigure({
  id,
  variant,
  anim,
  speed,
}: {
  id: string
  variant: CustomerVariant
  anim: Walker['anim']
  speed: number
}) {
  return (
    <group
      ref={(g) => {
        if (g) groups.set(id, g)
        else groups.delete(id)
      }}
    >
      <Suspense fallback={null}>
        <Character variant={variant} anim={anim} moveSpeed={speed} />
      </Suspense>
    </group>
  )
})

/**
 * Passers-by on the sidewalk, from a plan made from the day's number (see
 * `sim/pedestrians.ts`), so the store never hears of them. A few turn in at
 * the driveway and become customers (the store's `walkIn`); the rest walk on by.
 * Re-renders only when someone steps onto or off the sidewalk.
 */
export function Pedestrians() {
  const [ids, setIds] = useState<string[]>([])

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    let changed = false
    if (today.day !== game.clock.day) {
      for (const id of [...walkers.keys()]) remove(id)
      const day = game.clock.day
      Object.assign(today, {
        day,
        plan: planPedestrians(createRng(PEDESTRIAN_SEED + day), day),
        next: 0,
      })
      changed = true
    }
    // Not until the running time has caught up with a new day, or it'd be yesterday's evening.
    if (!isPaused(game) && gameTime.day === today.day) {
      const { due, next } = takeDuePedestrians(today.plan, today.next, gameTime.minute)
      today.next = next
      for (const p of due) spawn(p)
      if (due.length > 0) changed = true
    }
    const { seconds } = frameSeconds(rawDelta, game.timeScale)
    for (const w of [...walkers.values()]) if (!update(w, seconds)) changed = true
    syncGroups(groups, walkers)
    if (changed) setIds([...walkers.keys()])
  })

  return (
    <>
      {ids.map((id) => {
        const w = walkers.get(id)
        if (!w) return null
        return (
          <PedestrianFigure
            key={id}
            id={id}
            variant={w.ped.variant}
            anim={w.anim}
            speed={w.ped.speed}
          />
        )
      })}
    </>
  )
}
