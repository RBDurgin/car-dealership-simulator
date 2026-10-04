import { describe, expect, it } from 'vitest'
import { CUSTOMER_VARIANTS } from './characters'
import {
  acceptChance,
  bubbleOf,
  BUDGET_FACTOR,
  chooseTarget,
  currentBrowseCarId,
  decide,
  generateCustomer,
  MAX_ACCEPT_CHANCE,
  moodOf,
  PATIENCE_MINUTES,
  reduceCustomer,
  reduceCustomers,
  type Customer,
  type CustomerEvent,
} from './customers'
import { availableCars, BASE_MSRP, buildInventory, sellCar, type InventoryCar } from './inventory'
import { createRng } from './rng'

const inventory = buildInventory(createRng(42))
const car = (id: string) => inventory.find((c) => c.id === id)!

/** A plain customer for state machine and decision tests. */
const base: Customer = {
  id: 'c1',
  name: 'Alex B.',
  variant: 'male-a',
  budget: 40_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: ['lot-car-2', 'lot-car-1'],
  browsed: 0,
  targetCarId: 'lot-car-1',
  offer: null,
  phase: 'arriving',
  leaveReason: null,
}

const run = (c: Customer, ...events: CustomerEvent[]) =>
  events.reduce<Customer | null>((cur, ev) => (cur ? reduceCustomer(cur, ev) : null), c)

const at = (phase: Customer['phase'], extra: Partial<Customer> = {}): Customer => ({
  ...base,
  phase,
  ...extra,
})

describe('generateCustomer', () => {
  const customers = Array.from({ length: 200 }, (_, i) =>
    generateCustomer(`c${i}`, inventory, createRng(i)),
  )

  it('rolls sensible traits', () => {
    for (const c of customers) {
      expect(c.phase).toBe('arriving')
      expect(c.name).toMatch(/^\w+ [A-Z]\.$/)
      expect(CUSTOMER_VARIANTS).toContain(c.variant)
      expect(c.preferredModels.length).toBeGreaterThanOrEqual(1)
      expect(new Set(c.preferredModels).size).toBe(c.preferredModels.length)

      const top = Math.max(...c.preferredModels.map((m) => BASE_MSRP[m]))
      expect(c.budget % 500).toBe(0)
      expect(c.budget).toBeGreaterThanOrEqual(top * BUDGET_FACTOR.min - 250)
      expect(c.budget).toBeLessThanOrEqual(top * BUDGET_FACTOR.max + 250)

      expect(c.patience % 5).toBe(0)
      expect(c.patience).toBeGreaterThanOrEqual(PATIENCE_MINUTES.min)
      expect(c.patience).toBeLessThanOrEqual(PATIENCE_MINUTES.max)
      expect(c.patienceLeft).toBe(c.patience)
    }
  })

  it('browses 1–3 distinct cars, ending at the target', () => {
    for (const c of customers) {
      expect(c.browseCarIds.length).toBeGreaterThanOrEqual(1)
      expect(c.browseCarIds.length).toBeLessThanOrEqual(3)
      expect(new Set(c.browseCarIds).size).toBe(c.browseCarIds.length)
      expect(c.browseCarIds.at(-1)).toBe(c.targetCarId)
    }
  })

  it('mostly targets a preferred body type when one is in stock', () => {
    const preferred = customers.filter((c) =>
      c.preferredModels.includes(car(c.targetCarId!).model),
    ).length
    expect(preferred / customers.length).toBeGreaterThan(0.6)
  })

  it('makes some customers unable to afford what they want', () => {
    const short = customers.filter((c) => car(c.targetCarId!).msrp > c.budget).length
    expect(short).toBeGreaterThan(0)
    expect(short).toBeLessThan(customers.length / 2)
  })

  it('has nothing to browse on an empty lot', () => {
    const c = generateCustomer('c', [], createRng(1))
    expect(c.browseCarIds).toEqual([])
    expect(c.targetCarId).toBeNull()
  })

  it('is deterministic for a seed', () => {
    expect(generateCustomer('x', inventory, createRng(5))).toEqual(
      generateCustomer('x', inventory, createRng(5)),
    )
  })
})

describe('chooseTarget', () => {
  it('keeps the target while it is for sale', () => {
    expect(chooseTarget(base, inventory)).toBe('lot-car-1')
  })

  it('falls back to the best remaining car', () => {
    const left = availableCars(sellCar(inventory, 'lot-car-1'))
    // lot-car-8 and lot-car-11 are the other sedans; the first affordable one wins.
    const pick = car(chooseTarget(base, left)!)
    expect(pick.model).toBe('sedan')
    expect(pick.msrp).toBeLessThanOrEqual(base.budget)
  })

  it('returns null when nothing is for sale', () => {
    expect(chooseTarget(base, [])).toBeNull()
  })
})

describe('decide', () => {
  const sedan: InventoryCar = { ...car('lot-car-1'), model: 'sedan' }
  const truck: InventoryCar = { ...sedan, model: 'truck' }

  it('always refuses over budget', () => {
    expect(acceptChance(base, sedan, base.budget + 100)).toBe(0)
    for (let seed = 0; seed < 50; seed++) {
      expect(decide(base, sedan, base.budget + 100, createRng(seed))).toBe(false)
    }
  })

  it('likes preferred cars and lower prices better', () => {
    const atLimit = acceptChance(base, truck, base.budget)
    expect(atLimit).toBeCloseTo(0.35)
    expect(acceptChance(base, sedan, base.budget)).toBeCloseTo(0.7)
    expect(acceptChance(base, truck, base.budget * 0.9)).toBeGreaterThan(atLimit)
    expect(acceptChance(base, sedan, base.budget * 0.5)).toBe(MAX_ACCEPT_CHANCE)
  })

  it('accepts at roughly the predicted rate', () => {
    const rng = createRng(11)
    const n = 2000
    let yes = 0
    for (let i = 0; i < n; i++) if (decide(base, truck, base.budget, rng)) yes++
    expect(yes / n).toBeGreaterThan(0.3)
    expect(yes / n).toBeLessThan(0.4)
  })

  it('is deterministic for a seed', () => {
    const answers = (seed: number) => {
      const rng = createRng(seed)
      return Array.from({ length: 20 }, () => decide(base, truck, 38_000, rng))
    }
    expect(answers(4)).toEqual(answers(4))
    expect(new Set(answers(4)).size).toBe(2)
  })
})

describe('reduceCustomer', () => {
  it('browses each car in turn, then waits', () => {
    const browsing = run(base, { type: 'arrive', id: 'c1' })!
    expect(browsing.phase).toBe('browsing')
    expect(currentBrowseCarId(browsing)).toBe('lot-car-2')

    const second = run(browsing, { type: 'browsed', id: 'c1' })!
    expect(second.phase).toBe('browsing')
    expect(currentBrowseCarId(second)).toBe('lot-car-1')

    const waiting = run(second, { type: 'browsed', id: 'c1' })!
    expect(waiting.phase).toBe('waiting')
    expect(currentBrowseCarId(waiting)).toBeNull()
  })

  it('goes straight to waiting with nothing to browse', () => {
    expect(run({ ...base, browseCarIds: [] }, { type: 'arrive', id: 'c1' })!.phase).toBe('waiting')
  })

  it('runs a sale from greeting to driving off', () => {
    const steps: [CustomerEvent, Customer['phase']][] = [
      [{ type: 'greet', id: 'c1', carId: 'lot-car-1' }, 'talking'],
      [{ type: 'offer', id: 'c1', carId: 'lot-car-1', price: 28_000 }, 'considering'],
      [{ type: 'respond', id: 'c1', accepted: true }, 'following'],
      [{ type: 'seat', id: 'c1' }, 'signing'],
      [{ type: 'signed', id: 'c1' }, 'leaving'],
    ]
    let c = at('waiting')
    for (const [ev, phase] of steps) {
      c = reduceCustomer(c, ev)!
      expect(c.phase).toBe(phase)
    }
    expect(c.offer).toEqual({ carId: 'lot-car-1', price: 28_000 })
    expect(c.leaveReason).toBe('bought')
    expect(moodOf(c)).toBe('happy')
    expect(reduceCustomer(c, { type: 'despawn', id: 'c1' })).toBeNull()
  })

  it('can be greeted while still browsing', () => {
    const c = run(at('browsing'), { type: 'greet', id: 'c1', carId: 'lot-car-5' })!
    expect(c).toMatchObject({ phase: 'talking', targetCarId: 'lot-car-5' })
  })

  it('leaves unhappy when the offer is refused or nothing is for sale', () => {
    const refused = run(at('considering', { offer: { carId: 'x', price: 1 } }), {
      type: 'respond',
      id: 'c1',
      accepted: false,
    })!
    expect(refused).toMatchObject({ phase: 'leaving', leaveReason: 'refused', offer: null })
    expect(moodOf(refused)).toBe('unhappy')

    const empty = run(at('waiting'), { type: 'greet', id: 'c1', carId: null })!
    expect(empty).toMatchObject({ phase: 'leaving', leaveReason: 'refused' })
  })

  it('goes back to waiting when the player walks away', () => {
    const offer = { carId: 'lot-car-1', price: 28_000 }
    for (const phase of ['talking', 'considering', 'following', 'signing'] as const) {
      const c = run(at(phase, { offer }), { type: 'cancel', id: 'c1' })!
      expect(c).toMatchObject({ phase: 'waiting', offer: null })
    }
    for (const phase of ['arriving', 'browsing', 'waiting'] as const) {
      const c = at(phase)
      expect(reduceCustomer(c, { type: 'cancel', id: 'c1' })).toBe(c)
    }
  })

  it('loses patience only while waiting, then leaves', () => {
    const tick = (minutes: number): CustomerEvent => ({ type: 'tick', minutes })
    for (const phase of ['browsing', 'talking', 'following'] as const) {
      const c = at(phase)
      expect(reduceCustomer(c, tick(10))).toBe(c)
    }

    const waiting = run(at('waiting'), tick(30))!
    expect(waiting).toMatchObject({ phase: 'waiting', patienceLeft: 30 })
    expect(moodOf(waiting)).toBe('neutral')
    expect(moodOf(run(waiting, tick(15))!)).toBe('impatient')

    // Patience carries over after a cancelled deal instead of resetting.
    const resumed = run(
      waiting,
      { type: 'greet', id: 'c1', carId: 'a' },
      { type: 'cancel', id: 'c1' },
    )!
    expect(resumed.patienceLeft).toBe(30)

    const gone = run(resumed, tick(40))!
    expect(gone).toMatchObject({ phase: 'leaving', leaveReason: 'impatient', patienceLeft: 0 })
    expect(moodOf(gone)).toBe('unhappy')
  })

  it('sends everyone home at closing except a customer mid-signature', () => {
    for (const phase of ['arriving', 'browsing', 'waiting', 'talking', 'following'] as const) {
      const c = run(at(phase), { type: 'close' })!
      expect(c).toMatchObject({ phase: 'leaving', leaveReason: 'closing' })
      expect(moodOf(c)).toBe('neutral')
    }
    const signing = at('signing')
    expect(reduceCustomer(signing, { type: 'close' })).toBe(signing)
    const leaving = at('leaving', { leaveReason: 'impatient' })
    expect(reduceCustomer(leaving, { type: 'close' })).toBe(leaving)
  })

  it('ignores stale and out-of-order events', () => {
    const waiting = at('waiting')
    const stale: CustomerEvent[] = [
      { type: 'arrive', id: 'c1' },
      { type: 'browsed', id: 'c1' },
      { type: 'offer', id: 'c1', carId: 'x', price: 1 },
      { type: 'respond', id: 'c1', accepted: true },
      { type: 'seat', id: 'c1' },
      { type: 'signed', id: 'c1' },
      { type: 'despawn', id: 'c1' },
      // Events for someone else.
      { type: 'greet', id: 'c2', carId: 'x' },
    ]
    for (const ev of stale) expect(reduceCustomer(waiting, ev)).toBe(waiting)

    const leaving = at('leaving', { leaveReason: 'refused' })
    expect(reduceCustomer(leaving, { type: 'greet', id: 'c1', carId: 'x' })).toBe(leaving)
    expect(reduceCustomer(leaving, { type: 'tick', minutes: 99 })).toBe(leaving)
  })
})

describe('reduceCustomers', () => {
  const crowd = [at('waiting'), at('browsing', { id: 'c2' }), at('leaving', { id: 'c3' })]

  it('routes events by id and removes despawned customers', () => {
    const greeted = reduceCustomers(crowd, { type: 'greet', id: 'c2', carId: 'x' })
    expect(greeted.map((c) => c.phase)).toEqual(['waiting', 'talking', 'leaving'])
    expect(greeted[0]).toBe(crowd[0])

    const gone = reduceCustomers(crowd, { type: 'despawn', id: 'c3' })
    expect(gone.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('applies tick and close to everyone', () => {
    const closed = reduceCustomers(crowd, { type: 'close' })
    expect(closed.every((c) => c.phase === 'leaving')).toBe(true)
    expect(closed[2]).toBe(crowd[2])
  })

  it('returns the same array when nothing changed', () => {
    expect(reduceCustomers(crowd, { type: 'seat', id: 'c1' })).toBe(crowd)
    expect(reduceCustomers(crowd, { type: 'greet', id: 'nobody', carId: 'x' })).toBe(crowd)
    expect(reduceCustomers([], { type: 'close' })).toEqual([])
  })
})

describe('bubbleOf', () => {
  it('shows what the customer is up to', () => {
    expect(bubbleOf(at('arriving'))).toBeNull()
    expect(bubbleOf(at('browsing'))).toBeNull()
    expect(bubbleOf(at('waiting'))).toBe('waiting')
    expect(bubbleOf(at('waiting', { patienceLeft: 10 }))).toBe('impatient')
    expect(bubbleOf(at('considering'))).toBe('considering')
    expect(bubbleOf(at('following'))).toBeNull()
  })

  it('shows how the visit ended', () => {
    const left = (leaveReason: Customer['leaveReason']) => bubbleOf(at('leaving', { leaveReason }))
    expect(left('bought')).toBe('bought')
    expect(left('refused')).toBe('upset')
    expect(left('impatient')).toBe('upset')
    expect(left('closing')).toBeNull()
  })
})
