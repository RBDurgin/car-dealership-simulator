import { describe, expect, it } from 'vitest'
import { applyCall } from './calls'
import { recordClients, emptyClientStats, type Client, type ClientCar } from './clients'
import { generateCustomer, type Customer } from './customers'
import { buildInventory } from './inventory'
import {
  canRefer,
  countFriends,
  creditReferral,
  FEE_REFER,
  MAX_FRIENDS,
  planReferrals,
  REFER_DAILY,
  REFER_MIN,
  REFER_WINDOW,
  referChance,
  REFERRAL_BOOST,
  referralScale,
  THANKED_REFER,
} from './referrals'
import { createRng, type Rng } from './rng'

const DAY = 20

const car = (boughtDay: number): ClientCar => ({
  model: 'sedan',
  used: false,
  price: 25_000,
  boughtDay,
  year: 1,
  miles: 0,
  condition: 1,
})

const client = (id: string, extra: Partial<Client> = {}): Client => ({
  id,
  name: `Person ${id}`,
  variant: 'male-a',
  companion: null,
  archetype: 'regular',
  status: 'client',
  since: 10,
  lastVisit: 10,
  visits: 1,
  bought: 1,
  car: car(10),
  budget: 30_000,
  preferredModels: ['sedan'],
  lastDeal: null,
  satisfaction: 85,
  reasons: [],
  dueDay: 50,
  expires: null,
  lastCall: null,
  callsThisCycle: 0,
  appointment: null,
  referredBy: null,
  referrals: 0,
  friendsSent: 0,
  thanked: false,
  serviceDue: null,
  ...extra,
})

/** An rng that counts its draws. */
function counting(seed: number): Rng & { draws: number } {
  const rng = createRng(seed)
  const out = { ...rng, draws: 0 }
  out.next = () => {
    out.draws++
    return rng.next()
  }
  out.int = (lo, hi) => lo + Math.floor(out.next() * (hi - lo + 1))
  return out
}

describe('referChance', () => {
  it('is nothing under REFER_MIN, REFER_DAILY there and twice that at 100', () => {
    expect(referChance(REFER_MIN - 1)).toBe(0)
    expect(referChance(REFER_MIN)).toBeCloseTo(REFER_DAILY)
    expect(referChance(100)).toBeCloseTo(2 * REFER_DAILY)
  })

  it('rises with the referral fee and after a thank-you call', () => {
    expect(referChance(80, 100)).toBeCloseTo(referChance(80) * FEE_REFER[100])
    expect(referChance(80, 250)).toBeCloseTo(referChance(80) * 2)
    expect(referChance(80, 0, true)).toBeCloseTo(referChance(80) * THANKED_REFER)
  })
})

describe('referralScale', () => {
  it('is 0.5 at 0, 1 at 50 and 1.5 at 100', () => {
    expect(referralScale(0)).toBe(0.5)
    expect(referralScale(50)).toBe(1)
    expect(referralScale(100)).toBe(1.5)
  })
})

describe('canRefer', () => {
  it('only within REFER_WINDOW days of a purchase, from the next day on', () => {
    expect(canRefer(client('a'), 10)).toBe(false)
    expect(canRefer(client('a'), 11)).toBe(true)
    expect(canRefer(client('a'), 10 + REFER_WINDOW)).toBe(true)
    expect(canRefer(client('a'), 11 + REFER_WINDOW)).toBe(false)
  })

  it('not past MAX_FRIENDS, nor for a prospect or a lapsed client', () => {
    expect(canRefer(client('a', { friendsSent: MAX_FRIENDS }), DAY)).toBe(false)
    expect(canRefer(client('a', { status: 'prospect', car: null }), DAY)).toBe(false)
    expect(canRefer(client('a', { status: 'lapsed', car: null }), DAY)).toBe(false)
  })
})

describe('planReferrals', () => {
  const opts = { fee: 0 as const, reputation: 50, scale: 1 }

  it('rolls nothing for a book with nobody to refer', () => {
    const rng = counting(1)
    expect(planReferrals([], DAY, rng, opts)).toEqual([])
    expect(planReferrals([client('a', { satisfaction: 40 })], DAY, rng, opts)).toEqual([])
    expect(planReferrals([client('a', { friendsSent: MAX_FRIENDS })], DAY, rng, opts)).toEqual([])
    expect(rng.draws).toBe(0)
  })

  it('is the same each time for the same day', () => {
    const book = Array.from({ length: 40 }, (_, i) => client(`c${i}`, { satisfaction: 100 }))
    const a = planReferrals(book, DAY, createRng(7), { ...opts, fee: 250, reputation: 100 })
    const b = planReferrals(book, DAY, createRng(7), { ...opts, fee: 250, reputation: 100 })
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
    for (const v of a) expect(v.reason).toBe('friend')
  })

  it('sends more friends with a better name and a fee', () => {
    const book = Array.from({ length: 200 }, (_, i) => client(`c${i}`))
    const friends = (fee: 0 | 250, reputation: number) =>
      Array.from(
        { length: 20 },
        (_, seed) =>
          planReferrals(book, DAY, createRng(seed), { fee, reputation, scale: 1 }).length,
      ).reduce((a, b) => a + b, 0)
    expect(friends(0, 100)).toBeGreaterThan(friends(0, 0))
    expect(friends(250, 50)).toBeGreaterThan(friends(0, 50))
  })
})

describe('the friends sent', () => {
  it('count against their referrer', () => {
    const book = [client('a'), client('b')]
    const after = countFriends(book, [
      { clientId: 'a', minute: 600, reason: 'friend' },
      { clientId: 'b', minute: 600, reason: 'appointment' },
    ])
    expect(after.map((c) => c.friendsSent)).toEqual([1, 0])
    expect(countFriends(book, [])).toBe(book)
  })

  it('who buy please their referrer', () => {
    const [a] = creditReferral([client('a', { satisfaction: 98 })], 'a')
    expect(a).toMatchObject({ referrals: 1, satisfaction: 100 })
    expect(creditReferral([client('a')], 'a')[0].satisfaction).toBe(85 + REFERRAL_BOOST)
  })

  it('go in the book as sent by them, and credit them when they buy', () => {
    const inventory = buildInventory(createRng(1))
    const target = inventory[0]
    const friend: Customer = {
      ...generateCustomer('f', inventory, createRng(3), { referredBy: 'a', source: 'referral' }),
      phase: 'leaving',
      leaveReason: 'bought',
      sellerId: 'player',
      offer: { carId: target.id, price: target.msrp },
    }
    const { book, stats } = recordClients(
      [client('a')],
      emptyClientStats(),
      [{ ...friend, phase: 'signing' }],
      [friend],
      { inventory, day: DAY, shift: 0, rng: createRng(2) },
    )
    expect(book[0]).toMatchObject({ id: 'a', referrals: 1 })
    expect(book[1]).toMatchObject({ status: 'client', referredBy: 'a', friendsSent: 0 })
    expect(stats.referrals).toBe(1)
  })

  it('who walk out credit nobody, but are kept as sent by them', () => {
    const inventory = buildInventory(createRng(1))
    const friend: Customer = {
      ...generateCustomer('f', inventory, createRng(3), { referredBy: 'a' }),
      phase: 'leaving',
      leaveReason: 'refused',
      sellerId: 'player',
    }
    const { book, stats } = recordClients(
      [client('a')],
      emptyClientStats(),
      [{ ...friend, phase: 'talking' }],
      [friend],
      { inventory, day: DAY, shift: 0, rng: createRng(2) },
    )
    expect(book[0].referrals).toBe(0)
    expect(book[1]).toMatchObject({ status: 'prospect', referredBy: 'a' })
    expect(stats.referrals).toBe(0)
  })
})

describe('a thank-you call', () => {
  it('marks them thanked', () => {
    const book = applyCall([client('a')], 'a', 'thanks', { outcome: 'thanked', change: 5 }, DAY, 0)
    expect(book[0].thanked).toBe(true)
    const notNow = applyCall(
      [client('a')],
      'a',
      'checkIn',
      { outcome: 'notNow', change: 0 },
      DAY,
      0,
    )
    expect(notNow[0].thanked).toBe(false)
  })
})

describe('a new purchase', () => {
  it('starts their friends and thanks afresh', () => {
    const inventory = buildInventory(createRng(1))
    const target = inventory[0]
    const back: Customer = {
      ...generateCustomer('k', inventory, createRng(3), { client: client('a') }),
      phase: 'leaving',
      leaveReason: 'bought',
      sellerId: 'player',
      offer: { carId: target.id, price: target.msrp },
    }
    const { book } = recordClients(
      [client('a', { friendsSent: MAX_FRIENDS, thanked: true })],
      emptyClientStats(),
      [{ ...back, phase: 'signing' }],
      [back],
      { inventory, day: DAY, shift: 0, rng: createRng(2) },
    )
    expect(book[0]).toMatchObject({ friendsSent: 0, thanked: false, bought: 2 })
  })
})
