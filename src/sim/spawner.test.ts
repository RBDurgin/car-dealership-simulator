import { describe, expect, it } from 'vitest'
import { OPEN_MINUTE } from './clock'
import { createRng } from './rng'
import {
  LAST_ARRIVAL_MINUTE,
  planArrivals,
  takeDue,
  VISITORS_PER_DAY,
  type ArrivalSchedule,
} from './spawner'

describe('planArrivals', () => {
  it('plans 4–7 sorted arrivals within business hours', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { minutes, spawned } = planArrivals(createRng(seed))
      expect(spawned).toBe(0)
      expect(minutes.length).toBeGreaterThanOrEqual(VISITORS_PER_DAY.min)
      expect(minutes.length).toBeLessThanOrEqual(VISITORS_PER_DAY.max)
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b))
      for (const m of minutes) {
        expect(Number.isInteger(m)).toBe(true)
        expect(m).toBeGreaterThanOrEqual(OPEN_MINUTE)
        expect(m).toBeLessThanOrEqual(LAST_ARRIVAL_MINUTE)
      }
    }
  })

  it('bunches arrivals around midday', () => {
    const all = Array.from(
      { length: 200 },
      (_, seed) => planArrivals(createRng(seed)).minutes,
    ).flat()
    const quarter = (LAST_ARRIVAL_MINUTE - OPEN_MINUTE) / 4
    const middle = all.filter(
      (m) => m >= OPEN_MINUTE + quarter && m <= LAST_ARRIVAL_MINUTE - quarter,
    ).length
    // Uniform would put half in the middle two quarters; the triangular spread puts 75% there.
    expect(middle / all.length).toBeGreaterThan(0.65)
  })

  it('is deterministic for a seed', () => {
    expect(planArrivals(createRng(3))).toEqual(planArrivals(createRng(3)))
  })

  it('tags the usual visitors as regular traffic', () => {
    const { minutes, sources } = planArrivals(createRng(5))
    expect(sources).toEqual(minutes.map(() => 'regular'))
  })

  it('adds campaign visitors on top, rolling the fractions', () => {
    for (let seed = 0; seed < 50; seed++) {
      const plain = planArrivals(createRng(seed))
      const boosted = planArrivals(createRng(seed), { tv: 3, newspaper: 1.5 })
      const count = (s: string) => boosted.sources.filter((x) => x === s).length
      // The usual visitors are planned first, from the same draws.
      expect(count('regular')).toBe(plain.minutes.length)
      expect(count('tv')).toBe(3)
      expect([1, 2]).toContain(count('newspaper'))
      expect(boosted.minutes).toEqual([...boosted.minutes].sort((a, b) => a - b))
      expect(boosted.minutes.every((m) => m <= LAST_ARRIVAL_MINUTE)).toBe(true)
    }
  })

  it('scales the usual visitors and adds referrals with reputation', () => {
    for (let seed = 0; seed < 50; seed++) {
      const plain = planArrivals(createRng(seed))
      const word = planArrivals(createRng(seed), {}, { scale: 1.3, referrals: 1.5 })
      const count = (s: string) => word.sources.filter((x) => x === s).length
      expect(count('regular')).toBe(Math.round(plain.minutes.length * 1.3))
      expect([1, 2]).toContain(count('referral'))
      expect(word.minutes).toEqual([...word.minutes].sort((a, b) => a - b))
    }
    const quiet = planArrivals(createRng(1), {}, { scale: 0.7, referrals: 0 })
    expect(quiet.sources.every((s) => s === 'regular')).toBe(true)
    expect(quiet.minutes.length).toBeLessThan(planArrivals(createRng(1)).minutes.length)
  })
})

describe('takeDue', () => {
  const schedule: ArrivalSchedule = {
    minutes: [600, 600, 700, 900],
    sources: ['regular', 'tv', 'regular', 'online'],
    spawned: 0,
  }

  it('releases arrivals once their time has come, each only once', () => {
    const early = takeDue(schedule, 599)
    expect(early.due).toEqual([])
    expect(early.schedule).toBe(schedule)

    const first = takeDue(schedule, 600)
    expect(first.due).toEqual(['regular', 'tv'])
    expect(first.schedule.spawned).toBe(2)
    expect(takeDue(first.schedule, 650).due).toEqual([])

    const rest = takeDue(first.schedule, 1080)
    expect(rest.due).toEqual(['regular', 'online'])
    expect(takeDue(rest.schedule, 1080)).toEqual({ schedule: rest.schedule, due: [] })
  })

  it('catches up on several arrivals after a long frame', () => {
    expect(takeDue(schedule, 800).due).toHaveLength(3)
  })
})
