import { describe, expect, it } from 'vitest'
import { emptyMonthCsi, type ScoredVisit } from './clients'
import {
  addCsi,
  CSI_FACTORS,
  CSI_FLOOR,
  CSI_PAR,
  CSI_TIER_MIN,
  CSI_TOP,
  csiFactor,
  csiLine,
  csiOf,
  holdsTier,
} from './csi'

const visit = (score: number, over: Partial<ScoredVisit> = {}): ScoredVisit => ({
  clientId: 'c',
  outcome: 'bought',
  score,
  reasons: [],
  newCar: true,
  ...over,
})

describe('the month’s CSI', () => {
  it('averages the new-car buyers’ scores only', () => {
    expect(csiOf(emptyMonthCsi())).toBeNull()
    const m = addCsi(emptyMonthCsi(), [
      visit(80),
      visit(70),
      visit(20, { newCar: false }),
      visit(10, { outcome: 'refused', newCar: false }),
    ])
    expect(m).toEqual({ total: 150, count: 2 })
    expect(csiOf(m)).toBe(75)
    const none = emptyMonthCsi()
    expect(addCsi(none, [visit(50, { newCar: false })])).toBe(none)
  })

  it('cuts a quarter of the holdback under the floor, pays it as is at par, more at the top', () => {
    expect(csiFactor(null)).toBe(1)
    expect(csiFactor(CSI_FLOOR - 1)).toBe(CSI_FACTORS.under)
    expect(csiFactor(CSI_FLOOR)).toBeCloseTo(CSI_FACTORS.floor)
    expect(csiFactor(CSI_PAR)).toBe(1)
    expect(csiFactor(CSI_TOP)).toBeCloseTo(CSI_FACTORS.top)
    expect(csiFactor(100)).toBeCloseTo(CSI_FACTORS.top)
    for (let c = CSI_FLOOR; c < 100; c++)
      expect(csiFactor(c + 1)).toBeGreaterThanOrEqual(csiFactor(c))
  })

  it('holds the tier under the minimum, but not with no buyers', () => {
    expect(holdsTier(CSI_TIER_MIN - 1)).toBe(true)
    expect(holdsTier(CSI_TIER_MIN)).toBe(false)
    expect(holdsTier(null)).toBe(false)
  })

  it('reads as a line for the quota meter', () => {
    expect(csiLine(null)).toBe('CSI: no new-car buyers yet')
    expect(csiLine(CSI_PAR)).toBe(`CSI ${CSI_PAR} (holdback ×1.00)`)
  })
})
