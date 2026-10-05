import { describe, expect, it } from 'vitest'
import { ARCHETYPES, pickArchetype } from './archetypes'
import {
  activeCampaigns,
  CHANNELS,
  daysLeft,
  launchCampaign,
  REPEAT_FALLOFF,
  sourceWeights,
  trafficBoost,
  unfinished,
  type Campaign,
} from './marketing'
import { createRng } from './rng'

const run = (channel: Campaign['channel'], startDay: number, endDay: number): Campaign => ({
  id: `${channel}-${startDay}`,
  channel,
  startDay,
  endDay,
})

describe('launchCampaign', () => {
  it('pays up front and starts tomorrow for the channel’s run', () => {
    const r = launchCampaign({ cash: 10_000, campaigns: [] }, 'tv', 4, 'tv-4-1')
    expect(r).toEqual({
      ok: true,
      campaign: { id: 'tv-4-1', channel: 'tv', startDay: 5, endDay: 4 + CHANNELS.tv.days },
      cash: 10_000 - CHANNELS.tv.cost,
      campaigns: [{ id: 'tv-4-1', channel: 'tv', startDay: 5, endDay: 4 + CHANNELS.tv.days }],
    })
  })

  it('refuses when cash is short', () => {
    const r = launchCampaign({ cash: CHANNELS.tv.cost - 1, campaigns: [] }, 'tv', 1, 'x')
    expect(r).toEqual({ ok: false, reason: 'Not enough cash for that campaign.' })
  })
})

describe('campaign days', () => {
  const c = run('radio', 3, 6)

  it('runs from its start to its end day, inclusive', () => {
    expect(activeCampaigns([c], 2)).toEqual([])
    expect(activeCampaigns([c], 3)).toEqual([c])
    expect(activeCampaigns([c], 6)).toEqual([c])
    expect(activeCampaigns([c], 7)).toEqual([])
  })

  it('counts the days left, including a start still to come', () => {
    expect(daysLeft(c, 2)).toBe(4)
    expect(daysLeft(c, 3)).toBe(4)
    expect(daysLeft(c, 6)).toBe(1)
    expect(daysLeft(c, 7)).toBe(0)
  })

  it('drops finished campaigns only', () => {
    expect(unfinished([run('tv', 1, 2), c], 3)).toEqual([c])
  })
})

describe('trafficBoost', () => {
  it('adds each running channel’s visitors', () => {
    expect(trafficBoost([run('tv', 1, 5), run('online', 1, 3), run('radio', 9, 12)], 2)).toEqual({
      tv: CHANNELS.tv.visitors,
      online: CHANNELS.online.visitors,
    })
    expect(trafficBoost([], 1)).toEqual({})
  })

  it('gives less for each extra run of the same channel at once', () => {
    const two = trafficBoost([run('tv', 1, 5), run('tv', 2, 6)], 3).tv!
    const three = trafficBoost([run('tv', 1, 5), run('tv', 2, 6), run('tv', 3, 7)], 3).tv!
    expect(two).toBeCloseTo(CHANNELS.tv.visitors * (1 + REPEAT_FALLOFF))
    expect(three - two).toBeLessThan(two - CHANNELS.tv.visitors)
    expect(three).toBeLessThan(CHANNELS.tv.visitors * 2)
  })
})

describe('sourceWeights', () => {
  it('leaves regular traffic and walk-ins at the usual odds', () => {
    expect(sourceWeights('regular')).toBeUndefined()
    expect(sourceWeights('walk-in')).toBeUndefined()
  })

  it('skews who each channel brings', () => {
    const share = (source: 'newspaper' | 'tv' | 'online', archetype: string) => {
      const rng = createRng(1)
      const weights = sourceWeights(source)
      const picks = Array.from({ length: 2000 }, () => pickArchetype(rng, weights))
      return picks.filter((a) => a === archetype).length / picks.length
    }
    const total = Object.values(ARCHETYPES).reduce((sum, t) => sum + t.weight, 0)
    const usual = (a: keyof typeof ARCHETYPES) => ARCHETYPES[a].weight / total
    expect(share('newspaper', 'bargain')).toBeGreaterThan(usual('bargain') * 2)
    expect(share('tv', 'decisive')).toBeGreaterThan(usual('decisive') * 2)
    expect(share('online', 'couple')).toBeGreaterThan(usual('couple') * 2)
  })
})
