import { describe, expect, it } from 'vitest'
import { ARCHETYPES, type Archetype } from './archetypes'
import {
  assignCredit,
  CREDIT_TIERS,
  creditLine,
  MAX_DOWN,
  rollCredit,
  tierWeights,
  type Credit,
  type CreditTier,
} from './credit'
import { createRng } from './rng'

/** `n` rolls for `archetype` on one seed. */
function rolls(archetype: Archetype, n = 4000, mix = 0, seed = 1): Credit[] {
  const rng = createRng(seed)
  return Array.from({ length: n }, () => rollCredit(archetype, rng, mix))
}

const share = (list: Credit[], test: (c: Credit) => boolean) =>
  list.filter(test).length / list.length

/** The average tier, A as 0 and D as 3. */
const meanTier = (list: Credit[]) =>
  list.reduce((sum, c) => sum + CREDIT_TIERS.indexOf(c.tier), 0) / list.length

describe('rollCredit', () => {
  it('gives the same credit for the same seed', () => {
    expect(rolls('regular', 20, 0, 7)).toEqual(rolls('regular', 20, 0, 7))
    expect(rolls('regular', 20, 0, 7)).not.toEqual(rolls('regular', 20, 0, 8))
  })

  it('finances about as often as the archetype says', () => {
    for (const a of Object.keys(ARCHETYPES) as Archetype[]) {
      expect(share(rolls(a), (c) => c.finance)).toBeCloseTo(ARCHETYPES[a].credit.finance, 1)
    }
  })

  it('has about 60% of a typical day financing', () => {
    const all = Object.keys(ARCHETYPES) as Archetype[]
    const total = all.reduce((sum, a) => sum + ARCHETYPES[a].weight, 0)
    const financed = all.reduce(
      (sum, a) => sum + ARCHETYPES[a].weight * ARCHETYPES[a].credit.finance,
      0,
    )
    expect(financed / total).toBeGreaterThan(0.55)
    expect(financed / total).toBeLessThan(0.65)
  })

  it('leans bargain hunters and used-car shoppers toward C and D', () => {
    const low = (a: Archetype) => share(rolls(a), (c) => c.tier === 'C' || c.tier === 'D')
    expect(low('bargain')).toBeGreaterThan(low('regular'))
    expect(low('used-shopper')).toBeGreaterThan(low('regular'))
    expect(low('decisive')).toBeLessThan(low('regular'))
  })

  it('puts down between 0 and MAX_DOWN when financing, nothing when paying cash', () => {
    const list = rolls('regular')
    for (const c of list) {
      if (c.finance) {
        expect(c.down).toBeGreaterThanOrEqual(0)
        expect(c.down).toBeLessThanOrEqual(MAX_DOWN)
      } else expect(c.down).toBe(0)
    }
    expect(share(list, (c) => c.finance && c.down > 0.1)).toBeGreaterThan(0.2)
  })

  it('improves the tiers with a positive mix and worsens them with a negative one', () => {
    const neutral = meanTier(rolls('regular'))
    expect(meanTier(rolls('regular', 4000, 0.3))).toBeLessThan(neutral - 0.1)
    expect(meanTier(rolls('regular', 4000, -0.3))).toBeGreaterThan(neutral + 0.1)
  })

  it('leaves who finances and how much they put down alone with the mix', () => {
    const a = rolls('regular', 200, 0)
    const b = rolls('regular', 200, 0.3)
    expect(b.map((c) => [c.finance, c.down])).toEqual(a.map((c) => [c.finance, c.down]))
  })
})

describe('tierWeights', () => {
  it('is the archetype odds with no mix', () => {
    expect(tierWeights(ARCHETYPES.bargain.credit)).toEqual(ARCHETYPES.bargain.credit.tiers)
  })

  it('shifts weight from D to A with a positive mix', () => {
    const base = ARCHETYPES.regular.credit
    const w = tierWeights(base, 0.3)
    const ratio = (t: CreditTier) => w[t] / base.tiers[t]
    expect(ratio('A')).toBeGreaterThan(ratio('B'))
    expect(ratio('B')).toBeGreaterThan(1)
    expect(ratio('C')).toBeLessThan(1)
    expect(ratio('D')).toBeLessThan(ratio('C'))
  })
})

describe('assignCredit', () => {
  const who = (over: { selling?: unknown; service?: unknown } = {}) => ({
    archetype: 'regular' as Archetype,
    credit: null as Credit | null,
    selling: null,
    service: null,
    ...over,
  })

  it('gives shoppers credit and leaves sellers and service clients without', () => {
    const [shopper, seller, client] = assignCredit(
      [who(), who({ selling: {} }), who({ service: {} })],
      createRng(3),
    )
    expect(shopper.credit).not.toBeNull()
    expect(seller.credit).toBeNull()
    expect(client.credit).toBeNull()
  })
})

describe('creditLine', () => {
  it('says how they pay', () => {
    expect(creditLine({ tier: 'A', finance: false, down: 0 })).toBe('Paying cash')
    expect(creditLine({ tier: 'B', finance: true, down: 0 })).toBe('Financing, tier B')
    expect(creditLine({ tier: 'C', finance: true, down: 0.1 })).toBe('Financing, tier C, 10% down')
  })
})
