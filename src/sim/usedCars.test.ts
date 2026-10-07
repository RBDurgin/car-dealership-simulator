import { describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH, MONTHS_PER_YEAR } from './calendar'
import { BASE_MSRP } from './inventory'
import { createRng } from './rng'
import {
  AGE_YEARS,
  ageCurve,
  ageOf,
  appraisalNoise,
  appraise,
  conditionFactor,
  FIRST_MODEL_YEAR,
  marketValue,
  mileFactor,
  modelYear,
  nextUsedId,
  PLAYER_SKILL,
  rollUsedCar,
  stockValue,
  usedListPrice,
  usedStockCar,
  usedTag,
  type UsedInfo,
} from './usedCars'

const info = (extra: Partial<UsedInfo> = {}): UsedInfo => ({
  year: FIRST_MODEL_YEAR - 5,
  miles: 60_000,
  condition: 0.6,
  acquiredDay: 1,
  ...extra,
})

describe('used cars', () => {
  it('counts model years from the game’s first year', () => {
    expect(modelYear(1)).toBe(FIRST_MODEL_YEAR)
    expect(modelYear(DAYS_PER_MONTH * MONTHS_PER_YEAR + 1)).toBe(FIRST_MODEL_YEAR + 1)
    expect(ageOf(FIRST_MODEL_YEAR - 4, 1)).toBe(4)
    expect(ageOf(FIRST_MODEL_YEAR, 1)).toBe(1)
  })

  it('rolls 2–10 year old cars with about 12k miles a year and a sensible condition', () => {
    const rng = createRng(7)
    const cars = Array.from({ length: 400 }, () => rollUsedCar(rng, 1))
    for (const c of cars) {
      const age = ageOf(c.year, 1)
      expect(age).toBeGreaterThanOrEqual(AGE_YEARS.min)
      expect(age).toBeLessThanOrEqual(AGE_YEARS.max)
      expect(c.miles / age).toBeGreaterThan(7_000)
      expect(c.miles / age).toBeLessThan(17_000)
      expect(c.condition).toBeGreaterThan(0)
      expect(c.condition).toBeLessThanOrEqual(1)
      expect(c.acquiredDay).toBe(1)
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const young = cars.filter((c) => ageOf(c.year, 1) <= 4).map((c) => c.condition)
    const old = cars.filter((c) => ageOf(c.year, 1) >= 8).map((c) => c.condition)
    expect(avg(old)).toBeLessThan(avg(young))
    // Everyday cars come in far more often than the luxury SUV.
    const count = (m: string) => cars.filter((c) => c.model === m).length
    expect(count('sedan')).toBeGreaterThan(count('suv-luxury') * 2)
  })

  it('values a car lower the older, further driven and rougher it is', () => {
    expect(ageCurve(2)).toBeGreaterThan(ageCurve(10))
    expect(mileFactor(100_000, 5)).toBeLessThan(mileFactor(40_000, 5))
    expect(conditionFactor(0.2)).toBeLessThan(conditionFactor(0.9))
    const v = (extra: Partial<UsedInfo>) => marketValue('sedan', info(extra), 1)
    expect(v({ year: FIRST_MODEL_YEAR - 2 })).toBeGreaterThan(v({ year: FIRST_MODEL_YEAR - 8 }))
    expect(v({ miles: 30_000 })).toBeGreaterThan(v({ miles: 110_000 }))
    expect(v({ condition: 0.9 })).toBeGreaterThan(v({ condition: 0.2 }))
    expect(v({}) % 100).toBe(0)
    expect(v({})).toBeLessThan(BASE_MSRP.sedan)
  })

  it('keeps most trade-ins in the $6–30k range', () => {
    const rng = createRng(3)
    const values = Array.from({ length: 400 }, () => {
      const { model, ...used } = rollUsedCar(rng, 1)
      return marketValue(model, used, 1)
    })
    const inRange = values.filter((v) => v >= 4_000 && v <= 35_000).length
    expect(inRange / values.length).toBeGreaterThan(0.8)
  })

  it('loses about 6% of its value over 10 days on the lot', () => {
    const start = marketValue('suv', info(), 1)
    const later = marketValue('suv', info(), 11)
    expect(later).toBeLessThan(start)
    expect(1 - later / start).toBeCloseTo(0.058, 2)
    // Its age is fixed when we take it in, so a new year doesn't knock it down.
    expect(marketValue('suv', info({ acquiredDay: 5 }), 5)).toBe(start)
  })

  it('appraises closer to the truth the more skilled the appraiser', () => {
    expect(appraisalNoise(1)).toBeGreaterThan(appraisalNoise(PLAYER_SKILL))
    expect(appraisalNoise(PLAYER_SKILL)).toBeGreaterThan(appraisalNoise(5))
    const truth = marketValue('truck', info(), 1)
    const worstMiss = (skill: number) => {
      const rng = createRng(11)
      let worst = 0
      for (let i = 0; i < 200; i++) {
        const { estimate, margin } = appraise('truck', info(), 1, skill, rng)
        expect(Math.abs(estimate - truth)).toBeLessThanOrEqual(margin + 100)
        worst = Math.max(worst, Math.abs(estimate - truth))
      }
      return worst
    }
    expect(worstMiss(5)).toBeLessThan(worstMiss(PLAYER_SKILL))
    expect(worstMiss(PLAYER_SKILL)).toBeLessThan(worstMiss(1))
  })

  it('stickers a used car about 12% over its value, to the $100', () => {
    expect(usedListPrice(20_000)).toBe(22_400)
    expect(usedListPrice(12_345) % 100).toBe(0)
  })

  it('takes a used car into stock on the lot, paid in cash and priced from its value', () => {
    const car = usedStockCar(
      'used-3-1',
      { model: 'van', ...info({ acquiredDay: 3 }) },
      { location: 'lot', index: 4 },
      14_000,
      3,
      0.4,
    )
    expect(car).toMatchObject({
      id: 'used-3-1',
      model: 'van',
      location: 'lot',
      spaceIndex: 4,
      cost: 14_000,
      floored: false,
      arrivedDay: 3,
      cleanliness: 0.4,
      status: 'available',
    })
    expect(car.msrp).toBe(usedListPrice(marketValue('van', car.used!, 3)))
    expect(stockValue(car, 13)).toBeLessThan(stockValue(car, 3)!)
    expect(nextUsedId([car], 3)).toBe('used-3-2')
    expect(nextUsedId([car], 4)).toBe('used-4-1')
  })

  it('tags a used car with its year and miles', () => {
    expect(usedTag(info({ year: 2019, miles: 64_300 }))).toBe('Used · 2019 · 64k mi')
  })
})
