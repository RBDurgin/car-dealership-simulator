import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from './archetypes'
import { acceptChance, reduceCustomer, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import {
  askRange,
  clampAsk,
  counterPrice,
  dealWarmth,
  FIRST_COUNTER_DROP,
  hopePrice,
  LAST_ROUND_FACTOR,
  respondToAsk,
  STAFF_FLOOR_MARGIN,
  staffAsk,
  staffConcession,
  STUBBORN_WALK,
  suggestedAsk,
  type AskResponse,
} from './negotiation'
import { createRng } from './rng'

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
