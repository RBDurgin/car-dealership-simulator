import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from './archetypes'
import { acceptChance, reduceCustomer, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import {
  askRange,
  clampAsk,
  counterPrice,
  FIRST_COUNTER_DROP,
  hopePrice,
  LAST_ROUND_FACTOR,
  respondToAsk,
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
