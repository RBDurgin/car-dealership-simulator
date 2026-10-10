import { describe, expect, it } from 'vitest'
import {
  BASE_SCORE,
  blend,
  bookOutcome,
  CLIENT_CAP,
  CLIENT_YEAR_DAYS,
  clientCarInfo,
  emptyClientStats,
  FAIR_TRADE_POINTS,
  HAGGLE_POINTS,
  isDue,
  LAPSE_DAYS,
  LOW_TRADE_POINTS,
  nextClientId,
  PRICE_CAP,
  PROSPECT_DAYS,
  pruneBook,
  QUICK_POINTS,
  reasonText,
  recordClients,
  recordVisit,
  TRADE_UP_DAYS,
  visitScore,
  VISIT_WEIGHT,
  type Client,
  type ClientCar,
} from './clients'
import { generateCustomer, randomName, TRADE_UP_BUDGET, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import { hopePrice } from './negotiation'
import { createRng } from './rng'
import { MILES_PER_YEAR, modelYear } from './usedCars'

const inventory = buildInventory(createRng(42))
const car = inventory.find((c) => c.id === 'lot-car-1')!
const clean = { ...car, cleanliness: 0.6 }
const DAY = 5

/** A shopper on `clean`, quick to be served, who hoped to pay its hope price. */
const shopper: Customer = {
  ...generateCustomer('c1', [], createRng(1), { archetype: 'regular' }),
  budget: 200_000,
  preferredModels: [car.model],
  patience: 60,
  patienceLeft: 60,
  targetCarId: car.id,
  expect: 0.05,
}

/** `shopper` after leaving with `reason`, greeted by the player. */
const left = (reason: Customer['leaveReason'], extra: Partial<Customer> = {}): Customer => ({
  ...shopper,
  phase: 'leaving',
  leaveReason: reason,
  sellerId: 'player',
  ...extra,
})

/** `shopper` having bought `clean` at their hope price, all else neutral. */
const buyer = (extra: Partial<Customer> = {}): Customer =>
  left('bought', { offer: { carId: car.id, price: hopePrice(shopper, clean, DAY) }, ...extra })

const score = (c: Customer, outcome = bookOutcome(c)!, sold: InventoryCar | null = clean) =>
  visitScore(c, outcome, { car: sold, day: DAY })

const rng = () => createRng(7)

const record = (book: Client[], c: Customer, day = DAY, sold: InventoryCar = clean) =>
  recordVisit(
    book,
    { customer: c, outcome: bookOutcome(c)!, car: sold, score: score(c) },
    day,
    rng(),
  )

describe('who goes in the book', () => {
  it('keeps buyers and walk-outs someone greeted', () => {
    expect(bookOutcome(buyer())).toBe('bought')
    expect(bookOutcome(left('refused'))).toBe('refused')
    expect(bookOutcome(left('impatient'))).toBe('impatient')
    expect(bookOutcome(left('closing'))).toBe('closing')
  })

  it('leaves out anyone nobody greeted, sellers, service clients and those still here', () => {
    expect(bookOutcome(left('impatient', { sellerId: null }))).toBeNull()
    expect(bookOutcome(left('closing', { sellerId: null }))).toBeNull()
    const selling = { hope: 9_000, estimate: { estimate: 9_000, margin: 500 }, appraised: false }
    expect(bookOutcome(left('sold', { selling }))).toBeNull()
    expect(bookOutcome(left('refused', { selling }))).toBeNull()
    expect(bookOutcome(left('serviced'))).toBeNull()
    expect(bookOutcome({ ...shopper, phase: 'talking', sellerId: 'player' })).toBeNull()
  })
})

describe('visitScore', () => {
  it('starts from how they left, a quick visit adding a little', () => {
    expect(score(buyer()).score).toBe(BASE_SCORE.bought + QUICK_POINTS)
    expect(score(left('refused')).score).toBe(BASE_SCORE.refused + QUICK_POINTS)
    expect(BASE_SCORE.bought).toBeGreaterThan(BASE_SCORE.closing)
    expect(BASE_SCORE.refused).toBeGreaterThan(BASE_SCORE.impatient)
  })

  it('takes off more the longer they waited, and an appointment minds twice as much', () => {
    const waited = (left: number) => score(buyer({ patienceLeft: left }))
    expect(waited(45).score).toBeGreaterThan(waited(20).score)
    expect(waited(20).reasons[0]).toMatchObject({ kind: 'wait', detail: 40 })
    expect(reasonText(waited(20).reasons[0])).toBe('Waited 40 minutes')
    const twice = visitScore(buyer({ patienceLeft: 30 }), 'bought', {
      car: clean,
      day: DAY,
      waitWeight: 2,
    })
    expect(waited(30).score - twice.score).toBe(20)
  })

  it('takes off for each haggle round after the first', () => {
    const haggled = buyer({ haggle: { round: 3, lastAsk: 30_000, counter: 29_000 } })
    expect(score(buyer()).score - score(haggled).score).toBe(2 * HAGGLE_POINTS)
    expect(score(haggled).reasons.map(reasonText)).toContain('3 rounds of haggling')
  })

  it('likes a price under what they hoped and minds one over, within a cap', () => {
    const hope = hopePrice(shopper, clean, DAY)
    const at = (price: number) => score(buyer({ offer: { carId: car.id, price } }))
    expect(at(hope * 0.97).score).toBeGreaterThan(at(hope).score)
    expect(at(hope * 1.03).score).toBeLessThan(at(hope).score)
    expect(at(hope * 0.5).score - at(hope).score).toBe(PRICE_CAP)
    expect(at(hope * 0.97).reasons.map(reasonText)).toContain('Great price')
  })

  it('likes a clean car and minds a dirty one', () => {
    const on = (cleanliness: number) => score(buyer(), 'bought', { ...clean, cleanliness })
    expect(on(1).score).toBeGreaterThan(on(0.6).score)
    expect(on(0.2).score).toBeLessThan(on(0.6).score)
    expect(on(0.2).reasons.map(reasonText)).toContain('Dirty car')
  })

  it('likes an allowance at what they hoped for their trade, and minds an insulting one', () => {
    const trade = { hope: 10_000, estimate: { estimate: 9_000, margin: 900 }, appraised: true }
    const hope = hopePrice(shopper, clean, DAY)
    const with_ = (allowance: number) =>
      score(
        buyer({ trade, offer: { carId: car.id, price: hope - trade.hope + allowance, allowance } }),
      )
    const base = score(buyer()).score
    expect(with_(10_000).score).toBe(base + FAIR_TRADE_POINTS)
    expect(with_(7_000).score).toBe(base + LOW_TRADE_POINTS)
  })

  it('adds the level’s shift and stays within 0–100', () => {
    const shifted = visitScore(buyer(), 'bought', { car: clean, day: DAY, shift: -5 })
    expect(shifted.score).toBe(score(buyer()).score - 5)
    expect(visitScore(buyer(), 'bought', { car: clean, day: DAY, shift: 50 }).score).toBe(100)
    const awful = left('impatient', {
      patienceLeft: 0,
      haggle: { round: 6, lastAsk: 1, counter: 1 },
    })
    expect(visitScore(awful, 'impatient', { car: null, day: DAY, shift: -50 }).score).toBe(0)
  })

  it('keeps the biggest reasons first, at most three', () => {
    const c = buyer({ patienceLeft: 10, haggle: { round: 2, lastAsk: 1, counter: 1 } })
    const { reasons } = score(c, 'bought', { ...clean, cleanliness: 0.2 })
    expect(reasons.length).toBeLessThanOrEqual(3)
    const sizes = reasons.map((r) => Math.abs(r.points))
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
  })
})

describe('recordVisit', () => {
  it('makes a buyer a client with their car, due to trade up in 30–60 days', () => {
    const [c] = record([], buyer())
    expect(c).toMatchObject({
      id: `client-${DAY}-0`,
      name: shopper.name,
      variant: shopper.variant,
      archetype: shopper.archetype,
      status: 'client',
      since: DAY,
      visits: 1,
      bought: 1,
      expires: null,
      lastDeal: null,
    })
    expect(c.car).toMatchObject({ model: car.model, used: false, boughtDay: DAY, miles: 0 })
    expect(c.dueDay! - DAY).toBeGreaterThanOrEqual(TRADE_UP_DAYS.min)
    expect(c.dueDay! - DAY).toBeLessThanOrEqual(TRADE_UP_DAYS.max)
    expect(c.satisfaction).toBe(score(buyer()).score)
  })

  it('makes a greeted walk-out a prospect, with where the deal stood', () => {
    const haggle = { round: 2, lastAsk: 31_500, counter: 29_800 }
    const [p] = record([], left('refused', { haggle }))
    expect(p).toMatchObject({
      status: 'prospect',
      car: null,
      dueDay: null,
      expires: DAY + PROSPECT_DAYS,
      lastDeal: { model: car.model, ask: 31_500, counter: 29_800 },
    })
  })

  it('updates a returning visitor’s entry, blending their score in', () => {
    const book = record([], left('refused'))
    const back = buyer({ clientId: book[0].id, patienceLeft: 10 })
    const after = record(book, back, DAY + 3)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ status: 'client', visits: 2, bought: 1, since: DAY })
    expect(after[0].lastVisit).toBe(DAY + 3)
    expect(after[0].satisfaction).toBe(blend(book[0].satisfaction, score(back).score))
  })

  it('keeps a client a client when they walk out, and numbers new ids on', () => {
    const book = record([], buyer())
    const after = record(book, left('refused', { clientId: book[0].id }), DAY + 1)
    expect(after[0].status).toBe('client')
    expect(after[0].car).toEqual(book[0].car)
    expect(nextClientId(book, DAY)).toBe(`client-${DAY}-1`)
    expect(nextClientId(book, DAY + 1)).toBe(`client-${DAY + 1}-0`)
  })

  it('blends one visit in by VISIT_WEIGHT', () => {
    expect(blend(80, 30)).toBe(Math.round(80 * (1 - VISIT_WEIGHT) + 30 * VISIT_WEIGHT))
    expect(blend(80, 30)).toBeGreaterThan(50)
  })
})

/** A book entry with `extra`. */
const entry = (id: string, extra: Partial<Client> = {}): Client => ({
  ...record([], buyer())[0],
  id,
  ...extra,
})

describe('pruneBook', () => {
  it('drops prospects past their last day', () => {
    const p = entry('p', { status: 'prospect', car: null, dueDay: null, expires: 10 })
    expect(pruneBook([p], 10)).toEqual([p])
    expect(pruneBook([p], 11)).toEqual([])
  })

  it('lapses clients who didn’t come back within LAPSE_DAYS of falling due', () => {
    const c = entry('c', { dueDay: 40 })
    expect(isDue(c, 39)).toBe(false)
    expect(isDue(c, 40)).toBe(true)
    expect(pruneBook([c], 40 + LAPSE_DAYS)).toEqual([c])
    const [lapsed] = pruneBook([c], 41 + LAPSE_DAYS)
    expect(lapsed).toMatchObject({ status: 'lapsed', car: null, dueDay: null })
    expect(isDue(lapsed, 100)).toBe(false)
  })

  it('returns the same book when nothing changes', () => {
    const book = [entry('a')]
    expect(pruneBook(book, DAY)).toBe(book)
  })

  it('caps the book: defected first, then lapsed, then the oldest prospects', () => {
    const clients = Array.from({ length: CLIENT_CAP - 2 }, (_, i) => entry(`c${i}`))
    const defected = entry('d', { status: 'defected', car: null, dueDay: null })
    const lapsed = entry('l', { status: 'lapsed', car: null, dueDay: null })
    const prospect = (id: string, lastVisit: number) =>
      entry(id, { status: 'prospect', car: null, dueDay: null, expires: 99, lastVisit })
    const book = [
      ...clients,
      prospect('new', 9),
      defected,
      prospect('old', 2),
      lapsed,
      prospect('mid', 5),
    ]
    const kept = pruneBook(book, DAY)
    expect(kept).toHaveLength(CLIENT_CAP)
    expect(kept.map((c) => c.id)).not.toContain('d')
    expect(kept.map((c) => c.id)).not.toContain('l')
    expect(kept.map((c) => c.id)).not.toContain('old')
    expect(kept.map((c) => c.id)).toContain('mid')
  })
})

describe('clientCarInfo', () => {
  const sold: ClientCar = {
    model: 'sedan',
    used: false,
    price: 28_000,
    boughtDay: 10,
    year: modelYear(10),
    miles: 0,
    condition: 1,
  }

  it('ages a client’s car a year every CLIENT_YEAR_DAYS, with miles and wear to match', () => {
    const info = clientCarInfo(sold, 10 + 3 * CLIENT_YEAR_DAYS)
    expect(modelYear(10 + 3 * CLIENT_YEAR_DAYS) - info.year).toBe(3)
    expect(info.miles).toBe(3 * MILES_PER_YEAR)
    expect(info.condition).toBeLessThan(1)
    expect(info.condition).toBeGreaterThan(0.8)
    expect(info.acquiredDay).toBe(10 + 3 * CLIENT_YEAR_DAYS)
  })

  it('makes a 30–60 day trade-up a 2–4 year old car', () => {
    for (const days of [TRADE_UP_DAYS.min, TRADE_UP_DAYS.max]) {
      const day = 10 + days
      const age = modelYear(day) - clientCarInfo(sold, day).year
      expect(age).toBeGreaterThanOrEqual(2)
      expect(age).toBeLessThanOrEqual(4)
    }
  })

  it('starts a used car from the age and miles it left with', () => {
    const used = { ...sold, used: true, year: modelYear(10) - 5, miles: 60_000, condition: 0.6 }
    const info = clientCarInfo(used, 10 + CLIENT_YEAR_DAYS)
    expect(modelYear(10 + CLIENT_YEAR_DAYS) - info.year).toBe(6)
    expect(info.miles).toBe(60_000 + MILES_PER_YEAR)
    expect(info.condition).toBeLessThan(0.6)
  })
})

describe('names and returning clients', () => {
  it('steps past a name in the book without drawing more from the rng', () => {
    const a = createRng(3)
    const b = createRng(3)
    const rolled = randomName(a)
    const unique = randomName(b, new Set([rolled]))
    expect(unique).not.toBe(rolled)
    expect(a.next()).toBe(b.next())
  })

  it('gives a book of CLIENT_CAP everyone their own name', () => {
    const taken = new Set<string>()
    const r = createRng(11)
    for (let i = 0; i < CLIENT_CAP; i++) taken.add(randomName(r, taken))
    expect(taken.size).toBe(CLIENT_CAP)
  })

  it('brings a client back as they were, as a returning client', () => {
    const [c] = record([], buyer())
    const back = generateCustomer('c9', inventory, createRng(5), { client: c })
    expect(back).toMatchObject({
      name: c.name,
      variant: c.variant,
      companion: c.companion,
      archetype: c.archetype,
      budget: c.budget,
      preferredModels: c.preferredModels,
      clientId: c.id,
      source: 'client',
    })
    const up = generateCustomer('c9', inventory, createRng(5), { client: c, tradeUp: true })
    expect(up.budget).toBe(Math.round((c.budget * TRADE_UP_BUDGET) / 500) * 500)
  })

  it('gives a stranger no client id', () => {
    expect(generateCustomer('c9', inventory, createRng(5)).clientId).toBeNull()
  })
})

describe('recordClients', () => {
  const ctx = { inventory: [clean], day: DAY, shift: 0, rng: rng() }

  it('records only those who started leaving, and tallies the day', () => {
    const talking = { ...shopper, id: 'b', phase: 'talking' as const, sellerId: 'player' }
    const prev = [talking, left('refused', { id: 'a' })]
    const next = [buyer({ id: 'b' }), left('refused', { id: 'a' })]
    const { book, stats } = recordClients([], emptyClientStats(), prev, next, ctx)
    expect(book).toHaveLength(1)
    expect(stats).toMatchObject({ added: 1, prospects: 0, returned: 0 })
    expect(stats.scores).toEqual([
      { clientId: book[0].id, outcome: 'bought', ...score(buyer({ id: 'b' })) },
    ])
  })

  it('counts a returning buyer and a new prospect', () => {
    const [old] = record([], buyer())
    const next = [buyer({ id: 'x', clientId: old.id }), left('impatient', { id: 'y' })]
    const { book, stats } = recordClients([old], emptyClientStats(), [], next, ctx)
    expect(book).toHaveLength(2)
    expect(stats).toMatchObject({ added: 0, prospects: 1, returned: 1 })
  })

  it('returns the same book and stats when nobody new is leaving', () => {
    const book: Client[] = []
    const stats = emptyClientStats()
    const out = recordClients(
      book,
      stats,
      [],
      [shopper, left('impatient', { sellerId: null })],
      ctx,
    )
    expect(out.book).toBe(book)
    expect(out.stats).toBe(stats)
  })
})
