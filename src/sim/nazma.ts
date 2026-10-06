import type { StaffVariant } from './characters'
import { CLOSE_MINUTE, CLOCK_STEP_MINUTES, OPEN_MINUTE } from './clock'
import { availableCars, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import { createRng, type Rng } from './rng'

/**
 * Nazma, a disgruntled former employee (he/him), out to ruin the business.
 * On some days he walks onto the lot and smudges a few cars, so they need
 * washing again. The player can confront him to run him off. His visits are
 * rebuilt from the day number, so nothing about him is saved.
 */

/** Nazma's id in the world (crowd, chatter, action target). */
export const NAZMA_ID = 'nazma'
/** A staff model, as he used to work here, in a dark hoodie (see scene/Nazma). */
export const NAZMA_VARIANT: StaffVariant = 'male-c'

/** His first visit, always: the day he's introduced. */
export const FIRST_NAZMA_DAY = 4
/** Chance of a visit on any later day, without a guard. */
export const VISIT_CHANCE = 0.35
/** A guard on the payroll scales the visit chance by this. */
export const GUARD_DETERRENCE = 0.4
const NAZMA_SEED = 18_000

/** Cars he means to smudge on a visit, if there are that many. */
export const SMUDGE_TARGETS = { min: 2, max: 3 }
/** He turns up between 10:00 and 15:00, so there's time to deal with him. */
export const ARRIVAL_WINDOW = { from: OPEN_MINUTE + 60, to: CLOSE_MINUTE - 3 * 60 }

export type NazmaScheme = 'smudge' | 'poach'

/**
 * - coming: not on the lot yet
 * - onLot: walking from target to target
 * - done: left of his own accord
 * - runOff: chased off (and on his way out, or gone)
 */
export type NazmaStatus = 'coming' | 'onLot' | 'done' | 'runOff'

export interface NazmaVisit {
  scheme: NazmaScheme
  /** Car ids to smudge, in order. */
  targets: string[]
  /** Game minute he steps onto the lot. */
  arrivalMinute: number
  status: NazmaStatus
  /** How many of `targets` he has dealt with so far. */
  progress: number
}

export type RunOffBy = 'player' | 'guard'

/** A car Nazma drove off with overnight (from 9c). */
export interface StolenCar {
  model: CarModel
  cost: number
  floored: boolean
}

/** What Nazma got up to today, for the summary. */
export interface NazmaStats {
  visited: boolean
  smudged: number
  runOff: RunOffBy | null
  stolen: StolenCar[]
  /** Employees he talked into thinking of quitting (from 9d). */
  poached: string[]
  /** Employees who quit at closing (from 9d). */
  quit: string[]
}

export function emptyNazmaStats(): NazmaStats {
  return { visited: false, smudged: 0, runOff: null, stolen: [], poached: [], quit: [] }
}

/**
 * Whether Nazma visits on `day`: never before `FIRST_NAZMA_DAY`, always on it,
 * then a seeded roll against `VISIT_CHANCE`, less with a guard on the payroll.
 */
export function isNazmaDay(day: number, guarded: boolean): boolean {
  if (day < FIRST_NAZMA_DAY) return false
  if (day === FIRST_NAZMA_DAY) return true
  const chance = VISIT_CHANCE * (guarded ? GUARD_DETERRENCE : 1)
  return createRng(NAZMA_SEED + day).next() < chance
}

/** The seed for the day's visit plan, apart from the roll in `isNazmaDay`. */
export const visitSeed = (day: number) => NAZMA_SEED + 500 + day

/** `items` in a random order. */
function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The day's visit: two or three cars to smudge, out on the lot first (they're
 * nearer the street), and when he turns up. Null when there's nothing in stock
 * for him to spoil.
 */
export function planVisit(rng: Rng, inventory: readonly InventoryCar[]): NazmaVisit | null {
  const cars = availableCars(inventory)
  if (cars.length === 0) return null
  const lot = shuffled(
    rng,
    cars.filter((c) => c.location === 'lot'),
  )
  const showroom = shuffled(
    rng,
    cars.filter((c) => c.location === 'showroom'),
  )
  const count = rng.int(SMUDGE_TARGETS.min, SMUDGE_TARGETS.max)
  const steps = (ARRIVAL_WINDOW.to - ARRIVAL_WINDOW.from) / CLOCK_STEP_MINUTES
  return {
    scheme: 'smudge',
    targets: [...lot, ...showroom].slice(0, count).map((c) => c.id),
    arrivalMinute: ARRIVAL_WINDOW.from + rng.int(0, steps) * CLOCK_STEP_MINUTES,
    status: 'coming',
    progress: 0,
  }
}

/** The car he's heading for next, or null once he's been round them all. */
export function nextTarget(visit: NazmaVisit): string | null {
  return visit.targets[visit.progress] ?? null
}

/** Why the player can't confront Nazma right now, or null if they can. */
export function confrontBlocker(visit: NazmaVisit | null): string | null {
  if (visit?.status === 'onLot') return null
  return visit?.status === 'runOff' || visit?.status === 'done'
    ? 'Nazma is already leaving.'
    : "Nazma isn't here."
}

const cars = (n: number) => `${n} car${n === 1 ? '' : 's'}`

/**
 * The summary's line for Nazma: "Smudged 2 cars", "Run off by you (smudged 1
 * car first)". Null if he didn't visit.
 */
export function nazmaSummary(stats: NazmaStats): string | null {
  if (!stats.visited) return null
  const smudged = stats.smudged > 0 ? `smudged ${cars(stats.smudged)}` : null
  if (stats.runOff) {
    const by = stats.runOff === 'player' ? 'you' : 'your guard'
    return smudged ? `Run off by ${by} (${smudged} first)` : `Run off by ${by} before he did harm`
  }
  return smudged ? smudged[0].toUpperCase() + smudged.slice(1) : 'Came and went'
}
