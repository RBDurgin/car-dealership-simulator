import { describe, expect, it } from 'vitest'
import {
  LOWEST_TIER,
  parseGraphics,
  QUALITY_TIERS,
  startQuality,
  SETTLE_SECONDS,
  STEP_UP_SECONDS,
  stepDown,
  stepUp,
} from './graphics'

describe('graphics quality', () => {
  it('steps down the pixel ratio, the shadow map and the rain together', () => {
    for (let i = 1; i < QUALITY_TIERS.length; i++) {
      expect(QUALITY_TIERS[i].dpr).toBeLessThan(QUALITY_TIERS[i - 1].dpr)
      expect(QUALITY_TIERS[i].shadowMap).toBeLessThan(QUALITY_TIERS[i - 1].shadowMap)
      expect(QUALITY_TIERS[i].rain).toBeLessThan(QUALITY_TIERS[i - 1].rain)
    }
  })

  it('starts Auto a step down on phones, and High and Low where they say', () => {
    expect(startQuality('auto', false).tier).toBe(0)
    expect(startQuality('auto', true).tier).toBe(1)
    expect(startQuality('high', true).tier).toBe(0)
    expect(startQuality('low', false).tier).toBe(LOWEST_TIER)
  })

  it('steps down on Auto only, and no lower than the lowest', () => {
    const q = startQuality('auto', false)
    expect(stepDown(q, 'auto', 10).tier).toBe(1)
    expect(stepDown(startQuality('high', false), 'high', 10).tier).toBe(0)
    const low = { tier: LOWEST_TIER, ceiling: 0, since: 0 }
    expect(stepDown(low, 'auto', 10)).toBe(low)
  })

  it('lets the frame rate settle after a step before stepping down again', () => {
    const q = stepDown(startQuality('auto', false, 0), 'auto', 10)
    expect(stepDown(q, 'auto', 10 + SETTLE_SECONDS - 1)).toBe(q)
    expect(stepDown(q, 'auto', 10 + SETTLE_SECONDS).tier).toBe(2)
  })

  it('steps up at most once a minute', () => {
    const q = startQuality('auto', true, 0)
    expect(stepUp(q, 'auto', STEP_UP_SECONDS - 1)).toBe(q)
    const up = stepUp(q, 'auto', STEP_UP_SECONDS)
    expect(up.tier).toBe(0)
    expect(up.since).toBe(STEP_UP_SECONDS)
  })

  it('never climbs back to a tier it fell from, so it cannot flicker', () => {
    let q = startQuality('auto', false, 0)
    q = stepDown(q, 'auto', 10)
    expect(q.tier).toBe(1)
    expect(stepUp(q, 'auto', 10_000).tier).toBe(1)
    q = stepDown(q, 'auto', 10_000)
    expect(q.tier).toBe(2)
    expect(stepUp(q, 'auto', 20_000).tier).toBe(2)
    // Started a step down (a phone), it may climb to the top once.
    const phone = stepUp(startQuality('auto', true, 0), 'auto', STEP_UP_SECONDS)
    expect(phone.tier).toBe(0)
  })

  it('leaves High and Low alone', () => {
    const low = startQuality('low', false)
    expect(stepUp(low, 'low', 10_000)).toBe(low)
  })

  it('reads a setting from storage, defaulting to Auto', () => {
    expect(parseGraphics('low')).toBe('low')
    expect(parseGraphics('ultra')).toBe('auto')
    expect(parseGraphics(null)).toBe('auto')
  })
})
