import { describe, expect, it } from 'vitest'
import { calendarOf } from './calendar'
import type { Sale } from './deal'
import { generateCustomer, type Customer } from './customers'
import { BASE_MSRP, buildInventory } from './inventory'
import {
  assignQuotes,
  emptyRival,
  emptyRivalStats,
  isRival,
  LOST_STRENGTH,
  marketShare,
  MATCHED_STRENGTH,
  MAX_SHARE,
  NOTICE_DAYS,
  OPEN_STRENGTH,
  openingDay,
  PIVOT_SHARE,
  RIVAL_NAMES,
  bannerText,
  rivalDay,
  rivalMorning,
  rivalNotice,
  rivalPrice,
  SHARE_DAYS,
  shareLine,
  activeMove,
  BLITZ_CUT,
  blitzScale,
  desperation,
  DESPERATE_SCALE,
  HIRE_STRENGTH,
  planRivalWeek,
  PRICE_WAR_UNDERCUT,
  rivalHired,
  rivalStole,
  sabotageScale,
  STOLEN_KEPT,
  undercutOf,
  type RivalMoveId,
  weekChange,
  WEEKS_KEPT,
  shouldAnnounce,
  START_DISCOUNT,
  type Rival,
} from './rival'
import { createRng } from './rng'

const open = (extra: Partial<Rival> = {}): Rival => ({
  ...emptyRival(),
  status: 'open',
  generation: 1,
  openDay: 22,
  strength: OPEN_STRENGTH,
  undercut: 0.04,
  ...extra,
})

const sale = (price: number, msrp: number, used = false): Sale => ({
  customerName: 'Pat',
  carId: 'c',
  model: 'sedan',
  price,
  msrp,
  cost: msrp * 0.88,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
  ...(used && { used: true }),
})

const us = { reputation: 50, campaigns: 0 }

describe('announcing and opening', () => {
  it('starts unopened, under his first name', () => {
    expect(emptyRival()).toMatchObject({ status: 'unopened', name: RIVAL_NAMES[0], generation: 0 })
    expect(isRival(emptyRival())).toBe(true)
  })

  it('announces from Main Street, and only once', () => {
    expect(shouldAnnounce('corner-lot', emptyRival())).toBe(false)
    expect(shouldAnnounce('main-street', emptyRival())).toBe(true)
    expect(shouldAnnounce('regional-name', emptyRival())).toBe(true)
    expect(shouldAnnounce('main-street', { ...emptyRival(), status: 'announced' })).toBe(false)
    expect(shouldAnnounce('main-street', open())).toBe(false)
  })

  it('opens on the first Monday at least a week off', () => {
    for (let day = 1; day <= 30; day++) {
      const d = openingDay(day)
      expect(calendarOf(d).weekday).toBe(0)
      expect(d - day).toBeGreaterThanOrEqual(NOTICE_DAYS)
      expect(d - day).toBeLessThan(NOTICE_DAYS * 2)
    }
  })

  it('announces in the morning, then opens on his day at the level’s strength', () => {
    const announced = rivalMorning(emptyRival(), 15, 'main-street')
    expect(announced.event).toBe('announced')
    expect(announced.rival).toMatchObject({ status: 'announced', openDay: openingDay(15) })
    expect(rivalNotice(announced.rival, 'announced')).toMatch(
      /Nazma's Motors opens there on Monday, week \d of /,
    )

    const waiting = rivalMorning(announced.rival, openingDay(15) - 1, 'main-street')
    expect(waiting).toEqual({ rival: announced.rival, event: null })

    const opened = rivalMorning(announced.rival, openingDay(15), 'main-street', 1.25)
    expect(opened.event).toBe('opened')
    expect(opened.rival).toMatchObject({
      status: 'open',
      generation: 1,
      name: RIVAL_NAMES[0],
      strength: OPEN_STRENGTH * 1.25,
    })
    expect(opened.rival.undercut).toBeGreaterThan(0)
    expect(rivalNotice(opened.rival, 'opened')).toMatch(/opened across the road/)
    expect(rivalMorning(opened.rival, openingDay(15) + 1, 'main-street').event).toBeNull()
  })

  it('does nothing before Main Street', () => {
    expect(rivalMorning(emptyRival(), 15, 'corner-lot')).toEqual({
      rival: emptyRival(),
      event: null,
    })
  })
})

describe('the weekly report', () => {
  // Day 29 is a Monday.
  const monday = 29

  it('averages last week’s shares on a Monday while he’s open', () => {
    const rival = open({ shares: [0.1, 0.2, 0.3], weeks: [0.15] })
    const { rival: next, event } = rivalMorning(rival, monday, 'main-street')
    expect(event).toBe('week')
    expect(next.weeks).toHaveLength(2)
    expect(next.weeks[1]).toBeCloseTo(0.2)
    expect(rivalNotice(next, 'week')).toMatch(
      /^Nazma's Motors took 20% \(↑5\) of the town's buyers last week\. This week: /,
    )
  })

  it('keeps only the last weeks', () => {
    const weeks = Array.from({ length: WEEKS_KEPT }, (_, i) => i / 100)
    const next = rivalMorning(open({ shares: [0.3], weeks }), monday, 'main-street').rival
    expect(next.weeks).toHaveLength(WEEKS_KEPT)
    expect(next.weeks[WEEKS_KEPT - 1]).toBe(0.3)
  })

  it('has nothing to report on other days, before any share, or unless open', () => {
    expect(rivalMorning(open({ shares: [0.2] }), monday + 1, 'main-street').event).toBeNull()
    expect(rivalMorning(open(), monday, 'main-street').event).toBeNull()
    const closed = { ...open({ shares: [0.2] }), status: 'closed' as const }
    expect(rivalMorning(closed, monday, 'main-street').event).toBeNull()
  })

  it('says how the share moved', () => {
    expect(weekChange([0.2])).toBeNull()
    expect(weekChange([0.2, 0.17])).toBe(-3)
    expect(shareLine(0.2, null)).toBe('20%')
    expect(shareLine(0.2, 3)).toBe('20% (↑3)')
    expect(shareLine(0.17, -3)).toBe('17% (↓3)')
    expect(shareLine(0.17, 0)).toBe('17% (no change)')
  })
})

describe('his prices and banner', () => {
  it('takes his undercut off the sticker, to the nearest hundred', () => {
    expect(rivalPrice(open({ undercut: 0.04 }), 32_500)).toBe(31_200)
    expect(rivalPrice(open({ undercut: 0 }), 32_500)).toBe(32_500)
  })

  it('advertises his cut while open', () => {
    expect(bannerText(open({ undercut: 0.04 }), 29)).toBe('4% UNDER MSRP!')
    expect(bannerText({ ...open(), status: 'announced' }, 29)).toBe('OPENING SOON')
    expect(bannerText({ ...open(), status: 'closed' }, 29)).toBe('CLOSED')
  })

  it('advertises the week’s move', () => {
    const war = open({ undercut: 0.04, move: { id: 'priceWar', from: 29 } })
    expect(bannerText(war, 29)).toBe('PRICE WAR! 7% OFF')
    const sale = open({ move: { id: 'saleWeekend', from: 29 } })
    expect(bannerText(sale, 29)).toBe('SALE THIS WEEKEND')
    expect(bannerText(sale, 33)).toBe('SALE WEEKEND!')
    expect(bannerText(open({ move: { id: 'adBlitz', from: 29 } }), 29)).toBe('AS SEEN ON TV!')
  })
})

describe('marketShare', () => {
  it('is nothing unless he is open', () => {
    expect(marketShare(emptyRival(), us)).toBe(0)
    expect(marketShare({ ...open(), status: 'announced' }, us)).toBe(0)
  })

  it('stays within bounds', () => {
    for (const strength of [0, 50, 100]) {
      for (const reputation of [0, 50, 100]) {
        for (const campaigns of [0, 5]) {
          const share = marketShare(open({ strength, undercut: 0.2, ourDiscount: 0 }), {
            reputation,
            campaigns,
          })
          expect(share).toBeGreaterThan(0)
          expect(share).toBeLessThanOrEqual(MAX_SHARE)
        }
      }
    }
  })

  it('rises with his strength and his undercut', () => {
    expect(marketShare(open({ strength: 70 }), us)).toBeGreaterThan(marketShare(open(), us))
    expect(marketShare(open({ undercut: 0.08 }), us)).toBeGreaterThan(marketShare(open(), us))
    expect(marketShare(open({ ourDiscount: 0.08 }), us)).toBeLessThan(marketShare(open(), us))
  })

  it('falls as reputation rises and with ads running', () => {
    const share = (reputation: number, campaigns = 0) =>
      marketShare(open(), { reputation, campaigns })
    expect(share(70)).toBeLessThan(share(50))
    expect(share(90)).toBeLessThan(share(70))
    expect(share(50, 1)).toBeLessThan(share(50))
    // Ads past a few stop helping.
    expect(share(50, 6)).toBe(share(50, 3))
  })

  it('hits the tuning targets', () => {
    // On opening, around Main Street's reputation: 10–20%.
    const opening = marketShare(open(), { reputation: 50, campaigns: 0 })
    expect(opening).toBeGreaterThan(0.1)
    expect(opening).toBeLessThan(0.2)
    // A strong rival against a neglected dealership tops out near the cap.
    expect(marketShare(open({ strength: 100 }), { reputation: 30, campaigns: 0 })).toBeGreaterThan(
      0.28,
    )
    // A good name and steady ads squeeze him under 8%.
    expect(marketShare(open(), { reputation: 78, campaigns: 2 })).toBeLessThan(0.08)
  })
})

describe('rivalDay', () => {
  const rng = () => createRng(1)
  const day = (share: number, lost = 0, matched = 0, sales: Sale[] = []) => ({
    sales,
    rival: { ...emptyRivalStats(share), lost, matched },
  })

  it('records the share, keeping a week', () => {
    let r = open()
    for (let i = 1; i <= 9; i++) r = rivalDay(r, day(i / 100), rng())
    expect(r.shares).toHaveLength(SHARE_DAYS)
    expect(r.shares[SHARE_DAYS - 1]).toBe(0.09)
    expect(r.shares[0]).toBe(0.03)
  })

  it('grows on a big share and shrinks on a small one', () => {
    expect(rivalDay(open(), day(0.3), rng()).strength).toBeGreaterThan(OPEN_STRENGTH)
    expect(rivalDay(open(), day(0.02), rng()).strength).toBeLessThan(OPEN_STRENGTH)
    const near = rivalDay(open(), day(PIVOT_SHARE), rng()).strength
    expect(Math.abs(near - OPEN_STRENGTH)).toBeLessThanOrEqual(0.5)
  })

  it('grows with buyers who walked out to him and shrinks with those matched', () => {
    const base = rivalDay(open(), day(0.15), rng()).strength
    expect(rivalDay(open(), day(0.15, 2), rng()).strength).toBeCloseTo(base + 2 * LOST_STRENGTH)
    expect(rivalDay(open(), day(0.15, 0, 2), rng()).strength).toBeCloseTo(
      base - 2 * MATCHED_STRENGTH,
    )
  })

  it('grows faster at a higher level, but shrinks the same', () => {
    const grow = (g: number) => rivalDay(open(), day(0.3), createRng(5), g).strength - OPEN_STRENGTH
    const shrink = (g: number) => rivalDay(open(), day(0), createRng(5), g).strength
    expect(grow(1.25)).toBeGreaterThan(grow(1))
    expect(shrink(1.25)).toBe(shrink(1))
  })

  it('keeps strength between 0 and 100', () => {
    expect(rivalDay(open({ strength: 99.9 }), day(0.35, 10), rng()).strength).toBe(100)
    expect(rivalDay(open({ strength: 0.1 }), day(0, 0, 10), rng()).strength).toBe(0)
  })

  it('follows the player’s discount on new cars, whether or not he is open', () => {
    const r = rivalDay(emptyRival(), { sales: [sale(27_000, 30_000)], rival: null }, rng())
    expect(r.ourDiscount).toBeGreaterThan(START_DISCOUNT)
    expect(r.status).toBe('unopened')
    expect(r.shares).toEqual([])
    const used = rivalDay(emptyRival(), { sales: [sale(9_000, 15_000, true)], rival: null }, rng())
    expect(used.ourDiscount).toBe(START_DISCOUNT)
    const sticker = rivalDay(emptyRival(), { sales: [sale(30_000, 30_000)], rival: null }, rng())
    expect(sticker.ourDiscount).toBeLessThan(START_DISCOUNT)
  })

  it('is the same for the same day', () => {
    expect(rivalDay(open(), day(0.2), createRng(9))).toEqual(
      rivalDay(open(), day(0.2), createRng(9)),
    )
  })
})

describe('assignQuotes', () => {
  const stock = buildInventory(createRng(42))
  const shoppers = Array.from({ length: 400 }, (_, i) =>
    generateCustomer(`c${i}`, stock, createRng(i), { archetype: 'regular' }),
  )

  it('gives about his share of shoppers his price on a model they want', () => {
    const rival = open({ undercut: 0.05 })
    const out = assignQuotes(shoppers, rival, 0.2, createRng(1))
    const quoted = out.filter((c) => c.rivalQuote)
    expect(quoted.length / out.length).toBeGreaterThan(0.14)
    expect(quoted.length / out.length).toBeLessThan(0.26)
    for (const c of quoted) {
      const { model, price } = c.rivalQuote!
      expect(c.preferredModels).toContain(model)
      expect(price).toBe(rivalPrice(rival, BASE_MSRP[model]))
      expect(price % 100).toBe(0)
    }
  })

  it('never quotes used-car shoppers or sellers', () => {
    const others: Customer[] = shoppers.map((c, i) =>
      i % 2
        ? { ...c, archetype: 'used-shopper' }
        : {
            ...c,
            selling: {
              hope: 9_000,
              estimate: { estimate: 8_000, margin: 1_000 },
              appraised: false,
            },
          },
    )
    const out = assignQuotes(others, open(), 0.35, createRng(1))
    expect(out.some((c) => c.rivalQuote)).toBe(false)
  })

  it('quotes nobody unless he is open', () => {
    for (const status of ['unopened', 'announced', 'closed'] as const) {
      const out = assignQuotes(shoppers, open({ status }), 0.3, createRng(1))
      expect(out.some((c) => c.rivalQuote)).toBe(false)
    }
  })

  it('opens with the level’s undercut', () => {
    const announced = { ...emptyRival(), status: 'announced' as const, openDay: 22 }
    const easy = rivalMorning(announced, 22, 'main-street', 1, 0.8).rival
    const medium = rivalMorning(announced, 22, 'main-street').rival
    expect(easy.undercut).toBeCloseTo(medium.undercut * 0.8)
  })
})

describe('his weekly moves', () => {
  // Day 29 is a Monday.
  const monday = 29

  it('picks a move on his opening day and each Monday, and keeps it through the week', () => {
    const announced = { ...emptyRival(), status: 'announced' as const, openDay: monday }
    const opened = rivalMorning(announced, monday, 'main-street').rival
    expect(opened.move).toEqual({ id: expect.any(String), from: monday })
    const tuesday = rivalMorning(opened, monday + 1, 'main-street').rival
    expect(tuesday.move).toEqual(opened.move)
    const next = rivalMorning({ ...opened, shares: [0.2] }, monday + 7, 'main-street').rival
    expect(next.move?.from).toBe(monday + 7)
  })

  it('is the same week plan for the same state', () => {
    for (let week = 0; week < 20; week++) {
      const day = monday + week * 7
      expect(planRivalWeek(open(), day)).toEqual(planRivalWeek(open(), day))
    }
  })

  it('plays every move, more price wars when desperate', () => {
    const count = (rival: Rival, id: RivalMoveId) =>
      Array.from({ length: 400 }, (_, i) => planRivalWeek(rival, monday + i * 7)).filter(
        (m) => m.id === id,
      ).length
    const calm = open({ shares: [0.25] })
    const desperate = open({ shares: [0.03] })
    for (const id of ['priceWar', 'adBlitz', 'saleWeekend', 'quiet'] as const) {
      expect(count(calm, id)).toBeGreaterThan(0)
    }
    expect(count(desperate, 'priceWar')).toBeGreaterThan(count(calm, 'priceWar'))
    expect(count(desperate, 'quiet')).toBeLessThan(count(calm, 'quiet'))
  })

  it('lands his sale weekend on the player’s sale weekends more often', () => {
    // Memorial Day: May (month 4), week 4. Its Monday is 4 × 28 + 3 × 7 + 1.
    const eventMonday = 4 * 28 + 21 + 1
    const plainMonday = eventMonday - 7
    const sales = (day: number) =>
      Array.from({ length: 200 }, (_, g) => planRivalWeek(open({ generation: g }), day)).filter(
        (m) => m.id === 'saleWeekend',
      ).length
    expect(sales(eventMonday)).toBeGreaterThan(sales(plainMonday) * 2)
  })

  it('deepens his undercut in a price war', () => {
    const war = open({ undercut: 0.04, move: { id: 'priceWar', from: monday } })
    expect(undercutOf(war)).toBeCloseTo(0.04 + PRICE_WAR_UNDERCUT)
    expect(rivalPrice(war, 32_500)).toBeLessThan(rivalPrice(open({ undercut: 0.04 }), 32_500))
    expect(marketShare(war, us)).toBeGreaterThan(marketShare(open({ undercut: 0.04 }), us))
  })

  it('cuts the player’s ad traffic in an ad blitz', () => {
    expect(blitzScale(open({ move: { id: 'adBlitz', from: monday } }))).toBe(1 - BLITZ_CUT)
    expect(blitzScale(open({ move: { id: 'quiet', from: monday } }))).toBe(1)
  })

  it('takes more of the town Friday to Sunday of his sale weekend', () => {
    const sale = open({ move: { id: 'saleWeekend', from: monday } })
    const share = (day: number) => marketShare(sale, { ...us, day })
    expect(share(monday + 4)).toBeGreaterThan(share(monday + 3))
    expect(share(monday + 6)).toBeGreaterThan(share(monday))
    expect(share(monday)).toBeCloseTo(marketShare(open(), us))
  })

  it('makes no move unless open', () => {
    const closed = {
      ...open({ move: { id: 'priceWar', from: monday } }),
      status: 'closed' as const,
    }
    expect(activeMove(closed)).toBeNull()
    expect(undercutOf(closed)).toBe(closed.undercut)
  })

  it('says the move in the Monday notice', () => {
    const rival = open({ weeks: [0.2], move: { id: 'adBlitz', from: monday } })
    expect(rivalNotice(rival, 'week')).toMatch(/This week: an ad blitz/)
  })
})

describe('desperation', () => {
  it('is calm with a good share, before any share, and unless open', () => {
    expect(desperation(open({ shares: [0.25, 0.2] }))).toBe(0)
    expect(desperation(open())).toBe(0)
    expect(desperation({ ...open({ shares: [0.01] }), status: 'closed' })).toBe(0)
  })

  it('rises as his share falls', () => {
    const at = (share: number) => desperation(open({ shares: [share] }))
    expect(at(0.15)).toBeGreaterThan(0)
    expect(at(0.08)).toBeGreaterThan(at(0.15))
    expect(at(0.02)).toBe(1)
  })

  it('scales Nazma’s mischief: as before until he opens, up to double, none while closed', () => {
    expect(sabotageScale(emptyRival())).toBe(1)
    expect(sabotageScale({ ...emptyRival(), status: 'announced' })).toBe(1)
    expect(sabotageScale(open({ shares: [0.25] }))).toBe(1)
    expect(sabotageScale(open({ shares: [0.02] }))).toBe(DESPERATE_SCALE)
    expect(sabotageScale({ ...open(), status: 'closed' })).toBe(0)
  })
})

describe('his stolen cars and hires', () => {
  it('puts a stolen car on his lot while he’s open, keeping the latest', () => {
    expect(rivalStole(emptyRival(), 'truck')).toEqual(emptyRival())
    let rival = open()
    for (let i = 0; i < STOLEN_KEPT + 2; i++) rival = rivalStole(rival, i === 0 ? 'van' : 'truck')
    expect(rival.stolen).toHaveLength(STOLEN_KEPT)
    expect(rival.stolen).not.toContain('van')
  })

  it('hires those who quit, and grows with their skill', () => {
    const rival = rivalHired(open({ strength: 40 }), [{ name: 'Dana K.', skill: 4 }], 1.25)
    expect(rival.hires).toEqual(['Dana K.'])
    expect(rival.strength).toBeCloseTo(40 + 4 * HIRE_STRENGTH * 1.25)
    expect(rivalHired(emptyRival(), [{ name: 'Dana K.', skill: 4 }])).toEqual(emptyRival())
  })
})
