import { CUSTOMER_VARIANTS, type CustomerVariant } from './characters'
import { CLOSE_MINUTE, OPEN_MINUTE } from './clock'
import type { Tile } from './grid'
import { NO_EFFECTS, type Effects } from './improvements'
import { GRID_WIDTH, LOT_ENTRY_TILES, SIDEWALK_ENDS } from './layout'
import type { Rng } from './rng'

/**
 * Passers-by on the sidewalk. A day's are planned up front from its number, so
 * the store never hears about them: the world (scene/Pedestrians) walks each one
 * from one end of the sidewalk to the other. A few turn in at the driveway and
 * become customers (the store's `walkIn`).
 */
export interface Pedestrian {
  id: string
  variant: CustomerVariant
  /** Game minute they step onto the sidewalk. */
  minute: number
  /** Sidewalk end they set off from. */
  from: Tile
  /** Sidewalk end they're heading for, on the same lane. */
  to: Tile
  /** Walking speed, units per second: some stroll, some hurry. */
  speed: number
  /** They'll turn in at the driveway, if the lot still takes visitors when they reach it. */
  walkIn: boolean
}

export const PEDESTRIANS_PER_DAY = { min: 18, max: 26 }
/** Share of passers-by who wander in and become customers. */
export const WALK_IN_CHANCE = 0.15
export const PEDESTRIAN_SPEED = { min: 1.3, max: 1.9 }

/**
 * Plans a day's passers-by, spread evenly over business hours, sorted by when
 * they set off. Improvements up that day draw more of them, and more turn in.
 */
export function planPedestrians(
  rng: Rng,
  day: number,
  effects: Effects = NO_EFFECTS,
): Pedestrian[] {
  const count = rng.int(PEDESTRIANS_PER_DAY.min, PEDESTRIANS_PER_DAY.max) + effects.passersBy
  const walkInChance = WALK_IN_CHANCE + effects.walkInChance
  const minutes = Array.from({ length: count }, () =>
    Math.round(OPEN_MINUTE + rng.next() * (CLOSE_MINUTE - OPEN_MINUTE)),
  ).sort((a, b) => a - b)
  return minutes.map((minute, i) => {
    const from = rng.pick(SIDEWALK_ENDS)
    // Straight along their lane to the far end.
    const to = SIDEWALK_ENDS.find((t) => t.tz === from.tz && t.tx !== from.tx)!
    return {
      id: `pedestrian-${day}-${i + 1}`,
      variant: rng.pick(CUSTOMER_VARIANTS),
      minute,
      from,
      to,
      speed: PEDESTRIAN_SPEED.min + rng.next() * (PEDESTRIAN_SPEED.max - PEDESTRIAN_SPEED.min),
      walkIn: rng.next() < walkInChance,
    }
  })
}

/**
 * Where a passer-by who walks in leaves the sidewalk: on their lane, in line
 * with the lot entry nearest the end they came from.
 */
export function turnInTile(p: Pick<Pedestrian, 'from'>): Tile {
  const entries = [...LOT_ENTRY_TILES].sort((a, b) => a.tx - b.tx)
  const entry = p.from.tx < GRID_WIDTH / 2 ? entries[0] : entries[entries.length - 1]
  return { tx: entry.tx, tz: p.from.tz }
}

/**
 * Passers-by who are due on the sidewalk by `minute`, from index `next` on.
 * Returns them and the index to carry on from.
 */
export function takeDuePedestrians(
  plan: readonly Pedestrian[],
  next: number,
  minute: number,
): { due: Pedestrian[]; next: number } {
  let i = next
  while (i < plan.length && plan[i].minute <= minute) i++
  return { due: plan.slice(next, i), next: i }
}
