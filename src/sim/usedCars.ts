import { calendarOf } from './calendar'
import { BASE_MSRP, roundTo100, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import type { Rng } from './rng'
import type { Slot } from './ordering'
import { slotPlacement } from './ordering'

/**
 * Used cars: what one is (year, miles, condition), what it's worth on a given
 * day, and how close an appraisal gets to that. A used car's worth falls by
 * `DAILY_DEPRECIATION` for every day since we took it in, which is what makes
 * holding one cost money.
 */

export interface UsedInfo {
  /** Model year, e.g. 2019. */
  year: number
  miles: number
  /** 1 like new, 0 a wreck. Rolled once, unlike `cleanliness`, which washing restores. */
  condition: number
  /** The day the dealership took it in. Its value falls from then on. */
  acquiredDay: number
}

/** The model year of a brand-new car in the game's year 1. */
export const FIRST_MODEL_YEAR = 2026
export const AGE_YEARS = { min: 2, max: 10 }
export const MILES_PER_YEAR = 12_000
/** Miles are `MILES_PER_YEAR` a year, give or take this fraction. */
export const MILES_JITTER = 0.35
/** A used car loses this fraction of its value each day after we take it in. */
export const DAILY_DEPRECIATION = 0.006
/** The appraiser the player counts as, on the 1–5 staff skill scale. */
export const PLAYER_SKILL = 3
/** An appraisal is off by up to this fraction for skill 1, and less as skill rises. */
export const APPRAISAL_NOISE_WORST = 0.2
export const APPRAISAL_NOISE_STEP = 0.04
/** The sticker on a used car is its market value plus this much. */
export const USED_MARKUP = 0.12

/**
 * How often each model comes in used: the everyday cars far more often than
 * the luxury SUV.
 */
export const USED_MODEL_WEIGHTS: Record<CarModel, number> = {
  'hatchback-sports': 5,
  sedan: 6,
  van: 3,
  suv: 5,
  'sedan-sports': 2,
  truck: 3,
  'suv-luxury': 1,
}

/** The model year of a new car on `day`. */
export function modelYear(day: number): number {
  return FIRST_MODEL_YEAR + calendarOf(day).year - 1
}

/** How old a car of `year` is on `day`, at least 1. */
export function ageOf(year: number, day: number): number {
  return Math.max(1, modelYear(day) - year)
}

function pickModel(rng: Rng): CarModel {
  const models = Object.keys(USED_MODEL_WEIGHTS) as CarModel[]
  let r = rng.next() * models.reduce((sum, m) => sum + USED_MODEL_WEIGHTS[m], 0)
  for (const m of models) {
    r -= USED_MODEL_WEIGHTS[m]
    if (r < 0) return m
  }
  return models[models.length - 1]
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * A random used car as it is on `day`: a model weighted by
 * `USED_MODEL_WEIGHTS`, 2–10 years old, about 12k miles a year, and a
 * condition that tends to be worse the older and further driven it is.
 */
export function rollUsedCar(rng: Rng, day: number): UsedInfo & { model: CarModel } {
  const model = pickModel(rng)
  const age = rng.int(AGE_YEARS.min, AGE_YEARS.max)
  const miles =
    Math.round((age * MILES_PER_YEAR * (1 + (rng.next() * 2 - 1) * MILES_JITTER)) / 100) * 100
  const wear = age * 0.05 + (miles / (age * MILES_PER_YEAR) - 1) * 0.2
  const condition = clamp(0.95 - wear + (rng.next() * 2 - 1) * 0.2, 0.05, 1)
  return { model, year: modelYear(day) - age, miles, condition, acquiredDay: day }
}

/** What's left of a new car's value after `years`: about 62% at 2 years, 22% at 10. */
export function ageCurve(years: number): number {
  return 0.8 * 0.88 ** years
}

/** Below 1 for more miles than its age would suggest, above 1 for fewer. */
export function mileFactor(miles: number, years: number): number {
  const expected = Math.max(1, years) * MILES_PER_YEAR
  return clamp(1 - 0.15 * (miles / expected - 1), 0.8, 1.1)
}

/** 0.8 for a wreck up to 1.05 for one like new. */
export function conditionFactor(condition: number): number {
  return 0.8 + 0.25 * clamp(condition, 0, 1)
}

/**
 * What a used `model` would fetch on `day`: its new price aged by year, miles
 * and condition, less `DAILY_DEPRECIATION` for each day since we took it in.
 * Rounded to $100.
 */
export function marketValue(model: CarModel, info: UsedInfo, day: number): number {
  const years = ageOf(info.year, info.acquiredDay)
  const fresh =
    BASE_MSRP[model] *
    ageCurve(years) *
    mileFactor(info.miles, years) *
    conditionFactor(info.condition)
  const held = Math.max(0, day - info.acquiredDay)
  return roundTo100(fresh * (1 - DAILY_DEPRECIATION) ** held)
}

/** How far off (as a fraction) an appraiser of `skill` may be: 20% at skill 1, 4% at 5. */
export function appraisalNoise(skill: number): number {
  return Math.max(0, APPRAISAL_NOISE_WORST - (skill - 1) * APPRAISAL_NOISE_STEP)
}

export interface Appraisal {
  /** The appraiser's best guess at the market value. */
  estimate: number
  /** How far either way they'd say it could be. */
  margin: number
}

/** How far off a quick look at a car may be, before anyone appraises it properly. */
export const GLANCE_NOISE = 0.25

/**
 * A guess at a used `model`'s value on `day`, off by up to `noise` (a
 * fraction) either way, with that much either way as its margin.
 */
export function estimateValue(
  model: CarModel,
  info: UsedInfo,
  day: number,
  noise: number,
  rng: Rng,
): Appraisal {
  const value = marketValue(model, info, day)
  return {
    estimate: roundTo100(value * (1 + (rng.next() * 2 - 1) * noise)),
    margin: roundTo100(value * noise),
  }
}

/**
 * An appraiser of `skill` sizing up a used `model` on `day`: an estimate within
 * `appraisalNoise(skill)` (× `noiseFactor`, the level's) of its true value, and
 * that much either way as margin.
 */
export function appraise(
  model: CarModel,
  info: UsedInfo,
  day: number,
  skill: number,
  rng: Rng,
  noiseFactor = 1,
): Appraisal {
  return estimateValue(model, info, day, appraisalNoise(skill) * noiseFactor, rng)
}

/** The sticker for a used car worth `value`: `USED_MARKUP` over, rounded to $100. */
export function usedListPrice(value: number): number {
  return roundTo100(value * (1 + USED_MARKUP))
}

/** A used car in stock's value today, or null for a new one. */
export function stockValue(car: InventoryCar, day: number): number | null {
  return car.used ? marketValue(car.model, car.used, day) : null
}

/**
 * A used car taken into stock on `day` in `slot` (on the lot), bought for
 * `cost`. It's always paid in cash, and it comes in dirty.
 */
export function usedStockCar(
  id: string,
  car: UsedInfo & { model: CarModel },
  slot: Slot,
  cost: number,
  day: number,
  cleanliness: number,
): InventoryCar {
  const { model, ...used } = car
  const { rect, facing } = slotPlacement(slot)
  return {
    id,
    model,
    location: slot.location,
    spaceIndex: slot.location === 'lot' ? slot.index : null,
    rect,
    facing,
    msrp: usedListPrice(marketValue(model, used, day)),
    cost,
    status: 'available',
    cleanliness,
    arrivedDay: day,
    floored: false,
    used,
  }
}

/** The first `used-<day>-<n>` id not already in `taken` (stock, or cars bought today). */
export function nextUsedId(taken: readonly { id: string }[], day: number): string {
  for (let n = 1; ; n++) {
    const id = `used-${day}-${n}`
    if (!taken.some((c) => c.id === id)) return id
  }
}

/** "Used · 2019 · 64k mi". */
export function usedTag(info: UsedInfo): string {
  return `Used · ${info.year} · ${Math.round(info.miles / 1000)}k mi`
}

/** "Fair (45%)": how a used car's `condition` reads in the panels. */
export function shapeLabel(condition: number): string {
  const word =
    condition >= 0.75 ? 'Good' : condition >= 0.5 ? 'Fair' : condition >= 0.25 ? 'Worn' : 'Rough'
  return `${word} (${Math.round(condition * 100)}%)`
}

/** After this many days in stock a used car is flagged as stale in the stock panel. */
export const STALE_DAYS = 10

/** A used car that's been in stock `STALE_DAYS` or more. Never a new one. */
export function isStale(car: InventoryCar, day: number): boolean {
  return !!car.used && day - car.used.acquiredDay >= STALE_DAYS
}

/** The most condition adds to (or takes off) a buyer's odds of saying yes to a used car. */
export const CONDITION_BONUS = 0.1

/** −10% for a wreck, 0 at middling, +10% for one like new. */
export function conditionBonus(condition: number): number {
  return CONDITION_BONUS * (2 * clamp(condition, 0, 1) - 1)
}

/**
 * The price a buyer thinks `car` is worth on `day`: its MSRP when new, or the
 * sticker its market value would carry today when used (`usedListPrice`). A
 * used car's sticker stays as it was when it came in, so this falls under it
 * the longer it sits.
 */
export function fairPrice(car: InventoryCar, day: number): number {
  return car.used ? usedListPrice(marketValue(car.model, car.used, day)) : car.msrp
}

/** At this multiple of a used car's market value, its price leaves a buyer no headroom. */
export const USED_PRICE_CEILING = 1.2
/** Headroom is full this far (as a multiple of value) under the ceiling: at 0.9× value. */
export const USED_HEADROOM_SPAN = 0.3

/**
 * How good `price` looks for a used car worth `value` (0–1): full at 0.9× its
 * value, none at 1.2×. At its sticker (`USED_MARKUP` over) about a quarter.
 */
export function valueHeadroom(price: number, value: number): number {
  if (value <= 0) return 0
  return clamp((USED_PRICE_CEILING - price / value) / USED_HEADROOM_SPAN, 0, 1)
}
