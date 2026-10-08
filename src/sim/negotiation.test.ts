import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from './archetypes'
import { acceptChance, reduceCustomer, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import {
  allowanceRange,
  askRange,
  buyRange,
  buyWarmth,
  clampAllowance,
  clampAsk,
  clampBuy,
  counterPrice,
  dealWarmth,
  FIRST_COUNTER_DROP,
  hopePrice,
  LAST_ROUND_FACTOR,
  LOWBALL_FRACTION,
  netOf,
  respondToAsk,
  respondToBuyOffer,
  SELLER_FIRST_RISE,
  SELLER_RESERVE,
  sellChance,
  sellerCounter,
  suggestedBuy,
  STAFF_FLOOR_MARGIN,
  STAFF_TRADE_ANCHOR,
  staffAllowance,
  staffAsk,
  staffBuyOffer,
  staffConcession,
  STUBBORN_WALK,
  suggestedAllowance,
  suggestedAsk,
  type AskResponse,
} from './negotiation'
import { createRng } from './rng'
import {
  insultingAllowance,
  NO_TRADE_PENALTY,
  TRADE_INSULT,
  TRADE_PRIDE,
  tradeBonus,
} from './tradeIns'

// Half clean: no bonus or penalty for the car's condition.
const sedan: InventoryCar = {
  ...buildInventory(createRng(42))[0],
  model: 'sedan',
  msrp: 30_000,
  cost: 26_000,
  cleanliness: 0.5,
}

const base: Customer = {
  id: 'c1',
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 40_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: [sedan.id],
  browsed: 1,
  targetCarId: sedan.id,
  offer: null,
  expect: 0.04,
  haggle: null,
  phase: 'talking',
  leaveReason: null,
  handlerId: 'player',
  chairId: null,
  sellerId: 'player',
  vehicle: null,
  selling: null,
  trade: null,
}

/** In the middle of a haggle: they countered `counter` to `lastAsk`. */
const haggling = (round: number, lastAsk: number, counter: number, extra: Partial<Customer> = {}) =>
  ({ ...base, haggle: { round, lastAsk, counter }, ...extra }) satisfies Customer

/** How often `respond` gives each answer over many seeds. */
function rates(respond: (seed: number) => AskResponse, n = 2000) {
  const counts = { accept: 0, counter: 0, walk: 0 }
  for (let seed = 0; seed < n; seed++) counts[respond(seed).answer]++
  return { accept: counts.accept / n, counter: counts.counter / n, walk: counts.walk / n }
}

describe('hopePrice', () => {
  it('is MSRP less what they expect off, in round hundreds', () => {
    expect(hopePrice(base, sedan)).toBe(28_800)
    expect(hopePrice({ ...base, expect: 0.033 }, sedan)).toBe(29_000)
  })

  it('never goes over budget', () => {
    expect(hopePrice({ ...base, budget: 25_000 }, sedan)).toBe(25_000)
  })
})

describe('dealWarmth', () => {
  it('is hot at what they hope to pay when they like the car', () => {
    expect(acceptChance(base, sedan, 28_800)).toBeGreaterThan(0.6)
    expect(dealWarmth(base, sedan, 28_800)).toBe('hot')
  })

  it('is cold at what they hope to pay when they’d likely pass anyway', () => {
    const kicker = { ...base, archetype: 'tire-kicker' as const, preferredModels: [] }
    expect(acceptChance(kicker, sedan, 28_800)).toBeLessThan(0.3)
    expect(dealWarmth(kicker, sedan, 28_800)).toBe('cold')
  })

  it('takes the seller’s bonus into account', () => {
    const lukewarm = { ...base, preferredModels: [], budget: 30_000 }
    const chance = acceptChance(lukewarm, sedan, 28_800)
    expect(chance).toBeGreaterThanOrEqual(0.3)
    expect(chance).toBeLessThan(0.6)
    expect(dealWarmth(lukewarm, sedan, 28_800)).toBe('warm')
    expect(dealWarmth(lukewarm, sedan, 28_800, 0.6 - chance)).toBe('hot')
  })

  it('is warm above their hope while they’ll still counter', () => {
    expect(dealWarmth(base, sedan, 30_000)).toBe('warm')
    expect(dealWarmth(haggling(2, 30_000, 28_000), sedan, 29_500)).toBe('warm')
  })

  it('is cold over budget, or holding at the last ask', () => {
    expect(dealWarmth({ ...base, budget: 27_000, expect: 0 }, sedan, 29_000)).toBe('cold')
    expect(dealWarmth(haggling(2, 30_000, 28_000), sedan, 30_000)).toBe('cold')
  })

  it('on their last round goes by the half-hearted roll', () => {
    const last = haggling(ARCHETYPES.regular.haggle.rounds, 30_000, 28_500)
    const chance = acceptChance(last, sedan, 29_500) * LAST_ROUND_FACTOR
    expect(dealWarmth(last, sedan, 29_500)).toBe(chance >= 0.6 ? 'hot' : 'warm')
    // At or under their counter it's the full roll.
    expect(dealWarmth(last, sedan, 28_500)).toBe('hot')
  })
})

describe('respondToAsk', () => {
  it('rolls the usual accept chance for an ask at or under what they hope for', () => {
    const ask = hopePrice(base, sedan)
    const chance = acceptChance(base, sedan, ask)
    const r = rates((seed) => respondToAsk(base, sedan, ask, createRng(seed)))
    expect(r.counter).toBe(0)
    expect(r.accept).toBeGreaterThan(chance - 0.04)
    expect(r.accept).toBeLessThan(chance + 0.04)
  })

  it('rolls the accept chance for an ask at their own counter, so tire-kickers still pass', () => {
    const kicker = haggling(2, 30_000, 27_000, { archetype: 'tire-kicker', budget: 28_000 })
    const chance = acceptChance(kicker, sedan, 27_000)
    expect(chance).toBeLessThan(0.5)
    const r = rates((seed) => respondToAsk(kicker, sedan, 27_000, createRng(seed)))
    expect(r.counter).toBe(0)
    expect(r.accept).toBeGreaterThan(chance - 0.04)
    expect(r.accept).toBeLessThan(chance + 0.04)
  })

  it('counters an ask over their hope, the first time hope less 3% of MSRP', () => {
    const res = respondToAsk(base, sedan, 30_000, createRng(1))
    expect(res).toEqual({
      answer: 'counter',
      counter: hopePrice(base, sedan) - FIRST_COUNTER_DROP * sedan.msrp,
    })
  })

  it('later counters move 40% of the way to the ask', () => {
    expect(counterPrice(haggling(2, 30_000, 27_000), sedan, 29_000)).toBe(27_800)
  })

  it('counters rise monotonically, never past the ask or their budget', () => {
    for (const budget of [40_000, 27_500]) {
      for (let seed = 0; seed < 50; seed++) {
        const rng = createRng(seed)
        let c: Customer = { ...base, archetype: 'bargain', budget }
        let ask = sedan.msrp
        const counters: number[] = []
        for (;;) {
          const res = respondToAsk(c, sedan, ask, rng)
          if (res.answer !== 'counter') break
          expect(res.counter).toBeLessThanOrEqual(Math.min(ask, budget))
          counters.push(res.counter)
          c = reduceCustomer(
            { ...c, phase: 'considering', offer: { carId: sedan.id, price: ask } },
            { type: 'respond', id: c.id, answer: 'counter', counter: res.counter },
          )!
          // The seller comes down a little each round.
          ask -= 300
        }
        expect(counters.length).toBeLessThan(ARCHETYPES.bargain.haggle.rounds)
        for (let i = 1; i < counters.length; i++) {
          expect(counters[i]).toBeGreaterThanOrEqual(counters[i - 1])
        }
      }
    }
  })

  it('walks out of rounds when the ask is over budget', () => {
    const last = haggling(ARCHETYPES.regular.haggle.rounds, 30_000, 24_000, { budget: 25_000 })
    for (let seed = 0; seed < 50; seed++) {
      expect(respondToAsk(last, sedan, 29_000, createRng(seed))).toEqual({
        answer: 'walk',
        reason: 'budget',
      })
    }
  })

  it('out of rounds, takes half the usual chance on an ask within budget', () => {
    const last = haggling(ARCHETYPES.regular.haggle.rounds, 30_000, 28_000)
    const chance = acceptChance(last, sedan, 29_500) * LAST_ROUND_FACTOR
    const r = rates((seed) => respondToAsk(last, sedan, 29_500, createRng(seed)))
    expect(r.counter).toBe(0)
    expect(r.accept).toBeGreaterThan(chance - 0.04)
    expect(r.accept).toBeLessThan(chance + 0.04)
  })

  it('sometimes walks when the seller holds their ask', () => {
    const mid = haggling(2, 30_000, 27_000)
    const r = rates((seed) => respondToAsk(mid, sedan, 30_000, createRng(seed)))
    expect(r.walk).toBeGreaterThan(STUBBORN_WALK - 0.04)
    expect(r.walk).toBeLessThan(STUBBORN_WALK + 0.04)
    expect(r.counter).toBeCloseTo(1 - r.walk)
  })

  it('is deterministic for a seed', () => {
    const answers = (seed: number) => {
      const rng = createRng(seed)
      return Array.from({ length: 20 }, () => respondToAsk(base, sedan, 28_000, rng).answer)
    }
    expect(answers(4)).toEqual(answers(4))
    expect(new Set(answers(4)).size).toBe(2)
  })
})

describe('asking', () => {
  it('opens at MSRP, then splits the difference', () => {
    expect(suggestedAsk(base, sedan)).toBe(30_000)
    expect(suggestedAsk(haggling(2, 30_000, 27_000), sedan)).toBe(28_500)
  })

  it('keeps asks up to MSRP to open, then between their counter and the last ask', () => {
    expect(askRange(base, sedan).max).toBe(30_000)
    expect(clampAsk(base, sedan, 35_000)).toBe(30_000)
    const mid = haggling(2, 29_000, 27_000)
    expect(askRange(mid, sedan)).toEqual({ min: 27_000, max: 29_000 })
    expect(clampAsk(mid, sedan, 30_000)).toBe(29_000)
    expect(clampAsk(mid, sedan, 20_000)).toBe(27_000)
  })
})

describe('staffAsk', () => {
  const h = (lastAsk: number, counter: number) => ({ round: 2, lastAsk, counter })
  const floor = sedan.cost + STAFF_FLOOR_MARGIN

  it('opens at MSRP from average skill up, a little under below that', () => {
    expect([1, 2, 3, 4, 5].map((skill) => staffAsk(skill, sedan, null))).toEqual([
      29_400, 29_400, 30_000, 30_000, 30_000,
    ])
  })

  it('concedes less of the gap the better they are', () => {
    expect(staffConcession(1)).toBeCloseTo(0.6)
    expect(staffConcession(5)).toBeCloseTo(0.2)
    // A $2,000 gap, and a counter too thin for anyone to take.
    expect(staffAsk(3, sedan, h(28_500, 26_500))).toBe(27_700)
    expect(staffAsk(5, sedan, h(30_000, 27_500))).toBe(29_500)
    // Skill 3 never just takes it: 40% of the way down.
    expect(staffAsk(3, sedan, h(30_000, 28_000))).toBe(29_200)
  })

  it('takes a counter: seasoned ones when the gross is healthy, green ones always', () => {
    // 6% of MSRP is $1,800 over the $26,000 cost.
    expect(staffAsk(4, sedan, h(30_000, 27_800))).toBe(27_800)
    expect(staffAsk(4, sedan, h(30_000, 27_700))).toBeGreaterThan(27_700)
    expect(staffAsk(1, sedan, h(29_400, 26_500))).toBe(26_500)
    expect(staffAsk(2, sedan, h(29_400, 26_500))).toBe(26_500)
  })

  it('never goes under cost plus the floor margin, nor outside the ask range', () => {
    for (let skill = 1; skill <= 5; skill++) {
      for (const counter of [20_000, 25_000, 26_200, 26_400, 26_600]) {
        const ask = staffAsk(skill, sedan, h(26_600, counter))
        expect(ask).toBeGreaterThanOrEqual(Math.max(counter, floor))
        expect(ask).toBeLessThanOrEqual(26_600)
      }
    }
    const cheap = { ...sedan, cost: 29_900 }
    expect(staffAsk(1, cheap, null)).toBe(30_000)
  })
})

describe('buying from a seller', () => {
  const seller: Customer = {
    ...base,
    browseCarIds: [],
    targetCarId: null,
    vehicle: {
      car: { model: 'sedan', year: 2020, miles: 70_000, condition: 0.6, acquiredDay: 1 },
      spot: 0,
      parked: true,
    },
    selling: { hope: 10_000, estimate: { estimate: 9_600, margin: 1_200 }, appraised: true },
  }
  const sellerHaggling = (round: number, lastOffer: number, counter: number) =>
    ({ ...seller, haggle: { round, lastAsk: lastOffer, counter } }) satisfies Customer
  const buy = (c: Customer, offer: number) => (seed: number) =>
    respondToBuyOffer(c, offer, createRng(seed))

  it('mostly sells at or over what they hope for, or at their counter', () => {
    expect(rates(buy(seller, 10_000)).accept).toBeCloseTo(sellChance(seller), 1)
    expect(rates(buy(sellerHaggling(2, 8_000, 10_500), 10_500)).accept).toBeGreaterThan(0.85)
  })

  it('counters an offer under their hope, first a little over it, then coming down', () => {
    const first = respondToBuyOffer(seller, 8_500, createRng(1))
    expect(first).toEqual({ answer: 'counter', counter: 10_000 * (1 + SELLER_FIRST_RISE) })
    const next = sellerCounter(sellerHaggling(2, 8_500, 10_300), 9_000)
    expect(next).toBeLessThan(10_300)
    expect(next).toBeGreaterThan(9_000)
    // Never under the offer.
    expect(sellerCounter(sellerHaggling(2, 8_500, 9_000), 9_000)).toBe(9_000)
  })

  it('may walk off insulted by a lowball, or when we hold', () => {
    const lowball = rates(buy(seller, LOWBALL_FRACTION * 10_000 - 100))
    expect(lowball.walk).toBeGreaterThan(0.3)
    expect(lowball.counter).toBeGreaterThan(0.3)
    expect(rates(buy(sellerHaggling(2, 8_500, 10_300), 8_500)).walk).toBeCloseTo(STUBBORN_WALK, 1)
  })

  it('on the last round walks under their reserve, and only reluctantly sells over it', () => {
    const rounds = ARCHETYPES.regular.haggle.rounds
    const last = sellerHaggling(rounds, 8_500, 10_300)
    expect(rates(buy(last, SELLER_RESERVE * 10_000 - 100)).walk).toBe(1)
    const over = rates(buy(last, 9_900))
    expect(over.accept).toBeCloseTo(sellChance(seller) * LAST_ROUND_FACTOR, 1)
  })

  it('warmth follows the same rules', () => {
    expect(buyWarmth(seller, 10_000)).toBe('hot')
    expect(buyWarmth(seller, 9_000)).toBe('warm')
    expect(buyWarmth(seller, 5_000)).toBe('cold')
    expect(buyWarmth(sellerHaggling(2, 8_500, 10_300), 8_500)).toBe('cold')
  })

  it('opens under the estimate and then splits the difference, within range', () => {
    expect(suggestedBuy(seller)).toBe(8_200)
    expect(buyRange(seller)).toEqual({ min: 100, max: 14_400 })
    const h = sellerHaggling(2, 8_500, 10_300)
    expect(buyRange(h)).toEqual({ min: 8_500, max: 10_300 })
    expect(suggestedBuy(h)).toBe(9_400)
    expect(clampBuy(h, 20_000)).toBe(10_300)
  })
})

describe('a trade-in in the deal', () => {
  // Hopes to pay 28,800 and be allowed 10,000 for their car: 18,800 after the trade.
  const trade = { hope: 10_000, estimate: { estimate: 9_500, margin: 1_000 }, appraised: true }
  const trader = (extra: Partial<Customer> = {}): Customer => ({ ...base, trade, ...extra })

  it('weighs what they pay after the trade', () => {
    expect(netOf(trader(), 30_000, 11_200)).toBe(18_800)
    expect(netOf(base, 30_000, 11_200)).toBe(30_000)
    // At the net they hoped for, mostly a yes.
    expect(
      rates((s) => respondToAsk(trader(), sedan, 30_000, createRng(s), 0, 11_200)).accept,
    ).toBeGreaterThan(0.6)
    // Over it, a counter in net terms, under what they hoped to pay after the trade.
    expect(respondToAsk(trader(), sedan, 30_000, createRng(1), 0, 9_000)).toEqual({
      answer: 'counter',
      counter: 18_800 - FIRST_COUNTER_DROP * 30_000,
    })
  })

  it('takes offence at an allowance far under their hope, which costs a round', () => {
    const allowance = TRADE_INSULT * 10_000 - 100
    expect(insultingAllowance(trader(), allowance)).toBe(true)
    // Even a low net doesn't make up for it.
    const res = respondToAsk(trader(), sedan, 20_000, createRng(1), 0, allowance)
    expect(res).toMatchObject({ answer: 'counter', insulted: true })
    const offended = reduceCustomer(
      { ...trader(), phase: 'considering', offer: { carId: sedan.id, price: 20_000, allowance } },
      { type: 'respond', id: 'c1', answer: 'counter', counter: 12_000, insulted: true },
    )!
    expect(offended.haggle).toEqual({
      round: 3,
      lastAsk: 20_000 - allowance,
      counter: 12_000,
      allowance,
    })
    // With no round to spare, they leave.
    expect(respondToAsk(offended, sedan, 20_000, createRng(1), 0, allowance)).toEqual({
      answer: 'walk',
      reason: 'insulted',
    })
    expect(dealWarmth(trader(), sedan, 20_000, 0, allowance)).toBe('cold')
  })

  it('pleases regulars more with a generous allowance at the same net', () => {
    // Not their body type, so the odds aren't capped.
    const c = trader({ preferredModels: [] })
    const generous = rates((s) => respondToAsk(c, sedan, 30_000, createRng(s), 0, 11_200))
    const firm = rates((s) => respondToAsk(c, sedan, 28_000, createRng(s), 0, 9_200))
    expect(generous.accept).toBeGreaterThan(firm.accept + TRADE_PRIDE.regular / 2)
    expect(tradeBonus(trader({ archetype: 'bargain' }), 11_000)).toBe(0)
  })

  it('makes them less keen when the trade is left out', () => {
    expect(tradeBonus(trader())).toBe(-NO_TRADE_PENALTY)
    const without = rates((s) => respondToAsk(trader(), sedan, 28_800, createRng(s)))
    const plain = rates((s) => respondToAsk(base, sedan, 28_800, createRng(s)))
    expect(without.accept).toBeLessThan(plain.accept - NO_TRADE_PENALTY / 2)
  })

  it('puts the allowance back on the haggle’s nets for the prices that can be asked', () => {
    const h = trader({ haggle: { round: 2, lastAsk: 21_000, counter: 17_900, allowance: 9_000 } })
    expect(askRange(h, sedan, 9_000)).toEqual({ min: 26_900, max: 30_000 })
    // Never over MSRP, however much is allowed.
    expect(askRange(h, sedan, 10_000)).toEqual({ min: 27_900, max: 30_000 })
    expect(suggestedAsk(h, sedan, 9_000)).toBe(28_500)
    expect(suggestedAllowance(h)).toBe(9_000)
  })

  it('suggests a little under our estimate, within reason', () => {
    expect(suggestedAllowance(trader())).toBe(9_000)
    expect(clampAllowance(trader(), 50_000)).toBe(allowanceRange(trader()).max)
    expect(clampAllowance(trader(), -5)).toBe(0)
  })
})

describe('staffAllowance', () => {
  it('gives a green salesperson’s buyer what they hope for', () => {
    expect(staffAllowance(1, 9_000, 10_400)).toBe(10_400)
    expect(staffAllowance(2, 9_000, 10_400, 3)).toBe(10_400)
  })

  it('anchors a seasoned one under the appraisal, more with skill, and comes up to it', () => {
    expect(staffAllowance(3, 10_000, 11_000)).toBe(10_000 * (1 - STAFF_TRADE_ANCHOR))
    expect(staffAllowance(5, 10_000, 11_000)).toBe(10_000 * (1 - 3 * STAFF_TRADE_ANCHOR))
    expect(staffAllowance(5, 10_000, 11_000, 2)).toBeGreaterThan(staffAllowance(5, 10_000, 11_000))
    for (let round = 1; round <= 5; round++) {
      expect(staffAllowance(5, 10_000, 11_000, round)).toBeLessThanOrEqual(10_000)
    }
  })

  it('asks a price with the allowance added back to the haggle’s nets', () => {
    // Net counter 17,900 + 10,000 allowed = 27,900, which keeps a healthy gross.
    const h = { round: 2, lastAsk: 20_000, counter: 17_900, allowance: 10_000 }
    expect(staffAsk(4, sedan, h, 10_000)).toBe(27_900)
    expect(staffAsk(4, sedan, h, 10_000)).toBeLessThanOrEqual(sedan.msrp)
  })
})

describe('staffBuyOffer', () => {
  it('opens under the appraisal, further the more skilled', () => {
    expect(staffBuyOffer(1, 10_000, null)).toBe(9_500)
    expect(staffBuyOffer(5, 10_000, null)).toBe(8_500)
  })

  it('never offers over the appraisal', () => {
    const h = { round: 2, lastAsk: 9_500, counter: 12_000 }
    expect(staffBuyOffer(1, 10_000, h)).toBe(10_000)
    expect(staffBuyOffer(5, 10_000, { ...h, lastAsk: 10_000 })).toBe(10_000)
  })

  it('takes a fair price: a green one within the appraisal, a seasoned one with a margin', () => {
    const h = { round: 2, lastAsk: 8_500, counter: 9_800 }
    expect(staffBuyOffer(1, 10_000, h)).toBe(9_800)
    expect(staffBuyOffer(5, 10_000, h)).toBeLessThan(9_800)
    expect(staffBuyOffer(5, 10_000, { ...h, counter: 9_400 })).toBe(9_400)
  })
})
