import { ARCHETYPES } from './archetypes'
import { PLAYER_ID, type Customer } from './customers'
import { carName } from './interactables'
import type { InventoryCar } from './inventory'
import type { Rng } from './rng'
import type { Topic } from './talkingPoints'

/**
 * Test drives (Phase 20): a shopper takes the car they're talking about out
 * on the road, with the player riding along. The car drives out of the gate
 * and off the map (scene/DrivenCar), and comes back to its space. A good
 * drive warms them to the car: better odds of a yes (`driveBonus`) and a
 * smaller discount hoped for (`driveExpect`). A shopper who asked for a drive
 * and got a price instead is cooler (`NO_DRIVE_PENALTY`).
 */

/** How a talking point suited the buyer (20b). */
export type TopicFit = 'good' | 'ok' | 'poor'

/** One talking point made on the drive (20b). */
export interface TalkingPoint {
  /** What was pointed out, or null for a prompt left unanswered. */
  topic: Topic | null
  fit: TopicFit
}

/** A shopper's test drive, from setting off to the car until it's back. One per visit. */
export interface TestDrive {
  /** The lot car they drive: their target, or a lot car of its model for a showroom target. */
  carId: string
  /** Who rides along: `PLAYER_ID` or an employee id. */
  by: string
  /** Game minutes the drive takes, from setting off until it's back in its space. */
  minutes: number
  /** The talking points made on the way (20b). */
  points: TalkingPoint[]
  /** The topics offered at the prompt that's up now, or null (20b). */
  offered: Topic[] | null
  /** Brought back early (Head back). */
  cut: boolean
  /** Came back with a dent (20c). */
  ding: boolean
  /** Back in its space: the drive is over and `score` is set. */
  back: boolean
  /** How well it went, 0–1 (see `driveScore`), once back. */
  score: number
}

/** A drive's length in game minutes. */
export const DRIVE_MINUTES = { min: 20, max: 35 }

/** How long this drive takes, in game minutes. */
export function driveMinutes(rng: Rng): number {
  return rng.int(DRIVE_MINUTES.min, DRIVE_MINUTES.max)
}

/** Head back: the car turns for home within this many game minutes. */
export const HEAD_BACK_MINUTES = 1

/** The car a shopper would drive, or why there's none. */
export type Drivable =
  { car: InventoryCar; reason?: undefined } | { car?: undefined; reason: string }

const same = (a: InventoryCar, b: InventoryCar) => a.model === b.model && !!a.used === !!b.used

/**
 * The car `c` would take out: their target if it's on a lot space, or, for a
 * showroom car (which can't leave its platform), a lot car of the same model
 * (new or used like it). Otherwise why there's nothing to drive.
 */
export function drivableCar(
  c: Pick<Customer, 'targetCarId'>,
  inventory: readonly InventoryCar[],
): Drivable {
  const target = inventory.find((x) => x.id === c.targetCarId)
  if (!target || target.status === 'sold') return { reason: "There's no car picked out to drive." }
  const name = carName(target.model)
  if (target.location === 'lot') {
    if (target.status === 'available') return { car: target }
    if (target.status === 'out') return { reason: `The ${name} is out on a drive.` }
    return { reason: `The ${name} is in the shop.` }
  }
  const twin = inventory.find(
    (x) => x.location === 'lot' && x.status === 'available' && same(x, target),
  )
  if (twin) return { car: twin }
  const out = inventory.some((x) => x.location === 'lot' && x.status === 'out' && same(x, target))
  return {
    reason: out
      ? `The ${name} on the lot is out on a drive.`
      : `There's no ${name} on the lot to drive, and the showroom car stays put.`,
  }
}

/** A drive set off for, still to come back. */
export const drivePending = (c: Pick<Customer, 'drive'>): boolean => !!c.drive && !c.drive.back

/** Why the player can't take `c` for a test drive now, or null if they can. */
export function driveBlocker(c: Customer, inventory: readonly InventoryCar[]): string | null {
  if (c.selling || c.service) return `${c.name} isn't shopping.`
  if (c.drive?.back) return `${c.name} has had their drive.`
  if (c.drive) return `${c.name} is on the way to the car.`
  if (c.phase !== 'talking' || c.offer) return `${c.name} is busy.`
  return drivableCar(c, inventory).reason ?? null
}

/** A new drive in `car` with `by` riding along. */
export function newDrive(carId: string, by: string, minutes: number): TestDrive {
  return {
    carId,
    by,
    minutes,
    points: [],
    offered: null,
    cut: false,
    ding: false,
    back: false,
    score: 0,
  }
}

/** What any drive scores before the talking points, the car's looks and a cut. */
export const DRIVE_BASE = 0.5
/** What each talking point adds (20b). */
export const POINT_SCORE: Record<TopicFit, number> = { good: 0.2, ok: 0.05, poor: -0.1 }
/** A drive brought back early keeps this share of its score. */
export const CUT_KEEPS = 0.5
/** ± from a spotless car to a filthy one, and from a used car's best condition to its worst. */
export const LOOKS_SCORE = 0.1

/**
 * How well `drive` in `car` went for `c`, 0–1: a base, plus the talking
 * points, plus how clean the car is and (used) its condition, and only
 * part of it for a drive cut short.
 */
export function driveScore(
  drive: Pick<TestDrive, 'points' | 'cut'>,
  _c: Pick<Customer, 'archetype'>,
  car: Pick<InventoryCar, 'cleanliness' | 'used'>,
): number {
  const points = drive.points.reduce((sum, p) => sum + POINT_SCORE[p.fit], 0)
  const looks =
    LOOKS_SCORE * (2 * car.cleanliness - 1) +
    (car.used ? LOOKS_SCORE * (2 * car.used.condition - 1) : 0)
  const score = (DRIVE_BASE + points + looks) * (drive.cut ? CUT_KEEPS : 1)
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000
}

/** What a drive adds to the odds of a yes, from a score of 0 to one of 1. */
export const DRIVE_BONUS = { min: 0.05, max: 0.15 }

/** What a drive scoring `score` adds to the odds of a yes, × the level's `scale`. */
export function driveBonus(score: number, scale = 1): number {
  return (DRIVE_BONUS.min + (DRIVE_BONUS.max - DRIVE_BONUS.min) * score) * scale
}

/** The most of the discount they hope for a perfect drive lets go. */
export const MAX_EXPECT_CUT = 1 / 3

/** The discount `c` hopes for after a drive scoring `score`: up to a third less. */
export function driveExpect(c: Pick<Customer, 'expect'>, score: number): number {
  return Math.round(c.expect * (1 - MAX_EXPECT_CUT * score) * 1000) / 1000
}

/** Off the odds of a yes for a shopper who asked to drive the car and got a price instead. */
export const NO_DRIVE_PENALTY = 0.05

/**
 * What the test drive does to `c`'s odds of a yes: the drive's bonus once
 * they're back, or `NO_DRIVE_PENALTY` while they wanted one there was a car
 * for and haven't had it. `scale` is the level's `Tuning.driveBonus`.
 */
export function driveBonusFor(
  c: Pick<Customer, 'drive' | 'wantsDrive' | 'targetCarId'>,
  inventory: readonly InventoryCar[],
  scale = 1,
): number {
  if (c.drive?.back) return driveBonus(c.drive.score, scale)
  if (c.wantsDrive && !c.drive && drivableCar(c, inventory).car) return -NO_DRIVE_PENALTY
  return 0
}

/**
 * Which of the `arrived` shoppers will ask to drive the car, by their
 * archetype's `drive`. One roll each from `rng` (its own stream), so the rest
 * of the day plays as before. Sellers and service clients never ask.
 */
export function assignDriveAsk(arrived: readonly Customer[], rng: Rng): Customer[] {
  return arrived.map((c) => {
    const roll = rng.next()
    const asks = !c.selling && !c.service && roll < ARCHETYPES[c.archetype].drive
    return asks === c.wantsDrive ? c : { ...c, wantsDrive: asks }
  })
}

/** Whether the player is out on a test drive. */
export function playerRiding(customers: readonly Customer[]): boolean {
  return customers.some((c) => c.phase === 'driving' && c.handlerId === PLAYER_ID)
}

/**
 * The cars that should be out: those a shopper is walking to or driving.
 * Everything else that's out comes back (a drive called off, or closing).
 */
function carsHeld(customers: readonly Customer[]): Set<string> {
  const held = new Set<string>()
  for (const c of customers)
    if (c.drive && !c.drive.back && c.phase !== 'leaving') held.add(c.drive.carId)
  return held
}

/**
 * Takes out the cars shoppers are on their way to or driving, and brings
 * back any that's out with nobody driving it. Returns the same array when
 * nothing changed.
 */
export function syncCarsOut(
  inventory: InventoryCar[],
  customers: readonly Customer[],
): InventoryCar[] {
  const held = carsHeld(customers)
  const change = (c: InventoryCar) =>
    (c.status === 'available' && held.has(c.id)) || (c.status === 'out' && !held.has(c.id))
  if (!inventory.some(change)) return inventory
  return inventory.map((c) =>
    change(c) ? { ...c, status: c.status === 'out' ? 'available' : 'out' } : c,
  )
}

/** A drive scoring this or more went really well. */
export const DRIVE_LOVED = 0.6

/** What `c` says getting out of the car after a drive scoring `score`. */
export function driveLine(score: number, cut: boolean): string {
  if (cut) return 'Back already? It was nice, what I saw of it.'
  if (score >= DRIVE_LOVED) return 'What a drive! I could get used to that.'
  if (score >= 0.35) return 'It drives nicely.'
  return "Hmm. It's fine, I suppose."
}
