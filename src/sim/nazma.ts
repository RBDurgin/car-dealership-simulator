import type { StaffVariant } from './characters'
import { carName } from './interactables'
import { CLOSE_MINUTE, CLOCK_STEP_MINUTES, OPEN_MINUTE } from './clock'
import { availableCars, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import { createRng, type Rng } from './rng'
import { isPoachable, type Employee } from './staff'

/**
 * Nazma, a disgruntled former employee (he/him), out to ruin the business.
 * On some days he walks onto the lot and smudges a few cars, so they need
 * washing again, or has a word with one of the staff, who then thinks of
 * quitting. The player can confront him to run him off. Some nights he
 * drives a car off the lot, unless a guard is on the payroll. His visits and
 * thefts are rebuilt from the day number, so nothing about him is saved.
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
/** Chance a visit is to poach one of the staff, when there's anyone he could. */
export const POACH_CHANCE = 0.4
/** Game seconds of chat it takes him to talk someone into quitting. */
export const POACH_SECONDS = 6
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
  /** Car ids to smudge, in order, or the one employee id he's come to poach. */
  targets: string[]
  /** Game minute he steps onto the lot. */
  arrivalMinute: number
  status: NazmaStatus
  /** How many of `targets` he has dealt with so far. */
  progress: number
  /** Poaching: he's reached his target and is talking them round. */
  chatting: boolean
}

export type RunOffBy = 'player' | 'guard'

/** A car Nazma drove off with overnight. */
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
  /** A guard on the payroll stopped a theft last night. */
  foiled: boolean
  /** Names of the employees he talked into thinking of quitting. */
  poached: string[]
  /** Names of those who quit at closing. */
  quit: string[]
  /** Those the player kept with a raise (a day's wage added). */
  kept: { name: string; raise: number }[]
}

export function emptyNazmaStats(): NazmaStats {
  return {
    visited: false,
    smudged: 0,
    runOff: null,
    stolen: [],
    foiled: false,
    poached: [],
    quit: [],
    kept: [],
  }
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

/** When he turns up: a whole clock step in `ARRIVAL_WINDOW`. */
function arrivalMinute(rng: Rng): number {
  const steps = (ARRIVAL_WINDOW.to - ARRIVAL_WINDOW.from) / CLOCK_STEP_MINUTES
  return ARRIVAL_WINDOW.from + rng.int(0, steps) * CLOCK_STEP_MINUTES
}

/** Someone from `staff` to poach, the more skilled the likelier (skill squared). */
function pickPoachTarget(rng: Rng, staff: readonly Employee[]): Employee {
  let roll = rng.next() * staff.reduce((sum, e) => sum + e.skill ** 2, 0)
  return staff.find((e) => (roll -= e.skill ** 2) < 0) ?? staff[staff.length - 1]
}

/**
 * The day's visit. With anyone on the payroll he could poach (see
 * `isPoachable`), it's sometimes (`POACH_CHANCE`) to talk one of them into
 * quitting, the seasoned ones most of all. Otherwise it's two or three cars to
 * smudge, out on the lot first (they're nearer the street). Either way, when he
 * turns up. Null when there's nothing in stock for him to spoil and nobody to
 * poach.
 */
export function planVisit(
  rng: Rng,
  inventory: readonly InventoryCar[],
  roster: readonly Employee[] = [],
): NazmaVisit | null {
  const staff = roster.filter(isPoachable)
  if (staff.length > 0 && rng.next() < POACH_CHANCE) {
    return {
      scheme: 'poach',
      targets: [pickPoachTarget(rng, staff).id],
      arrivalMinute: arrivalMinute(rng),
      status: 'coming',
      progress: 0,
      chatting: false,
    }
  }
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
  return {
    scheme: 'smudge',
    targets: [...lot, ...showroom].slice(0, count).map((c) => c.id),
    arrivalMinute: arrivalMinute(rng),
    status: 'coming',
    progress: 0,
    chatting: false,
  }
}

/** The car (or employee) he's heading for next, or null once he's been round them all. */
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

/** The first morning a car can be gone. */
export const FIRST_THEFT_DAY = 6
/** Chance he tries his luck on any night, once he can. */
export const THEFT_CHANCE = 0.15
/** He lies low for this many nights after a try, caught or not. */
export const THEFT_GAP_DAYS = 3
const THEFT_SEED = 19_000

/**
 * Whether Nazma tries to steal a car on the night before `day`'s morning: a
 * seeded roll from `FIRST_THEFT_DAY` on, never within `THEFT_GAP_DAYS` of his
 * last try. The gap is found by replaying earlier nights, so nothing is saved.
 */
export function isTheftNight(day: number): boolean {
  let last = -Infinity
  for (let d = FIRST_THEFT_DAY; d <= day; d++) {
    if (d - last < THEFT_GAP_DAYS) continue
    if (createRng(THEFT_SEED + d).next() < THEFT_CHANCE) {
      if (d === day) return true
      last = d
    }
  }
  return false
}

/** The seed for picking which car goes, apart from the roll in `isTheftNight`. */
export const theftSeed = (day: number) => THEFT_SEED + 500 + day

/** How a night's theft went: a car gone, or a guard ran him off. */
export type NightTheft = { outcome: 'stolen'; car: InventoryCar } | { outcome: 'foiled' }

/**
 * The night before `day`: on a theft night Nazma goes for an available lot car
 * (the showroom is locked), the pricier the likelier. A guard on the payroll
 * stops him. Null on a quiet night, or with nothing on the lot to take.
 */
export function planTheft(
  rng: Rng,
  day: number,
  inventory: readonly InventoryCar[],
  guarded: boolean,
): NightTheft | null {
  if (!isTheftNight(day)) return null
  const lot = availableCars(inventory).filter((c) => c.location === 'lot')
  if (lot.length === 0) return null
  if (guarded) return { outcome: 'foiled' }
  let roll = rng.next() * lot.reduce((sum, c) => sum + c.msrp, 0)
  const car = lot.find((c) => (roll -= c.msrp) < 0) ?? lot[lot.length - 1]
  return { outcome: 'stolen', car }
}

/** What goes in the day's tally for a stolen `car`. */
export function stolenRecord(car: InventoryCar): StolenCar {
  return { model: car.model, cost: car.cost, floored: car.floored }
}

const cars = (n: number) => `${n} car${n === 1 ? '' : 's'}`

const names = (list: readonly string[]) => list.join(' and ')

function visitSummary(stats: NazmaStats, money: (n: number) => string): string | null {
  if (!stats.visited) return null
  const keptNames = stats.kept.map((k) => k.name)
  const lost = stats.poached.filter((n) => !keptNames.includes(n))
  const kept = stats.poached.filter((n) => keptNames.includes(n))
  const harm = [
    stats.smudged > 0 && `smudged ${cars(stats.smudged)}`,
    lost.length > 0 && `poached ${names(lost)}`,
    kept.length > 0 && `tried to poach ${names(kept)}`,
  ]
    .filter(Boolean)
    .join(', ')
  let line: string
  if (stats.runOff) {
    const by = stats.runOff === 'player' ? 'you' : 'your guard'
    line = harm ? `run off by ${by} (${harm} first)` : `run off by ${by} before he did harm`
  } else line = harm || 'came and went'
  const raises = stats.kept.map((k) => `you kept ${k.name} (+${money(k.raise)}/day)`)
  return [line, ...raises].join('; ')
}

function theftSummary(stats: NazmaStats): string | null {
  if (stats.stolen.length > 0) {
    return `stole ${stats.stolen.map((c) => `the ${carName(c.model)}`).join(' and ')} overnight`
  }
  return stats.foiled ? 'tried to steal a car overnight, but your guard ran him off' : null
}

/**
 * The summary's line for Nazma: "Smudged 2 cars", "Run off by you (smudged 1
 * car first)", "Stole the Summit Ridge overnight; smudged 2 cars", "Poached
 * Dana", "Tried to poach Dana; you kept Dana (+$25/day)". Null if he left the
 * place alone.
 */
export function nazmaSummary(
  stats: NazmaStats,
  money: (n: number) => string = (n) => `$${n}`,
): string | null {
  const line = [theftSummary(stats), visitSummary(stats, money)].filter(Boolean).join('; ')
  return line ? line[0].toUpperCase() + line.slice(1) : null
}
