import { describe, expect, it } from 'vitest'
import {
  isFranchiseTier,
  lockedReason,
  modelTier,
  nextTier,
  orderable,
  START_TIER,
  TIER_PERKS,
  TIERS,
  tierNotice,
} from './franchise'
import { CAR_MODELS } from './customers'
import { buildInventory } from './inventory'
import { HOLDBACK_FLOOR } from './quota'
import { createRng } from './rng'

const month = (sold: number, quota = 20) => ({ sold, quota })

describe('franchise tiers', () => {
  it('starts at Bronze, whose perks are neutral', () => {
    expect(START_TIER).toBe('bronze')
    expect(TIER_PERKS.bronze).toMatchObject({ invoice: 1, holdback: 1 })
  })

  it('gets cheaper stock and a bigger holdback up the tiers', () => {
    const perks = TIERS.map((t) => TIER_PERKS[t])
    for (let i = 1; i < perks.length; i++) {
      expect(perks[i].invoice).toBeLessThan(perks[i - 1].invoice)
      expect(perks[i].holdback).toBeGreaterThan(perks[i - 1].holdback)
    }
  })

  it('moves up a tier for a month that meets the target, never past Gold', () => {
    expect(nextTier('bronze', month(20))).toBe('silver')
    expect(nextTier('silver', month(25))).toBe('gold')
    expect(nextTier('gold', month(30))).toBe('gold')
  })

  it('holds the tier between the holdback floor and the target', () => {
    expect(nextTier('silver', month(19))).toBe('silver')
    expect(nextTier('silver', month(20 * HOLDBACK_FLOOR))).toBe('silver')
  })

  it('drops a tier for a month under the floor, never under Bronze', () => {
    expect(nextTier('gold', month(15))).toBe('silver')
    expect(nextTier('silver', month(0))).toBe('bronze')
    expect(nextTier('bronze', month(0))).toBe('bronze')
  })

  it('lets slack hold the tier a little under the floor', () => {
    expect(nextTier('gold', month(15), 0.1)).toBe('gold')
    expect(nextTier('gold', month(13), 0.1)).toBe('silver')
  })

  it('locks the sports sedan to Silver and the luxury SUV to Gold', () => {
    expect(modelTier('sedan-sports')).toBe('silver')
    expect(modelTier('suv-luxury')).toBe('gold')
    expect(orderable('sedan-sports', 'bronze')).toBe(false)
    expect(orderable('sedan-sports', 'silver')).toBe(true)
    expect(orderable('suv-luxury', 'silver')).toBe(false)
    expect(orderable('suv-luxury', 'gold')).toBe(true)
    expect(lockedReason('suv-luxury', 'bronze')).toBe('Gold dealers only.')
    expect(lockedReason('sedan', 'bronze')).toBeNull()
  })

  it('lets Bronze order every other model, and Gold everything', () => {
    for (const model of CAR_MODELS) {
      expect(orderable(model, 'gold')).toBe(true)
      if (model !== 'sedan-sports' && model !== 'suv-luxury') {
        expect(orderable(model, 'bronze')).toBe(true)
      }
    }
  })

  it('still opens with both top models in stock', () => {
    const models = buildInventory(createRng(1)).map((c) => c.model)
    expect(models).toContain('sedan-sports')
    expect(models).toContain('suv-luxury')
  })

  it('says what a move brings, and nothing when it holds', () => {
    expect(tierNotice('bronze', 'bronze')).toBeNull()
    expect(tierNotice('bronze', 'silver')).toContain('Silver dealer')
    expect(tierNotice('silver', 'gold')).toContain('Summit Ridge Platinum')
    expect(tierNotice('gold', 'silver')).toContain('dropped to Silver')
  })

  it('knows its tiers', () => {
    expect(TIERS.every(isFranchiseTier)).toBe(true)
    expect(isFranchiseTier('platinum')).toBe(false)
  })
})
