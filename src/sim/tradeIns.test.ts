import { describe, expect, it } from 'vitest'
import { generateCustomer, reduceCustomer, type Customer } from './customers'
import { appraiseBlocker } from './deal'
import { buildInventory } from './inventory'
import { createRng } from './rng'
import { toSeller } from './sellers'
import {
  assignTrades,
  TRADE_CHANCE,
  TRADE_HOPE,
  tradeHope,
  tradeOver,
  tradeRecord,
  toTrader,
} from './tradeIns'
import { GLANCE_NOISE, marketValue } from './usedCars'

const inventory = buildInventory(createRng(42))
const car = { model: 'van' as const, year: 2019, miles: 90_000, condition: 0.5, acquiredDay: 3 }
const driver = (id = 'd1'): Customer => ({
  ...generateCustomer(id, inventory, createRng(1)),
  vehicle: { car, spot: 0, parked: true },
})
const value = marketValue('van', car, 3)

describe('trade-ins', () => {
  it('gives about the trade share of shopping drivers a trade, and never walkers or sellers', () => {
    const rng = createRng(5)
    const drivers = Array.from({ length: 500 }, (_, i) => driver(`d${i}`))
    const share = assignTrades(drivers, rng, 3).filter((c) => c.trade).length / 500
    expect(share).toBeGreaterThan(TRADE_CHANCE - 0.07)
    expect(share).toBeLessThan(TRADE_CHANCE + 0.07)
    const walker = { ...driver(), vehicle: null }
    const seller = toSeller(driver(), rng, 3)
    for (const c of assignTrades([walker, seller], createRng(0), 3)) expect(c.trade).toBeNull()
  })

  it("hopes for a little over the car's value, scaled by the level", () => {
    for (let seed = 0; seed < 50; seed++) {
      const hope = tradeHope(value, createRng(seed))
      expect(hope).toBeGreaterThanOrEqual(Math.floor(value * (1 + TRADE_HOPE.min) - 100))
      expect(hope).toBeLessThanOrEqual(Math.ceil(value * (1 + TRADE_HOPE.max) + 100))
    }
    expect(tradeHope(value, createRng(1), 1.05)).toBeGreaterThan(tradeHope(value, createRng(1)))
  })

  it('keeps them shopping, with a rough estimate of their car until it is appraised', () => {
    const c = toTrader(driver(), createRng(7), 3)
    expect(c.browseCarIds).toEqual(driver().browseCarIds)
    expect(c.trade!.appraised).toBe(false)
    expect(c.trade!.estimate.margin).toBe(Math.round((value * GLANCE_NOISE) / 100) * 100)
    expect(appraiseBlocker(c)).toBeNull()
    const estimate = { estimate: value, margin: 500 }
    const looked = reduceCustomer(c, { type: 'appraised', id: c.id, estimate })!
    expect(looked.trade).toMatchObject({ estimate, appraised: true })
    expect(appraiseBlocker(looked)).toBe("You've already appraised it.")
    expect(appraiseBlocker(driver())).toBe("It isn't for sale.")
  })

  it('leaves the car behind when it was traded, and they walk off', () => {
    const c: Customer = { ...toTrader(driver(), createRng(7), 3), phase: 'signing' }
    const traded = reduceCustomer(c, { type: 'signed', id: c.id, traded: true })!
    expect(traded).toMatchObject({ phase: 'leaving', leaveReason: 'bought', vehicle: null })
    const kept = reduceCustomer(c, { type: 'signed', id: c.id })!
    expect(kept.vehicle).toEqual(c.vehicle)
  })

  it('records what was allowed against what the car was worth', () => {
    const t = tradeRecord(driver(), value + 700, 3)!
    expect(t).toEqual({ model: 'van', allowance: value + 700, value })
    expect(tradeOver(t)).toBe(700)
    expect(tradeRecord({ ...driver(), vehicle: null }, 1_000, 3)).toBeNull()
  })
})
