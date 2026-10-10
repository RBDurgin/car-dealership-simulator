import type { CharacterVariant } from './characters'
import { CLOCK_STEP_MINUTES, CLOSE_MINUTE, OPEN_MINUTE } from './clock'
import { PLAYER_ID } from './customers'
import { createRng, type Rng } from './rng'
import type { Employee } from './staff'

/**
 * Nazma (he/him), who runs the cupcake shop across the road. A friendly
 * neighbour: now and then he pops over, says hello to the player or one of
 * the staff, maybe helps himself to a coffee, and heads home. He changes no
 * money, patience or stats, and nobody can confront him. His visits are
 * rebuilt from the day number and never saved; `scene/Nazma` walks him.
 */

/** Nazma's id in the world (chatter, `runtime.ambientPos`). */
export const NAZMA_ID = 'nazma'
/** His model (in an apron tint, see scene/Nazma). */
export const NAZMA_VARIANT: CharacterVariant = 'male-e'

/** His first visit, always: the day after the shop shows up in the tip. */
export const FIRST_NAZMA_DAY = 2
/** Chance of a visit on any later day Jaguar isn't coming. */
export const NAZMA_VISIT_CHANCE = 0.3
const NAZMA_SEED = 23_000

/** He comes over between 9:30 and 16:00. */
export const NAZMA_WINDOW = { from: OPEN_MINUTE + 30, to: CLOSE_MINUTE - 2 * 60 }
/** The coffee machine in the lounge, one of the stops he might make. */
export const COFFEE_STOP = 'coffee-machine'
/** Stops he makes on a visit. */
export const NAZMA_STOPS = { min: 1, max: 2 }
/** Game seconds he spends at a stop, chatting (or over the coffee). */
export const STOP_SECONDS = 8

/**
 * - coming: not over the road yet
 * - onLot: making his stops
 * - done: gone home
 */
export type NazmaStatus = 'coming' | 'onLot' | 'done'

export interface NazmaVisit {
  /** Who he stops by, in order: `PLAYER_ID`, an employee id or `COFFEE_STOP`. */
  stops: string[]
  /** Game minute he steps onto the lot. */
  arrivalMinute: number
  status: NazmaStatus
  /** How many of `stops` he has made so far. */
  progress: number
  /** He's reached a person at his stop and is chatting with them. */
  chatting: boolean
}

/**
 * Whether Nazma pops over on `day`: always on `FIRST_NAZMA_DAY`, then a
 * seeded roll against `NAZMA_VISIT_CHANCE`. Never on a day Jaguar visits
 * (`jaguarDay`), so a click on someone strange is always Jaguar.
 */
export function isNazmaVisitDay(day: number, jaguarDay = false): boolean {
  if (jaguarDay || day < FIRST_NAZMA_DAY) return false
  if (day === FIRST_NAZMA_DAY) return true
  return createRng(NAZMA_SEED + day).next() < NAZMA_VISIT_CHANCE
}

/** The seed for the day's visit plan, apart from the roll in `isNazmaVisitDay`. */
export const nazmaSeed = (day: number) => NAZMA_SEED + 500 + day

/**
 * The day's visit: when he comes over, and one or two stops: the player,
 * someone on the payroll (who he'll find at their post) or the coffee
 * machine, never the same one twice.
 */
export function planNazmaVisit(rng: Rng, roster: readonly Employee[]): NazmaVisit {
  const steps = (NAZMA_WINDOW.to - NAZMA_WINDOW.from) / CLOCK_STEP_MINUTES
  const arrivalMinute = NAZMA_WINDOW.from + rng.int(0, steps) * CLOCK_STEP_MINUTES
  const pool = [PLAYER_ID, COFFEE_STOP, ...roster.filter((e) => !e.fired).map((e) => e.id)]
  const count = rng.int(NAZMA_STOPS.min, NAZMA_STOPS.max)
  const stops: string[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    stops.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0])
  }
  return { stops, arrivalMinute, status: 'coming', progress: 0, chatting: false }
}

/** The stop he's heading for next, or null once he's made them all. */
export function nextStop(visit: NazmaVisit): string | null {
  return visit.stops[visit.progress] ?? null
}

/** Whom he's chatting with right now (a person, never the coffee machine), or null. */
export function chattingWith(visit: NazmaVisit | null): string | null {
  if (visit?.status !== 'onLot' || !visit.chatting) return null
  const stop = nextStop(visit)
  return stop && stop !== COFFEE_STOP ? stop : null
}

/** The shop's hours, for the Nazma's tab (it opens before you do and closes after). */
export const SHOP_HOURS = { open: OPEN_MINUTE - 2 * 60, close: CLOSE_MINUTE + 60 }

export interface CupcakeFlavour {
  name: string
  /** A line about it, as Nazma would put it. */
  note: string
}

/** The cupcakes Nazma bakes as the day's special, one a day. */
export const CUPCAKE_FLAVOURS: readonly CupcakeFlavour[] = [
  { name: 'Salted caramel', note: 'A pinch of sea salt on top. Trust him.' },
  { name: 'Red velvet', note: 'Cream cheese frosting, piled high.' },
  { name: 'Lemon meringue', note: 'Toasted meringue with a sharp lemon curd middle.' },
  { name: 'Double chocolate', note: 'Chocolate sponge, chocolate frosting, chocolate chips.' },
  { name: 'Strawberry shortcake', note: 'Fresh strawberries and whipped cream.' },
  { name: 'Espresso', note: 'Made with the same beans as your coffee machine. Probably.' },
  { name: 'Carrot cake', note: 'Walnuts, cinnamon and a cream cheese swirl.' },
  { name: 'Pistachio rose', note: 'Pale green, a little fancy, gone by noon.' },
  { name: 'Cookies and cream', note: 'Crushed biscuits in the sponge and on top.' },
  { name: 'Blueberry crumble', note: 'Buttery crumble over a blueberry centre.' },
  { name: 'Peanut butter', note: 'With a spoonful of jam hidden inside.' },
  { name: 'Vanilla sprinkle', note: 'The classic, for anyone who just wants a cupcake.' },
]

const SPECIAL_SEED = NAZMA_SEED + 900
const specials: number[] = []

/**
 * Index into `CUPCAKE_FLAVOURS` of `day`'s special: a seeded pick, never the
 * same as the day before's. Each day depends on the one before, so the chain
 * is replayed from day 1 and memoised.
 */
function specialIndex(day: number): number {
  const n = CUPCAKE_FLAVOURS.length
  for (let d = specials.length + 1; d <= day; d++) {
    const rng = createRng(SPECIAL_SEED + d)
    const prev = specials[d - 2]
    specials.push(prev === undefined ? rng.int(0, n - 1) : (prev + 1 + rng.int(0, n - 2)) % n)
  }
  return specials[day - 1]
}

/** `day`'s cupcake special at Nazma's (derived from the day, never saved). */
export function specialOf(day: number): CupcakeFlavour {
  return CUPCAKE_FLAVOURS[specialIndex(Math.max(1, Math.floor(day)))]
}
