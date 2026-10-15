import { describe, expect, it } from 'vitest'
import {
  ANNOY_POINTS,
  APPOINTMENT_WINDOW,
  appointmentMinute,
  appointmentsNotice,
  appointmentsOn,
  applyCall,
  bookChance,
  CALL_GAP_DAYS,
  callKind,
  callLine,
  callList,
  callOutcome,
  callSkill,
  MAX_CALLS,
  NO_ANSWER,
  planClientVisits,
  receptionCallTime,
  RETURN_WINDOW,
  takeDueClients,
  THANKS_BOOST,
  THANKS_DAYS,
  WIN_BACK_CHANCE,
  WIN_BACK_POINTS,
  winBackChance,
  type CallKind,
} from './calls'
import {
  emptyClientStats,
  LAPSE_DAYS,
  PROSPECT_DAYS,
  pruneBook,
  recordClients,
  returnChance,
  type Client,
} from './clients'
import { beBackExpect, generateCustomer, MAX_BE_BACK_EXPECT, PLAYER_SKILL } from './customers'
import { BASE_MSRP, buildInventory } from './inventory'
import { createRng, type Rng } from './rng'
import { MAX_SKILL, MIN_SKILL } from './staff'

const DAY = 10

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
  chargedBack: false,
  ...extra,
})

const boughtOn = (day: number) => ({
  model: 'sedan' as const,
  used: false,
  price: 25_000,
  boughtDay: day,
  year: 2026,
  miles: 0,
  condition: 1,
})

const prospect = (id: string, extra: Partial<Client> = {}) =>
  person(id, { status: 'prospect', bought: 0, dueDay: null, expires: DAY + 5, ...extra })

/** An rng that returns `values` in turn. */
const fixed = (...values: number[]): Rng => {
  let i = 0
  return {
    next: () => values[i++ % values.length],
    int: (min) => min,
    pick: (items) => items[0],
  }
}

describe('callKind', () => {
  it('calls a prospect back, checks on an unhappy client and thanks a recent buyer', () => {
    expect(callKind(prospect('p'), DAY)).toBe('beBack')
    expect(callKind(person('u', { satisfaction: 40 }), DAY)).toBe('checkIn')
    expect(callKind(person('t', { car: boughtOn(DAY - THANKS_DAYS) }), DAY)).toBe('thanks')
  })

  it('leaves out an old buyer, one already thanked, and lapsed clients', () => {
    expect(callKind(person('o', { car: boughtOn(DAY - THANKS_DAYS - 1) }), DAY)).toBeNull()
    expect(callKind(person('t', { car: boughtOn(DAY), callsThisCycle: 1 }), DAY)).toBeNull()
    expect(callKind(person('l', { status: 'lapsed', satisfaction: 20 }), DAY)).toBeNull()
  })

  it('tries to win back a client who went to the rival, last on the list', () => {
    const gone = person('d', { status: 'defected', satisfaction: 20 })
    expect(callKind(gone, DAY)).toBe('winBack')
    const list = callList([gone, prospect('p')], DAY)
    expect(list.map((e) => e.kind)).toEqual(['beBack', 'winBack'])
  })

  it('wins some back as prospects, more by a skilled caller', () => {
    const gone = person('d', { status: 'defected', satisfaction: 50 })
    expect(winBackChance(gone, 5)).toBeGreaterThan(winBackChance(gone, 1))
    expect(winBackChance(gone, 3)).toBeCloseTo(WIN_BACK_CHANCE)
    let won = 0
    for (let i = 0; i < 400; i++) {
      const r = callOutcome(gone, 'winBack', 3, createRng(i))
      if (r.outcome === 'wonBack') won++
      expect(['wonBack', 'notNow', 'noAnswer']).toContain(r.outcome)
    }
    expect(won / 400).toBeCloseTo((1 - NO_ANSWER) * WIN_BACK_CHANCE, 1)
    const back = applyCall(
      [gone],
      'd',
      'winBack',
      { outcome: 'wonBack', change: WIN_BACK_POINTS },
      DAY,
      0,
    )
    expect(back[0]).toMatchObject({
      status: 'prospect',
      expires: DAY + PROSPECT_DAYS,
      satisfaction: 50 + WIN_BACK_POINTS,
      appointment: null,
    })
    const no = applyCall([gone], 'd', 'winBack', { outcome: 'notNow', change: 0 }, DAY, 0)
    expect(no[0].status).toBe('defected')
  })
})

describe('callList', () => {
  const book = [
    person('thanks', { car: boughtOn(DAY) }),
    person('unhappy', { satisfaction: 30 }),
    prospect('cold', { satisfaction: 40, expires: DAY + 2 }),
    prospect('warm', { satisfaction: 60, expires: DAY + 9 }),
    prospect('warm-soon', { satisfaction: 60, expires: DAY + 1 }),
    person('happy'),
  ]

  it('puts be-backs first (happiest, then soonest to expire), then check-ins, then thank-yous', () => {
    expect(callList(book, DAY).map((e) => e.client.id)).toEqual([
      'warm-soon',
      'warm',
      'cold',
      'unhappy',
      'thanks',
    ])
  })

  it('skips anyone called lately, booked, or in the skip set', () => {
    const later = [
      prospect('called', { lastCall: DAY - CALL_GAP_DAYS + 1 }),
      prospect('called-long-ago', { lastCall: DAY - CALL_GAP_DAYS }),
      prospect('booked', { appointment: { day: DAY + 1, minute: 600, reason: 'beBack' } }),
      prospect('on-lot'),
    ]
    const list = callList(later, DAY, new Set(['on-lot']))
    expect(list.map((e) => e.client.id)).toEqual(['called-long-ago'])
  })
})

describe('callOutcome', () => {
  const p = prospect('p', { satisfaction: 50 })

  it('goes unanswered about NO_ANSWER of the time, and changes nothing', () => {
    expect(callOutcome(p, 'beBack', PLAYER_SKILL, fixed(NO_ANSWER - 0.01))).toEqual({
      outcome: 'noAnswer',
      change: 0,
    })
  })

  it('annoys someone called more than MAX_CALLS times this cycle', () => {
    const pestered = { ...p, callsThisCycle: MAX_CALLS }
    expect(callOutcome(pestered, 'beBack', PLAYER_SKILL, fixed(0.99))).toEqual({
      outcome: 'annoyed',
      change: -ANNOY_POINTS,
    })
  })

  it('pleases a buyer thanked', () => {
    const t = person('t', { car: boughtOn(DAY) })
    expect(callOutcome(t, 'thanks', PLAYER_SKILL, fixed(0.99))).toEqual({
      outcome: 'thanked',
      change: THANKS_BOOST,
    })
  })

  it('books or says not now, by the book odds', () => {
    const odds = bookChance(p, 'beBack', PLAYER_SKILL)
    expect(callOutcome(p, 'beBack', PLAYER_SKILL, fixed(0.5, odds - 0.01)).outcome).toBe('booked')
    expect(callOutcome(p, 'beBack', PLAYER_SKILL, fixed(0.5, odds + 0.01)).outcome).toBe('notNow')
  })

  it('books about 1 in 3 be-back calls from the player, answered or not', () => {
    const rng = createRng(3)
    let booked = 0
    const n = 4000
    for (let i = 0; i < n; i++) {
      if (callOutcome(p, 'beBack', PLAYER_SKILL, rng).outcome === 'booked') booked++
    }
    expect(booked / n).toBeGreaterThan(0.28)
    expect(booked / n).toBeLessThan(0.4)
  })
})

describe('bookChance', () => {
  const kinds: CallKind[] = ['beBack', 'checkIn']

  it('rises with satisfaction, skill and the level, and never books a thank-you', () => {
    for (const kind of kinds) {
      const low = bookChance(prospect('a', { satisfaction: 30 }), kind, 3)
      const high = bookChance(prospect('a', { satisfaction: 80 }), kind, 3)
      expect(high).toBeGreaterThan(low)
      const p = prospect('a')
      expect(bookChance(p, kind, 5)).toBeGreaterThan(bookChance(p, kind, 1))
      expect(bookChance(p, kind, 3, 1.2)).toBeGreaterThan(bookChance(p, kind, 3, 0.8))
    }
    expect(bookChance(person('t'), 'thanks', 5)).toBe(0)
  })

  it("calls at a receptionist's skill below the player's, and slower the greener", () => {
    expect(callSkill(MAX_SKILL)).toBeLessThan(PLAYER_SKILL)
    expect(callSkill(MIN_SKILL)).toBe(MIN_SKILL)
    expect(receptionCallTime(MIN_SKILL)).toBe(1.5)
    expect(receptionCallTime(MAX_SKILL)).toBe(1)
  })
})

describe('applyCall', () => {
  const book = [prospect('p'), person('t', { car: boughtOn(DAY) })]

  it('changes nothing when nobody answers', () => {
    expect(applyCall(book, 'p', 'beBack', { outcome: 'noAnswer', change: 0 }, DAY, 0)).toBe(book)
  })

  it('logs the call, moves satisfaction, and books a booking for tomorrow', () => {
    const booked = applyCall(book, 'p', 'beBack', { outcome: 'booked', change: 0 }, DAY, 630)
    expect(booked[0]).toMatchObject({
      lastCall: DAY,
      callsThisCycle: 1,
      appointment: { day: DAY + 1, minute: 630, reason: 'beBack' },
    })
    const thanked = applyCall(book, 't', 'thanks', { outcome: 'thanked', change: 5 }, DAY, 0)
    expect(thanked[1]).toMatchObject({ satisfaction: 80, callsThisCycle: 1, appointment: null })
    expect(thanked[0]).toBe(book[0])
  })

  it('keeps satisfaction within 0–100', () => {
    const sore = [prospect('p', { satisfaction: 3 })]
    const after = applyCall(sore, 'p', 'beBack', { outcome: 'annoyed', change: -8 }, DAY, 0)
    expect(after[0].satisfaction).toBe(0)
  })
})

describe('appointments', () => {
  it('rolls a time on the half hour within the window', () => {
    const rng = createRng(9)
    for (let i = 0; i < 50; i++) {
      const m = appointmentMinute(rng)
      expect(m % 30).toBe(0)
      expect(m).toBeGreaterThanOrEqual(APPOINTMENT_WINDOW.from)
      expect(m).toBeLessThanOrEqual(APPOINTMENT_WINDOW.to)
    }
  })

  const at = (minute: number, day = DAY) => ({ day, minute, reason: 'beBack' as const })
  const book = [
    prospect('late', { name: 'Sam K.', appointment: at(840) }),
    prospect('early', { name: 'Alex B.', appointment: at(630) }),
    prospect('tomorrow', { appointment: at(600, DAY + 1) }),
    prospect('none'),
  ]

  it('plans the day by minute, the same each time, and nothing from an empty book', () => {
    const plan = planClientVisits(book, DAY, createRng(DAY), 2)
    expect(plan).toEqual([
      { clientId: 'early', minute: 630, reason: 'appointment' },
      { clientId: 'late', minute: 840, reason: 'appointment' },
    ])
    expect(planClientVisits(book, DAY, createRng(DAY))).toEqual(
      planClientVisits(book, DAY, createRng(DAY)),
    )
    const rng = createRng(1)
    const before = createRng(1).next()
    expect(planClientVisits([], DAY, rng)).toEqual([])
    expect(rng.next()).toBe(before)
  })

  it('leaves out a no-show', () => {
    expect(planClientVisits(book, DAY, fixed(0.99))).toEqual([])
  })

  it('releases visits as their time comes', () => {
    const plan = planClientVisits(book, DAY, fixed(0))
    expect(takeDueClients(plan, 600)).toEqual({ due: [], rest: plan })
    expect(takeDueClients(plan, 630)).toEqual({ due: [plan[0]], rest: [plan[1]] })
  })

  it('lists the day for the morning notice', () => {
    expect(appointmentsOn(book, DAY).map((c) => c.id)).toEqual(['early', 'late'])
    expect(appointmentsNotice(book, DAY)).toBe(
      '2 appointments today: Alex B. at 10:30 AM, Sam K. at 2:00 PM.',
    )
    expect(appointmentsNotice(book, DAY + 2)).toBeNull()
  })

  it('keeps an expired prospect booked to come in, until their day', () => {
    const due = prospect('due', { expires: DAY, appointment: at(600, DAY + 1) })
    expect(pruneBook([due], DAY + 1)).toEqual([due])
    expect(pruneBook([due], DAY + 2)).toEqual([])
  })

  it('drops appointments from earlier days in the morning', () => {
    const pruned = pruneBook(book, DAY + 1)
    expect(pruned.find((c) => c.id === 'late')!.appointment).toBeNull()
    expect(pruned.find((c) => c.id === 'tomorrow')!.appointment).toEqual(at(600, DAY + 1))
  })

  it('weighs a wait twice for someone who came on an appointment', () => {
    const inventory = buildInventory(createRng(42))
    const waited = (c: Client) => ({
      ...generateCustomer('c1', [], createRng(1), { client: c }),
      patience: 60,
      patienceLeft: 30,
      phase: 'leaving' as const,
      leaveReason: 'refused' as const,
      sellerId: 'player',
    })
    const score = (c: Client) =>
      recordClients([c], emptyClientStats(), [], [waited(c)], {
        inventory,
        day: DAY,
        shift: 0,
        rng: createRng(1),
      }).stats.scores[0].score
    const walkIn = prospect('w')
    expect(score({ ...walkIn, appointment: at(600) })).toBeLessThan(score(walkIn))
  })
})

describe('be-backs', () => {
  it('come back hoping to pay about their last counter', () => {
    const counter = 23_000
    const c = generateCustomer('c1', [], createRng(1), {
      client: prospect('p', { lastDeal: { model: 'sedan', ask: 25_000, counter } }),
    })
    expect(c.expect).toBe(beBackExpect('sedan', counter))
    expect(BASE_MSRP.sedan * (1 - c.expect)).toBeCloseTo(counter, -2)
  })

  it('hope for no more than MAX_BE_BACK_EXPECT off, and nothing off over the sticker', () => {
    expect(beBackExpect('sedan', 1_000)).toBe(MAX_BE_BACK_EXPECT)
    expect(beBackExpect('sedan', BASE_MSRP.sedan + 1_000)).toBe(0)
  })
})

describe('trade-ups (16d)', () => {
  const due = (id: string, extra: Partial<Client> = {}) =>
    person(id, { car: boughtOn(1), dueDay: DAY, ...extra })

  it('calls a due client to trade up, ahead of be-backs', () => {
    expect(callKind(due('d'), DAY)).toBe('tradeUp')
    expect(callKind(due('d', { satisfaction: 30 }), DAY)).toBe('tradeUp')
    expect(callKind(due('d'), DAY - 1)).toBeNull()
    const list = callList([prospect('p', { satisfaction: 90 }), due('d')], DAY)
    expect(list.map((e) => [e.client.id, e.kind])).toEqual([
      ['d', 'tradeUp'],
      ['p', 'beBack'],
    ])
    expect(bookChance(due('d'), 'tradeUp', 3)).toBeGreaterThan(
      bookChance(prospect('p'), 'beBack', 3),
    )
  })

  it('books a trade-up appointment', () => {
    const book = applyCall([due('d')], 'd', 'tradeUp', { outcome: 'booked', change: 0 }, DAY, 660)
    expect(book[0].appointment).toEqual({ day: DAY + 1, minute: 660, reason: 'tradeUp' })
  })

  it('brings due clients in on their own, the likelier the happier', () => {
    const book = [due('d')]
    const plan = planClientVisits(book, DAY, fixed(0))
    expect(plan).toEqual([{ clientId: 'd', minute: RETURN_WINDOW.from, reason: 'return' }])
    expect(planClientVisits(book, DAY, fixed(0.99))).toEqual([])
    // Not yet due, or waiting on an appointment another day: nothing rolled.
    expect(planClientVisits(book, DAY - 1, fixed(0))).toEqual([])
    const booked = due('d', { appointment: { day: DAY + 1, minute: 600, reason: 'tradeUp' } })
    expect(planClientVisits([booked], DAY, fixed(0))).toEqual([])
    expect(returnChance(due('a', { satisfaction: 90 }))).toBeGreaterThan(returnChance(due('b')))
    expect(returnChance(due('b', { satisfaction: 30 }))).toBeLessThan(returnChance(due('b')))
  })

  it('rolls returns per day, the same each time', () => {
    const book = Array.from({ length: 40 }, (_, i) => due(`d${i}`))
    const a = planClientVisits(book, DAY, createRng(DAY))
    expect(a).toEqual(planClientVisits(book, DAY, createRng(DAY)))
    for (const v of a) {
      expect(v.minute).toBeGreaterThanOrEqual(RETURN_WINDOW.from)
      expect(v.minute).toBeLessThanOrEqual(RETURN_WINDOW.to)
      expect(v.minute % 5).toBe(0)
    }
  })

  it('meets the trade-up targets over the lapse window', () => {
    // Chance of coming back on their own before they lapse.
    const back = (satisfaction: number, discount: 0 | 0.02 | 0.04 = 0) =>
      1 - (1 - returnChance(due('x', { satisfaction }), discount)) ** LAPSE_DAYS
    expect(back(75)).toBeGreaterThan(0.5)
    expect(back(75)).toBeLessThan(0.7)
    expect(back(40)).toBeGreaterThan(0.1)
    expect(back(40)).toBeLessThan(0.3)
    expect(returnChance(due('x'), 0.02)).toBeCloseTo(returnChance(due('x')) * 1.2)
    expect(returnChance(due('x'), 0.04)).toBeCloseTo(returnChance(due('x')) * 1.4)
  })

  it('words a trade-up turned down', () => {
    expect(callLine('Kim', 'tradeUp', { outcome: 'notNow', change: 0 }, 600)).toContain('my car')
  })
})
