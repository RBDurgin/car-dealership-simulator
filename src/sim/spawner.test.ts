import { describe, expect, it } from 'vitest'
import { OPEN_MINUTE } from './clock'
import { createRng } from './rng'
import { LAST_ARRIVAL_MINUTE, planArrivals, takeDue, VISITORS_PER_DAY } from './spawner'

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
})

describe('takeDue', () => {
  const schedule = { minutes: [600, 600, 700, 900], spawned: 0 }

  it('releases arrivals once their time has come, each only once', () => {
    const early = takeDue(schedule, 599)
    expect(early.count).toBe(0)
    expect(early.schedule).toBe(schedule)

    const first = takeDue(schedule, 600)
    expect(first.count).toBe(2)
    expect(first.schedule.spawned).toBe(2)
    expect(takeDue(first.schedule, 650).count).toBe(0)

    const rest = takeDue(first.schedule, 1080)
    expect(rest.count).toBe(2)
    expect(takeDue(rest.schedule, 1080)).toEqual({ schedule: rest.schedule, count: 0 })
  })

  it('catches up on several arrivals after a long frame', () => {
    expect(takeDue(schedule, 800).count).toBe(3)
  })
})
