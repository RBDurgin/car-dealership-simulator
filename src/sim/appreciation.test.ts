import { describe, expect, it } from 'vitest'
import {
  APPRECIATION_COST,
  appreciationBlocker,
  appreciationCost,
  appreciationNotice,
  attendChance,
  ATTEND_CHANCE,
  BOOK_AHEAD,
  bookableDays,
  COOKOUT,
  COST_PER_GUEST,
  invitedCount,
  isAppreciationDay,
  monthIndex,
  nearlyDue,
  NOTICE_AHEAD,
  planGuests,
  welcomeGuest,
  APPRECIATION_BOOST,
  GUEST_WINDOW,
} from './appreciation'
import { DAYS_PER_MONTH } from './calendar'
import type { Client } from './clients'
import { IMPROVEMENT_FOOTPRINTS } from './improvements'
import { applyToGrid, buildInventory, carProp } from './inventory'
import { approachTilesFor } from './interactables'
import {
  buildLayout,
  createGrid,
  CUSTOMER_PARKING,
  GUARD_PATROL_TILES,
  LOT_ENTRY_TILES,
  OPENINGS,
  PARKING_SPACES,
  parkedCarRect,
  PORTER_STANDBY_TILES,
  PROPS,
  SPAWN_TILE,
  zoneAt,
  type Rect,
} from './layout'
import { findPath, findPathToAny } from './pathfinding'
import { createRng } from './rng'

const client = (id: string, extra: Partial<Client> = {}): Client => ({
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
  car: null,
  budget: 30_000,
  preferredModels: ['sedan'],
  lastDeal: null,
  satisfaction: 75,
  reasons: [],
  dueDay: 40,
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

const book = [
  client('a'),
  client('b', { satisfaction: 40 }),
  client('c', { status: 'prospect' }),
  client('d', { status: 'lapsed' }),
]

describe('booking', () => {
  it('invites clients in good standing, and costs more the more there are', () => {
    expect(invitedCount(book)).toBe(1)
    expect(appreciationCost(book)).toBe(APPRECIATION_COST + COST_PER_GUEST)
  })

  it(`books ${BOOK_AHEAD.min}–${BOOK_AHEAD.max} days ahead`, () => {
    const days = bookableDays(null, 5)
    expect(days[0]).toBe(5 + BOOK_AHEAD.min)
    expect(days[days.length - 1]).toBe(5 + BOOK_AHEAD.max)
  })

  it('books one at a time, and once a month', () => {
    expect(bookableDays({ day: 10, month: 0 }, 5)).toEqual([])
    // The last one was in the first month: the next can't be in it too.
    const next = bookableDays({ day: 10, month: 0 }, 20)
    expect(next.every((d) => monthIndex(d) !== 0)).toBe(true)
    expect(next[0]).toBe(DAYS_PER_MONTH + 1)
    expect(monthIndex(1)).toBe(0)
    expect(monthIndex(DAYS_PER_MONTH)).toBe(0)
    expect(monthIndex(DAYS_PER_MONTH + 1)).toBe(1)
  })

  it('says why it can’t be booked', () => {
    const s = { appreciation: null, book, cash: 50_000, today: 5 }
    expect(appreciationBlocker(s, 10)).toBeNull()
    expect(appreciationBlocker(s, 6)).toMatch(/days ahead/)
    expect(appreciationBlocker({ ...s, cash: 100 }, 10)).toMatch(/cash/)
    expect(appreciationBlocker({ ...s, book: [] }, 10)).toMatch(/No clients/)
    expect(appreciationBlocker({ ...s, appreciation: { day: 9, month: 0 } }, 10)).toMatch(
      /already booked/,
    )
  })

  it('is told a few days ahead and on the day', () => {
    const a = { day: 20, month: 0 }
    expect(appreciationNotice(a, 20 - NOTICE_AHEAD)).toMatch(/in 3 days/)
    expect(appreciationNotice(a, 20)).toMatch(/today|grill/)
    expect(appreciationNotice(a, 19)).toBeNull()
    expect(appreciationNotice(null, 20)).toBeNull()
    expect(isAppreciationDay(a, 20)).toBe(true)
    expect(isAppreciationDay(a, 21)).toBe(false)
  })
})

describe('guests', () => {
  it('come the likelier the happier, and fewer in the rain', () => {
    expect(attendChance(client('a', { satisfaction: 70 }))).toBeCloseTo(ATTEND_CHANCE)
    expect(attendChance(client('a', { satisfaction: 90 }))).toBeGreaterThan(ATTEND_CHANCE)
    expect(attendChance(client('a'), 1, 0.6)).toBeCloseTo(attendChance(client('a')) * 0.6)
  })

  it('come over lunch, only if invited and not coming already, the same each time', () => {
    const many = Array.from({ length: 60 }, (_, i) => client(`c${i}`, { satisfaction: 90 }))
    const opts = { scale: 1, weather: 1, skip: new Set(['c0']) }
    const plan = planGuests([...many, ...book.slice(1)], createRng(4), opts)
    expect(plan).toEqual(planGuests([...many, ...book.slice(1)], createRng(4), opts))
    const guests = plan.filter((v) => v.reason === 'appreciation')
    expect(guests.length).toBeGreaterThan(5)
    expect(guests.every((v) => v.minute >= GUEST_WINDOW.from && v.minute <= GUEST_WINDOW.to))
    const ids = new Set(plan.map((v) => v.clientId))
    for (const id of ['c0', 'b', 'c', 'd']) expect(ids.has(id)).toBe(false)
    // Some bring a friend.
    expect(plan.some((v) => v.reason === 'friend')).toBe(true)
  })

  it('come ready to trade up when due within a week', () => {
    expect(nearlyDue(client('a', { dueDay: 45 }), 40)).toBe(true)
    expect(nearlyDue(client('a', { dueDay: 50 }), 40)).toBe(false)
  })

  it('leave happier', () => {
    const [a, b] = welcomeGuest([client('a', { satisfaction: 97 }), client('b')], 'a')
    expect(a.satisfaction).toBe(100)
    expect(b.satisfaction).toBe(75)
    expect(welcomeGuest([client('a')], 'a')[0].satisfaction).toBe(75 + APPRECIATION_BOOST)
  })
})

describe('the cookout', () => {
  const layout = buildLayout()
  const tiles = (r: Rect) =>
    Array.from({ length: r.w * r.h }, (_, i) => `${r.tx + (i % r.w)},${r.tz + Math.floor(i / r.w)}`)
  const one = (t: { tx: number; tz: number }) => ({ ...t, w: 1, h: 1 })

  it('stands on the lot, clear of stock, parking, props and the ways through', () => {
    const taken = new Set(
      [
        ...PROPS.map((p) => p.rect),
        ...PARKING_SPACES.map((s) => s.rect),
        ...CUSTOMER_PARKING.map((s) => s.rect),
        ...(Object.values(IMPROVEMENT_FOOTPRINTS) as Rect[]),
        ...OPENINGS,
        ...LOT_ENTRY_TILES.map(one),
        ...GUARD_PATROL_TILES.map(one),
        ...PORTER_STANDBY_TILES.map(one),
        one(SPAWN_TILE),
      ].flatMap(tiles),
    )
    for (const key of tiles(COOKOUT)) {
      const [tx, tz] = key.split(',').map(Number)
      expect(zoneAt(layout, tx, tz), key).toBe('asphalt')
      expect(taken.has(key), key).toBe(false)
    }
  })

  it('leaves every parked car, the patrol and the showroom reachable', () => {
    const grid = createGrid(layout)
    const inventory = buildInventory(createRng(1))
    applyToGrid(grid, inventory)
    grid.setRectBlocked(COOKOUT, true)
    for (const space of PARKING_SPACES.filter((s) => !s.requires)) {
      const car = carProp({ ...inventory[0], rect: parkedCarRect(space) })
      const approach = approachTilesFor(grid, car.rect)
      expect(approach.length).toBeGreaterThan(0)
      expect(findPathToAny(grid, LOT_ENTRY_TILES[0], approach)).not.toBeNull()
    }
    for (const stop of GUARD_PATROL_TILES) {
      expect(findPath(grid, SPAWN_TILE, stop)).not.toBeNull()
    }
  })
})
