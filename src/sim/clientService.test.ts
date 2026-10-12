import { describe, expect, it } from 'vitest'
import {
  afterService,
  canPitch,
  COMEBACK_POINTS,
  isServiceDue,
  LATE_SERVICE_POINTS,
  pitchBooked,
  pitchChance,
  planBookService,
  recallClient,
  recallOwners,
  SERVICE_BOOST,
  serviceChance,
  serviceWearBack,
  TURNED_AWAY_POINTS,
} from './clientService'
import { DUE_SOON, recordVisit, SERVICE_INTERVAL, type Client, type ClientCar } from './clients'
import { generateCustomer } from './customers'
import { buildInventory } from './inventory'
import { createRng } from './rng'

const DAY = 20

const carOf = (boughtDay: number, model: ClientCar['model'] = 'sedan'): ClientCar => ({
  model,
  used: false,
  price: 25_000,
  boughtDay,
  year: 2026,
  miles: 0,
  condition: 1,
})

const person = (id: string, extra: Partial<Client> = {}): Client => ({
  id,
  name: `Person ${id}`,
  variant: 'male-a',
  companion: null,
  archetype: 'regular',
  status: 'client',
  since: 1,
  lastVisit: 1,
  visits: 1,
  bought: 1,
  car: carOf(1),
  budget: 30_000,
  preferredModels: ['sedan'],
  lastDeal: null,
  satisfaction: 70,
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
  serviceDue: DAY,
  ...extra,
})

const opts = { scale: 1, clientReturn: 1, max: 100 }

describe('service from the client book', () => {
  it('makes a buyer due for service an interval after the sale', () => {
    const [car] = buildInventory(createRng(1))
    const rng = createRng(2)
    const c = generateCustomer('x', [car], rng)
    const buyer = {
      ...c,
      phase: 'leaving' as const,
      leaveReason: 'bought' as const,
      offer: { carId: car.id, price: car.msrp },
    }
    const [client] = recordVisit(
      [],
      { customer: buyer, outcome: 'bought', car, score: { score: 80, reasons: [] } },
      5,
      rng,
    )
    expect(client.serviceDue).toBe(5 + SERVICE_INTERVAL)
  })

  it('is due only for a client with a car from us, once the day comes', () => {
    expect(isServiceDue(person('a'), DAY)).toBe(true)
    expect(isServiceDue(person('a'), DAY - 1)).toBe(false)
    expect(isServiceDue(person('a', { car: null }), DAY)).toBe(false)
    expect(isServiceDue(person('a', { status: 'lapsed' }), DAY)).toBe(false)
  })

  it('brings happier clients in more often', () => {
    expect(serviceChance(100)).toBeGreaterThan(serviceChance(70))
    expect(serviceChance(70)).toBeGreaterThan(serviceChance(30))
  })

  it('plans visits from those due, the same each time for the same day', () => {
    const book = Array.from({ length: 60 }, (_, i) => person(`c${i}`))
    const a = planBookService(book, DAY, createRng(DAY), opts)
    expect(a).toEqual(planBookService(book, DAY, createRng(DAY), opts))
    expect(a.length).toBeGreaterThan(2)
    expect(a.length).toBeLessThan(15)
    for (const v of a) expect(book.some((c) => c.id === v.clientId)).toBe(true)
  })

  it('plans nobody not yet due, skipped, on a shut day or past the bays’ room', () => {
    const book = Array.from({ length: 60 }, (_, i) => person(`c${i}`))
    expect(planBookService(book, DAY - 1, createRng(1), opts)).toEqual([])
    expect(planBookService(book, DAY, createRng(1), { ...opts, scale: 0 })).toEqual([])
    expect(planBookService(book, DAY, createRng(1), { ...opts, max: 0.5 })).toEqual([])
    expect(
      planBookService(book, DAY, createRng(1), { ...opts, max: 2 }).length,
    ).toBeLessThanOrEqual(2)
    const skip = new Set(book.map((c) => c.id))
    expect(planBookService(book, DAY, createRng(1), { ...opts, skip })).toEqual([])
  })

  it('pleases a client served on time, and puts their next service off', () => {
    const book = [person('a'), person('b')]
    const done = afterService(book, 'a', 'serviced', DAY)
    expect(done[0].satisfaction).toBe(70 + SERVICE_BOOST)
    expect(done[0].serviceDue).toBe(DAY + SERVICE_INTERVAL)
    expect(done[0].car!.condition).toBe(1)
    expect(done[1]).toBe(book[1])
    const worn = afterService(
      [person('a', { car: { ...carOf(1), condition: 0.8 } })],
      'a',
      'late',
      DAY,
    )
    expect(worn[0].satisfaction).toBe(70 + LATE_SERVICE_POINTS)
    expect(worn[0].car!.condition).toBeCloseTo(0.8 + serviceWearBack())
  })

  it('costs satisfaction for a comeback or being turned away', () => {
    const back = afterService([person('a')], 'a', 'comeback', DAY)[0]
    expect(back.satisfaction).toBe(70 + COMEBACK_POINTS)
    expect(back.serviceDue).toBe(DAY)
    const away = afterService([person('a')], 'a', 'turnedAway', DAY)[0]
    expect(away.satisfaction).toBe(70 + TURNED_AWAY_POINTS)
    expect(away.serviceDue).toBe(DAY + SERVICE_INTERVAL)
    const book = [person('a')]
    expect(afterService(book, 'nobody', 'serviced', DAY)).toBe(book)
  })
})

describe('recalls from the book', () => {
  const book = [
    person('a', { car: carOf(1, 'truck') }),
    person('b', { car: carOf(1, 'truck'), serviceDue: DAY + 5 }),
    person('c', { car: carOf(1, 'sedan') }),
    person('d', { car: carOf(1, 'truck'), status: 'lapsed' }),
  ]

  it('counts the clients who drive the recalled model', () => {
    expect(recallOwners(book, 'truck')).toBe(2)
    expect(recallOwners(book, 'suv')).toBe(0)
  })

  it('calls in a client with that model not serviced since the recall began', () => {
    // b was serviced on day 11, after the recall began on the 8th.
    expect(recallClient(book, 'truck', DAY, new Set(), createRng(1))?.id).toBe('a')
    expect(recallClient(book, 'truck', DAY, new Set(['a']), createRng(1))).toBeNull()
    expect(recallClient(book, 'suv', DAY, new Set(), createRng(1))).toBeNull()
  })
})

describe('pitching a trade-up', () => {
  it('is for a client due within a week with nothing booked', () => {
    expect(canPitch(person('a', { dueDay: DAY + DUE_SOON }), DAY)).toBe(true)
    expect(canPitch(person('a', { dueDay: DAY + DUE_SOON + 1 }), DAY)).toBe(false)
    expect(canPitch(person('a', { dueDay: DAY, status: 'prospect' }), DAY)).toBe(false)
    const appointment = { day: DAY + 1, minute: 600, reason: 'tradeUp' as const }
    expect(canPitch(person('a', { dueDay: DAY, appointment }), DAY)).toBe(false)
  })

  it('lands more often with happier clients', () => {
    expect(pitchChance(person('a', { satisfaction: 90 }))).toBeGreaterThan(
      pitchChance(person('a', { satisfaction: 40 })),
    )
  })

  it('books them in tomorrow, due by then', () => {
    const [c] = pitchBooked([person('a', { dueDay: DAY + 5 })], 'a', DAY, 630)
    expect(c.appointment).toEqual({ day: DAY + 1, minute: 630, reason: 'tradeUp' })
    expect(c.dueDay).toBe(DAY + 1)
  })
})
