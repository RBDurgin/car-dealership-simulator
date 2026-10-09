import { describe, expect, it } from 'vitest'
import { calendarOf } from './calendar'
import type { Sale } from './deal'
import {
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
  rivalDay,
  rivalMorning,
  rivalNotice,
  SHARE_DAYS,
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
