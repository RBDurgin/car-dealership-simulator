import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  difficultyBlurb,
  difficultyLabel,
  isDifficulty,
  TUNING,
} from './difficulty'
import { FIRST_JAGUAR_DAY } from './jaguar'

describe('difficulty levels', () => {
  it('defaults to Medium, whose levers are all neutral', () => {
    expect(DEFAULT_DIFFICULTY).toBe('medium')
    const {
      startingCash,
      firstJaguarDay,
      expect: shift,
      acceptBonus,
      franchiseSlack,
      ...rest
    } = TUNING.medium
    expect(startingCash).toBe(25_000)
    expect(franchiseSlack).toBe(0)
    expect(firstJaguarDay).toBe(FIRST_JAGUAR_DAY)
    expect(shift).toBe(0)
    expect(acceptBonus).toBe(0)
    for (const [lever, value] of Object.entries(rest)) {
      expect([lever, value]).toEqual([lever, typeof value === 'boolean' ? false : 1])
    }
  })

  it('gives every level every lever', () => {
    const levers = Object.keys(TUNING.medium).sort()
    for (const d of DIFFICULTIES) {
      expect(Object.keys(TUNING[d]).sort()).toEqual(levers)
      for (const value of Object.values(TUNING[d])) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
      }
    }
  })

  it('makes money easier on Easy and harder on Hard', () => {
    expect(TUNING.easy.startingCash).toBeGreaterThan(TUNING.medium.startingCash)
    expect(TUNING.hard.startingCash).toBeLessThan(TUNING.medium.startingCash)
    expect(TUNING.easy.invoice).toBeLessThan(1)
    expect(TUNING.hard.invoice).toBeGreaterThan(1)
    expect(TUNING.easy.interest).toBeLessThan(1)
    expect(TUNING.hard.interest).toBeGreaterThan(1)
  })

  it('lets Easy keep its franchise tier through a near miss', () => {
    expect(TUNING.easy.franchiseSlack).toBeGreaterThan(0)
    expect(TUNING.hard.franchiseSlack).toBe(0)
  })

  it('names and describes each level', () => {
    expect(DIFFICULTIES.map(difficultyLabel)).toEqual(['Easy', 'Medium', 'Hard'])
    for (const d of DIFFICULTIES) expect(difficultyBlurb(d)).not.toBe('')
  })

  it('knows its levels', () => {
    expect(DIFFICULTIES.every(isDifficulty)).toBe(true)
    expect(isDifficulty('nightmare')).toBe(false)
    expect(isDifficulty(undefined)).toBe(false)
  })
})
