import { describe, expect, it } from 'vitest'
import { ARCHETYPES, EXPECT_JITTER } from './archetypes'
import { CUSTOMER_VARIANTS } from './characters'
import {
  acceptChance,
  bubbleOf,
  chooseTarget,
  currentBrowseCarId,
  generateCustomer,
  MAX_ACCEPT_CHANCE,
  MIN_PATIENCE,
  moodOf,
  PATIENCE_MINUTES,
  PLAYER_ID,
  PLAYER_SKILL,
  reduceCustomer,
  reduceCustomers,
  SKILL_BONUS,
  skillBonus,
  staffHandled,
  type Customer,
  type CustomerEvent,
} from './customers'
import { GUEST_CHAIR_ID } from './layout'
import { availableCars, BASE_MSRP, buildInventory, sellCar, type InventoryCar } from './inventory'
import { createRng } from './rng'

const inventory = buildInventory(createRng(42))
const car = (id: string) => inventory.find((c) => c.id === id)!

/** A plain customer for state machine and decision tests. */
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
  browseCarIds: ['lot-car-2', 'lot-car-1'],
  browsed: 0,
  targetCarId: 'lot-car-1',
  offer: null,
  expect: 0.04,
  haggle: null,
  phase: 'arriving',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
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

      const traits = ARCHETYPES[c.archetype]
      const top = Math.max(...c.preferredModels.map((m) => BASE_MSRP[m]))
      expect(c.budget % 500).toBe(0)
      expect(c.budget).toBeGreaterThanOrEqual(top * traits.budget.min - 250)
      expect(c.budget).toBeLessThanOrEqual(top * traits.budget.max + 250)

      expect(c.patience % 5).toBe(0)
      expect(c.patience).toBeGreaterThanOrEqual(
        Math.max(MIN_PATIENCE, PATIENCE_MINUTES.min * traits.patience - 5),
      )
      expect(c.patience).toBeLessThanOrEqual(PATIENCE_MINUTES.max * traits.patience + 5)
      expect(c.patienceLeft).toBe(c.patience)
    }
  })

  it('browses as many distinct cars as their archetype likes, ending at the target', () => {
    for (const c of customers) {
      const { browse } = ARCHETYPES[c.archetype]
      expect(c.browseCarIds.length).toBeGreaterThanOrEqual(browse.min)
      expect(c.browseCarIds.length).toBeLessThanOrEqual(browse.max)
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

  it('rolls every archetype, regulars most often', () => {
    const counts = new Map<string, number>()
    for (const c of customers) counts.set(c.archetype, (counts.get(c.archetype) ?? 0) + 1)
    expect([...counts.keys()].sort()).toEqual(Object.keys(ARCHETYPES).sort())
    const regulars = counts.get('regular')!
    for (const [a, n] of counts) if (a !== 'regular') expect(n).toBeLessThan(regulars)
  })

  it('gives couples, and only couples, a companion who looks different', () => {
    for (const c of customers) {
      if (c.archetype === 'couple') {
        expect(CUSTOMER_VARIANTS).toContain(c.companion)
        expect(c.companion).not.toBe(c.variant)
      } else {
        expect(c.companion).toBeNull()
      }
    }
  })

  it('takes a given look and archetype', () => {
    const c = generateCustomer('x', inventory, createRng(5), {
      variant: 'female-c',
      archetype: 'decisive',
    })
    expect(c.variant).toBe('female-c')
    expect(c.archetype).toBe('decisive')
    expect(c.browseCarIds).toHaveLength(1)
  })

  it("hopes for their archetype's discount off MSRP, give or take", () => {
    for (const c of customers) {
      const { expect: want } = ARCHETYPES[c.archetype].haggle
      expect(c.haggle).toBeNull()
      expect(Math.abs(c.expect - want)).toBeLessThanOrEqual(EXPECT_JITTER + 1e-9)
    }
    expect(new Set(customers.map((c) => c.expect)).size).toBeGreaterThan(10)
  })

  it('hopes for less off with showroom improvements up, but still something', () => {
    for (let i = 0; i < 20; i++) {
      const plain = generateCustomer('x', inventory, createRng(i))
      const cut = generateCustomer('x', inventory, createRng(i), { expectCut: 0.25 })
      expect(cut.expect).toBeCloseTo(plain.expect * 0.75, 2)
      if (plain.expect > 0) expect(cut.expect).toBeGreaterThan(0)
      expect({ ...cut, expect: 0 }).toEqual({ ...plain, expect: 0 })
    }
  })

  it('makes bargain hunters spend less and decisive buyers wait less', () => {
    const many = (archetype: 'regular' | 'bargain' | 'decisive') =>
      Array.from({ length: 100 }, (_, i) =>
        generateCustomer(`c${i}`, inventory, createRng(i), { archetype }),
      )
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const budgetShare = (c: Customer) =>
      c.budget / Math.max(...c.preferredModels.map((m) => BASE_MSRP[m]))
    expect(mean(many('bargain').map(budgetShare))).toBeLessThan(
      mean(many('regular').map(budgetShare)) - 0.15,
    )
    expect(mean(many('decisive').map((c) => c.patience))).toBeLessThan(
      mean(many('regular').map((c) => c.patience)) * 0.7,
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

describe('acceptChance', () => {
  // Half clean: no bonus or penalty for the car's condition.
  const sedan: InventoryCar = { ...car('lot-car-1'), model: 'sedan', cleanliness: 0.5 }
  const truck: InventoryCar = { ...sedan, model: 'truck' }

  it('always refuses over budget', () => {
    expect(acceptChance(base, sedan, base.budget + 100)).toBe(0)
  })

  it('likes preferred cars and lower prices better', () => {
    const atLimit = acceptChance(base, truck, base.budget)
    expect(atLimit).toBeCloseTo(0.35)
    expect(acceptChance(base, sedan, base.budget)).toBeCloseTo(0.7)
    expect(acceptChance(base, truck, base.budget * 0.9)).toBeGreaterThan(atLimit)
    expect(acceptChance(base, sedan, base.budget * 0.5)).toBe(MAX_ACCEPT_CHANCE)
  })

  it('makes tire-kickers hard to sell to and decisive buyers easy', () => {
    const atLimit = acceptChance(base, sedan, base.budget)
    const kicker = { ...base, archetype: 'tire-kicker' as const }
    const decisive = { ...base, archetype: 'decisive' as const }
    expect(acceptChance(kicker, sedan, base.budget)).toBeCloseTo(atLimit - 0.35)
    expect(acceptChance(decisive, sedan, base.budget)).toBeCloseTo(atLimit + 0.15)
    // Never below zero, and still a no over budget.
    expect(acceptChance(kicker, truck, base.budget, skillBonus(1))).toBe(0)
    expect(acceptChance(decisive, sedan, base.budget + 100)).toBe(0)
  })

  it("adds the seller's skill: −10% for a novice up to +5% for the best", () => {
    expect(skillBonus(1)).toBeCloseTo(SKILL_BONUS.min)
    expect(skillBonus(5)).toBeCloseTo(SKILL_BONUS.max)
    expect(skillBonus(PLAYER_SKILL)).toBeGreaterThan(0)
    expect(skillBonus(2)).toBeLessThan(skillBonus(3))
    const atLimit = acceptChance(base, truck, base.budget)
    expect(acceptChance(base, truck, base.budget, skillBonus(1))).toBeCloseTo(atLimit - 0.1)
    expect(acceptChance(base, truck, base.budget, skillBonus(5))).toBeCloseTo(atLimit + 0.05)
    // Still capped, and still a no over budget.
    expect(acceptChance(base, sedan, base.budget * 0.5, skillBonus(5))).toBe(MAX_ACCEPT_CHANCE)
    expect(acceptChance(base, sedan, base.budget + 100, skillBonus(5))).toBe(0)
  })

  it('likes clean cars better: up to +8% spotless, −8% filthy', () => {
    const atLimit = acceptChance(base, truck, base.budget)
    expect(acceptChance(base, { ...truck, cleanliness: 1 }, base.budget)).toBeCloseTo(
      atLimit + 0.08,
    )
    expect(acceptChance(base, { ...truck, cleanliness: 0 }, base.budget)).toBeCloseTo(
      atLimit - 0.08,
    )
    // Still a no over budget, however clean.
    expect(acceptChance(base, { ...sedan, cleanliness: 1 }, base.budget + 100)).toBe(0)
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
      [{ type: 'greet', id: 'c1', carId: 'lot-car-1', by: 'player' }, 'talking'],
      [{ type: 'offer', id: 'c1', carId: 'lot-car-1', price: 28_000 }, 'considering'],
      [{ type: 'respond', id: 'c1', answer: 'accept' }, 'following'],
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

  it('belongs to whoever greeted them until they leave', () => {
    const talking = run(at('waiting'), { type: 'greet', id: 'c1', carId: 'a', by: 'staff-1' })!
    expect(talking.handlerId).toBe('staff-1')
    expect(staffHandled(talking)).toBe(true)
    const gone = run(talking, { type: 'close' })!
    expect(gone).toMatchObject({ phase: 'leaving', handlerId: null })
  })

  it('is handed off to finance, waits in the lounge and is called to the desk', () => {
    const following = at('following', { handlerId: PLAYER_ID })
    const queued = run(following, { type: 'handOff', id: 'c1', to: 'staff-1' })!
    expect(queued).toMatchObject({ phase: 'queued', handlerId: 'staff-1' })
    expect(moodOf(queued)).toBe('happy')
    expect(bubbleOf(queued)).toBeNull()
    // Waiting for finance costs no patience.
    expect(reduceCustomer(queued, { type: 'tick', minutes: 30 })).toBe(queued)

    const called = run(queued, { type: 'call', id: 'c1' })!
    expect(called).toMatchObject({
      phase: 'following',
      handlerId: 'staff-1',
      chairId: GUEST_CHAIR_ID,
    })
    expect(run(called, { type: 'seat', id: 'c1' })).toMatchObject({
      phase: 'signing',
      chairId: GUEST_CHAIR_ID,
    })

    // A salesperson's buyer can be handed off too, but not once sent to a desk,
    // nor to the finance manager who already has them.
    const theirs = at('following', { handlerId: 'staff-2' })
    expect(run(theirs, { type: 'handOff', id: 'c1', to: 'staff-1' })).toMatchObject({
      phase: 'queued',
      handlerId: 'staff-1',
    })
    const atDesk = at('following', { handlerId: 'staff-2', chairId: 'sales-guest-1' })
    expect(reduceCustomer(atDesk, { type: 'handOff', id: 'c1', to: 'staff-1' })).toBe(atDesk)
    expect(reduceCustomer(called, { type: 'handOff', id: 'c1', to: 'staff-1' })).toBe(called)
    const talking = at('talking', { handlerId: PLAYER_ID })
    expect(reduceCustomer(talking, { type: 'handOff', id: 'c1', to: 'staff-1' })).toBe(talking)
    expect(reduceCustomer(following, { type: 'call', id: 'c1' })).toBe(following)
  })

  it('can be greeted while still browsing', () => {
    const c = run(at('browsing'), { type: 'greet', id: 'c1', carId: 'lot-car-5', by: 'player' })!
    expect(c).toMatchObject({ phase: 'talking', targetCarId: 'lot-car-5' })
  })

  it('leaves unhappy when the offer is refused or nothing is for sale', () => {
    const refused = run(at('considering', { offer: { carId: 'x', price: 1 } }), {
      type: 'respond',
      id: 'c1',
      answer: 'walk',
    })!
    expect(refused).toMatchObject({ phase: 'leaving', leaveReason: 'refused', offer: null })
    expect(moodOf(refused)).toBe('unhappy')

    const empty = run(at('waiting'), { type: 'greet', id: 'c1', carId: null, by: 'player' })!
    expect(empty).toMatchObject({ phase: 'leaving', leaveReason: 'refused' })
  })

  it('goes back to talking with their counter, and keeps score of the haggle', () => {
    const considering = at('considering', { offer: { carId: 'x', price: 30_000 } })
    const countered = run(considering, {
      type: 'respond',
      id: 'c1',
      answer: 'counter',
      counter: 27_000,
    })!
    expect(countered).toMatchObject({
      phase: 'talking',
      offer: null,
      haggle: { round: 2, lastAsk: 30_000, counter: 27_000 },
    })
    expect(bubbleOf(countered)).toBe('counter')

    const asked = run(countered, { type: 'offer', id: 'c1', carId: 'x', price: 28_500 })!
    expect(asked).toMatchObject({ phase: 'considering', haggle: { round: 2 } })
    const again = run(asked, { type: 'respond', id: 'c1', answer: 'counter', counter: 27_600 })!
    expect(again.haggle).toEqual({ round: 3, lastAsk: 28_500, counter: 27_600 })

    // Walking off starts the haggle over.
    expect(run(again, { type: 'cancel', id: 'c1' })!.haggle).toBeNull()
  })

  it('goes back to waiting when the player walks away', () => {
    const offer = { carId: 'lot-car-1', price: 28_000 }
    for (const phase of ['talking', 'considering', 'following', 'signing', 'queued'] as const) {
      const c = run(at(phase, { offer, handlerId: PLAYER_ID }), { type: 'cancel', id: 'c1' })!
      expect(c).toMatchObject({ phase: 'waiting', offer: null, handlerId: null })
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
      { type: 'greet', id: 'c1', carId: 'a', by: 'player' },
      { type: 'cancel', id: 'c1' },
    )!
    expect(resumed.patienceLeft).toBe(30)

    const gone = run(resumed, tick(40))!
    expect(gone).toMatchObject({ phase: 'leaving', leaveReason: 'impatient', patienceLeft: 0 })
    expect(moodOf(gone)).toBe('unhappy')
  })

  it("doesn't wear down the customer the player is heading to", () => {
    const c = at('waiting')
    expect(reduceCustomer(c, { type: 'tick', minutes: 10, except: 'c1' })).toBe(c)
    expect(reduceCustomer(c, { type: 'tick', minutes: 10, except: 'c2' })?.patienceLeft).toBe(50)
  })

  it('sends everyone home at closing except a customer mid-signature', () => {
    for (const phase of ['arriving', 'browsing', 'waiting', 'talking', 'following'] as const) {
      const c = run(at(phase), { type: 'close' })!
      expect(c).toMatchObject({ phase: 'leaving', leaveReason: 'closing' })
      expect(moodOf(c)).toBe('neutral')
    }
    const signing = at('signing')
    expect(reduceCustomer(signing, { type: 'close' })).toBe(signing)
    // Finance finishes the buyers it was handed; the player's follower goes home.
    for (const phase of ['queued', 'following'] as const) {
      const c = at(phase, { handlerId: 'staff-1' })
      expect(reduceCustomer(c, { type: 'close' })).toBe(c)
    }
    const mine = run(at('following', { handlerId: PLAYER_ID }), { type: 'close' })!
    expect(mine.leaveReason).toBe('closing')
    const leaving = at('leaving', { leaveReason: 'impatient' })
    expect(reduceCustomer(leaving, { type: 'close' })).toBe(leaving)
  })

  it('ignores stale and out-of-order events', () => {
    const waiting = at('waiting')
    const stale: CustomerEvent[] = [
      { type: 'arrive', id: 'c1' },
      { type: 'browsed', id: 'c1' },
      { type: 'offer', id: 'c1', carId: 'x', price: 1 },
      { type: 'respond', id: 'c1', answer: 'accept' },
      { type: 'seat', id: 'c1' },
      { type: 'signed', id: 'c1' },
      { type: 'despawn', id: 'c1' },
      // Events for someone else.
      { type: 'greet', id: 'c2', carId: 'x', by: 'player' },
    ]
    for (const ev of stale) expect(reduceCustomer(waiting, ev)).toBe(waiting)

    const leaving = at('leaving', { leaveReason: 'refused' })
    expect(reduceCustomer(leaving, { type: 'greet', id: 'c1', carId: 'x', by: 'player' })).toBe(
      leaving,
    )
    expect(reduceCustomer(leaving, { type: 'tick', minutes: 99 })).toBe(leaving)
  })
})

describe('reduceCustomers', () => {
  const crowd = [at('waiting'), at('browsing', { id: 'c2' }), at('leaving', { id: 'c3' })]

  it('routes events by id and removes despawned customers', () => {
    const greeted = reduceCustomers(crowd, { type: 'greet', id: 'c2', carId: 'x', by: 'player' })
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
    expect(reduceCustomers(crowd, { type: 'greet', id: 'nobody', carId: 'x', by: 'player' })).toBe(
      crowd,
    )
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

describe('salespeople', () => {
  it('claim a customer on the way over, which keeps everyone else off them', () => {
    const waiting = at('waiting')
    const claimed = run(waiting, { type: 'claim', id: 'c1', by: 'staff-1' })!
    expect(claimed).toMatchObject({ phase: 'waiting', handlerId: 'staff-1' })
    expect(staffHandled(claimed)).toBe(true)
    expect(bubbleOf(claimed)).toBe('helped')
    // Someone else can neither claim nor greet them.
    expect(reduceCustomer(claimed, { type: 'claim', id: 'c1', by: 'staff-2' })).toBe(claimed)
    const greet = { type: 'greet', id: 'c1', carId: 'lot-car-1' } as const
    expect(reduceCustomer(claimed, { ...greet, by: PLAYER_ID })).toBe(claimed)
    // The claimer can.
    expect(run(claimed, { ...greet, by: 'staff-1' })).toMatchObject({
      phase: 'talking',
      handlerId: 'staff-1',
      sellerId: 'staff-1',
    })
    // Only browsing or waiting customers can be claimed.
    const talking = at('talking', { handlerId: PLAYER_ID })
    expect(reduceCustomer(talking, { type: 'claim', id: 'c1', by: 'staff-1' })).toBe(talking)
  })

  it("don't let a claimed customer lose patience, and can give up on them", () => {
    const claimed = at('waiting', { handlerId: 'staff-1' })
    expect(reduceCustomer(claimed, { type: 'tick', minutes: 30 })).toBe(claimed)
    const browsing = at('browsing', { handlerId: 'staff-1', browsed: 1 })
    expect(run(browsing, { type: 'cancel', id: 'c1' })).toMatchObject({
      phase: 'browsing',
      browsed: 1,
      handlerId: null,
    })
    expect(run(claimed, { type: 'close' })).toMatchObject({ phase: 'leaving', handlerId: null })
  })

  it('send their buyer to their own desk to sign', () => {
    const buyer = at('following', { handlerId: 'staff-1', sellerId: 'staff-1' })
    const led = run(buyer, { type: 'lead', id: 'c1', chairId: 'sales-guest-1' })!
    expect(led.chairId).toBe('sales-guest-1')
    // Already on their way: the desk doesn't change.
    expect(reduceCustomer(led, { type: 'lead', id: 'c1', chairId: 'sales-guest-2' })).toBe(led)
    expect(run(led, { type: 'seat', id: 'c1' })).toMatchObject({
      phase: 'signing',
      chairId: 'sales-guest-1',
    })
    // Only staff send buyers to a desk; the player walks theirs over.
    const mine = at('following', { handlerId: PLAYER_ID })
    expect(reduceCustomer(mine, { type: 'lead', id: 'c1', chairId: 'sales-guest-1' })).toBe(mine)
    // Spared at closing, mid-walk; dropping the deal clears it all.
    expect(run(led, { type: 'close' })).toBe(led)
    expect(run(led, { type: 'cancel', id: 'c1' })).toMatchObject({
      phase: 'waiting',
      handlerId: null,
      chairId: null,
      sellerId: null,
    })
  })

  it('keep the sale to their name after handing off to finance', () => {
    const buyer = at('following', { handlerId: 'staff-1', sellerId: 'staff-1' })
    expect(run(buyer, { type: 'handOff', id: 'c1', to: 'staff-9' })).toMatchObject({
      phase: 'queued',
      handlerId: 'staff-9',
      sellerId: 'staff-1',
    })
  })
})
