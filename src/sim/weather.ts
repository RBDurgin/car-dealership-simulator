import { calendarOf } from './calendar'
import type { Customer } from './customers'
import type { InventoryCar } from './inventory'
import { createRng } from './rng'

/**
 * The day's weather, derived from the day number: each day is rolled from
 * the month's odds (wet spring and autumn, hot summers), with a chance of
 * carrying on yesterday's, so rainy spells last a couple of days. Nothing is
 * saved; the chain is replayed from day 1 (and remembered).
 */
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'hot'

export const WEATHERS: readonly Weather[] = ['sunny', 'cloudy', 'rain', 'hot']

export interface WeatherEffects {
  /** Multiplier on the day's visitors and passers-by. */
  traffic: number
  /** Multiplier on the night's dust on lot cars. */
  lotDirt: number
  /** Multiplier on how fast customers waiting out on the lot lose patience. */
  lotPatience: number
  /** Multiplier on the chance a passer-by turns in. */
  walkIn: number
}

export const WEATHER_EFFECTS: Record<Weather, WeatherEffects> = {
  sunny: { traffic: 1.05, lotDirt: 1, lotPatience: 1, walkIn: 1 },
  cloudy: { traffic: 1, lotDirt: 1, lotPatience: 1, walkIn: 1 },
  rain: { traffic: 0.6, lotDirt: 2.5, lotPatience: 1.5, walkIn: 0.5 },
  hot: { traffic: 0.9, lotDirt: 1, lotPatience: 1.3, walkIn: 1 },
}

type Odds = Record<Weather, number>

const WINTER: Odds = { sunny: 4, cloudy: 4, rain: 2, hot: 0 }
const SPRING: Odds = { sunny: 4, cloudy: 3, rain: 2.5, hot: 0 }
const SUMMER: Odds = { sunny: 5, cloudy: 2, rain: 1, hot: 3 }
const AUTUMN: Odds = { sunny: 4, cloudy: 3, rain: 2.5, hot: 0 }

/** Each month's odds, January first: rain in spring and autumn, heat in summer. */
export const MONTH_ODDS: readonly Odds[] = [
  WINTER,
  WINTER,
  SPRING,
  SPRING,
  { ...SPRING, hot: 1 },
  SUMMER,
  SUMMER,
  SUMMER,
  { ...AUTUMN, hot: 1 },
  AUTUMN,
  AUTUMN,
  WINTER,
]

/** Chance a day keeps yesterday's weather (if the month allows it), before rolling afresh. */
export const CARRY_OVER: Record<Weather, number> = { sunny: 0.3, cloudy: 0.3, rain: 0.45, hot: 0.4 }
/** The first day is fine, so a new player isn't rained on. */
export const FIRST_DAY_WEATHER: Weather = 'sunny'
/** How often the forecast is right, one, two and three days out (about 80% overall). */
export const FORECAST_ACCURACY = [0.9, 0.8, 0.7]

const WEATHER_SEED = 20_000
const FORECAST_SEED = 21_000

function rollFrom(odds: Odds, r: number): Weather {
  const total = WEATHERS.reduce((sum, w) => sum + odds[w], 0)
  let left = r * total
  for (const w of WEATHERS) {
    left -= odds[w]
    if (left < 0) return w
  }
  return 'cloudy'
}

/** Day `day`'s weather given yesterday's. */
function roll(day: number, yesterday: Weather): Weather {
  const rng = createRng(WEATHER_SEED + day)
  const odds = MONTH_ODDS[calendarOf(day).month]
  const carry = rng.next()
  const fresh = rollFrom(odds, rng.next())
  return carry < CARRY_OVER[yesterday] && odds[yesterday] > 0 ? yesterday : fresh
}

/** The chain so far, index `day - 1`. Pure: every entry follows from the day number. */
const chain: Weather[] = [FIRST_DAY_WEATHER]

/** The weather on `day`. */
export function weatherOn(day: number): Weather {
  const d = Math.max(1, Math.floor(day))
  while (chain.length < d) chain.push(roll(chain.length + 1, chain[chain.length - 1]))
  return chain[d - 1]
}

/**
 * What the forecast says for `day`, seen from `today`: the real weather, or
 * (less often the further out it is) a neighbouring type. Today and earlier
 * are simply what happened; past the forecast's reach it's null.
 */
export function forecastFor(day: number, today: number): Weather | null {
  const lead = day - today
  if (lead <= 0) return weatherOn(day)
  if (lead > FORECAST_ACCURACY.length) return null
  const actual = weatherOn(day)
  const rng = createRng(FORECAST_SEED + day * 7 + lead)
  if (rng.next() < FORECAST_ACCURACY[lead - 1]) return actual
  const odds = MONTH_ODDS[calendarOf(day).month]
  const near = NEIGHBOURS[actual].filter((w) => odds[w] > 0)
  return near.length > 0 ? rng.pick(near) : actual
}

/** The weather a wrong forecast mistakes each type for. */
const NEIGHBOURS: Record<Weather, Weather[]> = {
  hot: ['sunny'],
  sunny: ['hot', 'cloudy'],
  cloudy: ['sunny', 'rain'],
  rain: ['cloudy'],
}

/** The forecast for the `days` days after `today`. */
export function forecast(today: number, days = FORECAST_ACCURACY.length): Weather[] {
  return Array.from({ length: days }, (_, i) => forecastFor(today + 1 + i, today) ?? 'cloudy')
}

export const WEATHER_LABELS: Record<Weather, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rain: 'Rain',
  hot: 'Hot',
}

export const WEATHER_ICONS: Record<Weather, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rain: '🌧️',
  hot: '🌡️',
}

/** What the weather means for the day, in a few words. */
export const WEATHER_HINTS: Record<Weather, string> = {
  sunny: 'A fine day: a few more visitors.',
  cloudy: 'An ordinary day.',
  rain: 'Fewer visitors, lot cars get dirtier, and customers waiting outside lose patience faster.',
  hot: 'A few fewer visitors, and customers waiting outside lose patience faster.',
}

/**
 * The customers waiting out on the lot: by a lot car they looked at, or out
 * front if they haven't looked at one. Weather gets to them; the showroom
 * keeps the rest dry.
 */
export function waitingOutside(
  customers: readonly Customer[],
  inventory: readonly InventoryCar[],
): Set<string> {
  const ids = new Set<string>()
  for (const c of customers) {
    // A service client waits at the counter, indoors.
    if (c.phase !== 'waiting' || c.service) continue
    const carId = c.browseCarIds[c.browseCarIds.length - 1]
    const car = carId ? inventory.find((x) => x.id === carId) : undefined
    if (!car || car.location === 'lot') ids.add(c.id)
  }
  return ids
}
