import { describe, expect, it } from 'vitest'
import { calendarOf, DAYS_PER_MONTH } from './calendar'
import type { Customer } from './customers'
import type { InventoryCar } from './inventory'
import {
  FIRST_DAY_WEATHER,
  forecast,
  forecastFor,
  MONTH_ODDS,
  waitingOutside,
  weatherOn,
  WEATHERS,
  type Weather,
} from './weather'

const YEARS = 20
const DAYS = YEARS * 12 * DAYS_PER_MONTH

describe('weatherOn', () => {
  it('is the same every time for a day, in any order', () => {
    const late = weatherOn(500)
    expect(Array.from({ length: 500 }, (_, i) => weatherOn(i + 1))[499]).toBe(late)
    expect(weatherOn(500)).toBe(late)
  })

  it('starts fine', () => {
    expect(weatherOn(1)).toBe(FIRST_DAY_WEATHER)
  })

  it('only brings heat in months that allow it', () => {
    for (let day = 1; day <= DAYS; day++) {
      const w = weatherOn(day)
      expect(MONTH_ODDS[calendarOf(day).month][w], `day ${day} ${w}`).toBeGreaterThan(0)
    }
  })

  it('rains more in spring and autumn than in summer, and is hot only around summer', () => {
    const share = (months: number[], kind: Weather) => {
      let hits = 0
      let total = 0
      for (let day = 1; day <= DAYS; day++) {
        if (!months.includes(calendarOf(day).month)) continue
        total++
        if (weatherOn(day) === kind) hits++
      }
      return hits / total
    }
    expect(share([2, 3, 9, 10], 'rain')).toBeGreaterThan(share([5, 6, 7], 'rain') + 0.1)
    expect(share([5, 6, 7], 'hot')).toBeGreaterThan(0.2)
    expect(share([0, 1, 11], 'hot')).toBe(0)
  })

  it('has rainy spells: rain follows rain more often than it starts', () => {
    let rainy = 0
    let rainAfterRain = 0
    let rain = 0
    for (let day = 2; day <= DAYS; day++) {
      if (weatherOn(day) === 'rain') rain++
      if (weatherOn(day - 1) !== 'rain') continue
      rainy++
      if (weatherOn(day) === 'rain') rainAfterRain++
    }
    expect(rainAfterRain / rainy).toBeGreaterThan(rain / DAYS + 0.15)
  })

  it('sees every kind of weather', () => {
    const seen = new Set(Array.from({ length: DAYS }, (_, i) => weatherOn(i + 1)))
    expect([...seen].sort()).toEqual([...WEATHERS].sort())
  })
})

describe('forecast', () => {
  it('is what happened for today and earlier, and nothing past three days', () => {
    expect(forecastFor(40, 40)).toBe(weatherOn(40))
    expect(forecastFor(30, 40)).toBe(weatherOn(30))
    expect(forecastFor(44, 40)).toBeNull()
  })

  it('is right about 80% of the time, better closer in', () => {
    const right = [0, 0, 0]
    const n = 2000
    for (let today = 1; today <= n; today++) {
      forecast(today).forEach((w, i) => {
        if (w === weatherOn(today + 1 + i)) right[i]++
      })
    }
    const rate = right.map((r) => r / n)
    expect(rate[0]).toBeGreaterThan(rate[2])
    const overall = (right[0] + right[1] + right[2]) / (3 * n)
    expect(overall).toBeGreaterThan(0.75)
    expect(overall).toBeLessThan(0.9)
  })

  it('is stable for a day seen from the same morning', () => {
    expect(forecast(77)).toEqual(forecast(77))
    expect(forecast(77)).toHaveLength(3)
  })
})

describe('waitingOutside', () => {
  const car = (id: string, location: 'lot' | 'showroom') =>
    ({ id, location, status: 'available' }) as InventoryCar
  const waiting = (id: string, carIds: string[], phase = 'waiting') =>
    ({ id, phase, browseCarIds: carIds }) as unknown as Customer
  const inventory = [car('a', 'lot'), car('b', 'showroom')]

  it('counts those waiting by a lot car or out front, not in the showroom', () => {
    const ids = waitingOutside(
      [
        waiting('lot', ['b', 'a']),
        waiting('show', ['a', 'b']),
        waiting('front', []),
        waiting('talking', ['a'], 'talking'),
      ],
      inventory,
    )
    expect([...ids].sort()).toEqual(['front', 'lot'])
  })
})
