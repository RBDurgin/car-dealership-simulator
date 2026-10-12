import { describe, expect, it } from 'vitest'
import { ARCHETYPES, type Archetype } from './archetypes'
import { generateCustomer, PLAYER_ID, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import { createRng } from './rng'
import {
  assignDriveAsk,
  CUT_KEEPS,
  DRIVE_BASE,
  DRIVE_BONUS,
  DRIVE_MINUTES,
  drivableCar,
  driveBlocker,
  driveBonus,
  driveBonusFor,
  driveExpect,
  driveMinutes,
  driveScore,
  MAX_EXPECT_CUT,
  newDrive,
  NO_DRIVE_PENALTY,
  playerRiding,
  POINT_SCORE,
  syncCarsOut,
} from './testDrive'

const stock = buildInventory(createRng(42))
const lot = stock.find((c) => c.location === 'lot')!
const display = stock.find((c) => c.location === 'showroom')!
const shopper = (extra: Partial<Customer> = {}): Customer => ({
  ...generateCustomer('customer-1', stock, createRng(1)),
  phase: 'talking',
  handlerId: PLAYER_ID,
  targetCarId: lot.id,
  ...extra,
})
const withStatus = (cars: InventoryCar[], id: string, status: InventoryCar['status']) =>
  cars.map((c) => (c.id === id ? { ...c, status } : c))

describe('drivableCar', () => {
  it('drives a lot car itself', () => {
    expect(drivableCar(shopper(), stock).car?.id).toBe(lot.id)
  })

  it('takes a lot car of the same model for a showroom car, new for new', () => {
    const twin = { ...lot, id: 'twin', model: display.model }
    const used = { ...lot, id: 'used', model: display.model, used: { ...usedInfo } }
    const cars = [display, used, twin]
    expect(drivableCar(shopper({ targetCarId: display.id }), cars).car?.id).toBe('twin')
  })

  it('says why when there is nothing to drive', () => {
    const c = shopper({ targetCarId: display.id })
    expect(drivableCar(c, [display]).reason).toMatch(/no .* on the lot/)
    const out = [display, { ...lot, model: display.model, status: 'out' as const }]
    expect(drivableCar(c, out).reason).toMatch(/out on a drive/)
    expect(drivableCar(shopper(), withStatus(stock, lot.id, 'out')).reason).toMatch(
      /out on a drive/,
    )
    expect(drivableCar(shopper(), withStatus(stock, lot.id, 'recon')).reason).toMatch(/shop/)
    expect(drivableCar(shopper(), withStatus(stock, lot.id, 'sold')).car).toBeUndefined()
  })
})

const usedInfo = { year: 2019, miles: 60_000, condition: 0.5, acquiredDay: 1 }

describe('driveBlocker', () => {
  it('lets a shopper the player is talking to drive once', () => {
    expect(driveBlocker(shopper(), stock)).toBeNull()
    const drive = newDrive(lot.id, PLAYER_ID, 25)
    expect(driveBlocker(shopper({ drive }), stock)).toMatch(/on the way/)
    expect(driveBlocker(shopper({ drive: { ...drive, back: true } }), stock)).toMatch(/had their/)
  })

  it('stops a drive mid-offer, for a seller and outside a conversation', () => {
    expect(driveBlocker(shopper({ phase: 'waiting' }), stock)).toMatch(/busy/)
    expect(driveBlocker(shopper({ offer: { carId: lot.id, price: 1 } }), stock)).toMatch(/busy/)
    const seller = { ...shopper(), selling: {} } as Customer
    expect(driveBlocker(seller, stock)).toMatch(/shopping/)
  })
})

describe('the drive', () => {
  it('lasts 20 to 35 game minutes', () => {
    const rng = createRng(3)
    for (let i = 0; i < 50; i++) {
      const m = driveMinutes(rng)
      expect(m).toBeGreaterThanOrEqual(DRIVE_MINUTES.min)
      expect(m).toBeLessThanOrEqual(DRIVE_MINUTES.max)
    }
  })

  it('scores a base, the talking points and the car, and less cut short', () => {
    const c = shopper()
    const half = { cleanliness: 0.5, used: null }
    expect(driveScore({ points: [], cut: false }, c, half)).toBeCloseTo(DRIVE_BASE)
    expect(driveScore({ points: [], cut: true }, c, half)).toBeCloseTo(DRIVE_BASE * CUT_KEEPS)
    const good = { points: [{ topic: 'power', fit: 'good' as const }], cut: false }
    expect(driveScore(good, c, half)).toBeCloseTo(DRIVE_BASE + POINT_SCORE.good)
    expect(
      driveScore({ points: [], cut: false }, c, { cleanliness: 1, used: null }),
    ).toBeGreaterThan(driveScore({ points: [], cut: false }, c, { cleanliness: 0, used: null }))
    const worn = { cleanliness: 0.5, used: { ...usedInfo, condition: 0.1 } }
    expect(driveScore({ points: [], cut: false }, c, worn)).toBeLessThan(DRIVE_BASE)
    const lots = Array.from({ length: 6 }, () => ({ topic: 't', fit: 'good' as const }))
    expect(driveScore({ points: lots, cut: false }, c, half)).toBe(1)
  })

  it('adds 5 to 15 points to the odds of a yes, by the score and the level', () => {
    expect(driveBonus(0)).toBeCloseTo(DRIVE_BONUS.min)
    expect(driveBonus(1)).toBeCloseTo(DRIVE_BONUS.max)
    expect(driveBonus(0.5, 2)).toBeCloseTo(DRIVE_BONUS.min + DRIVE_BONUS.max)
  })

  it('cuts the discount they hope for by up to a third', () => {
    expect(driveExpect({ expect: 0.06 }, 0)).toBe(0.06)
    expect(driveExpect({ expect: 0.06 }, 1)).toBeCloseTo(0.06 * (1 - MAX_EXPECT_CUT))
  })
})

describe('driveBonusFor', () => {
  it('gives the drive’s bonus once they’re back', () => {
    const drive = { ...newDrive(lot.id, PLAYER_ID, 25), back: true, score: 1 }
    expect(driveBonusFor(shopper({ drive }), stock)).toBeCloseTo(DRIVE_BONUS.max)
    expect(driveBonusFor(shopper({ drive }), stock, 0.5)).toBeCloseTo(DRIVE_BONUS.max / 2)
  })

  it('costs a little with a shopper who wanted a drive there was a car for', () => {
    expect(driveBonusFor(shopper({ wantsDrive: true }), stock)).toBe(-NO_DRIVE_PENALTY)
    expect(driveBonusFor(shopper({ wantsDrive: false }), stock)).toBe(0)
    // Nothing to drive: nobody's to blame.
    const nothing = shopper({ wantsDrive: true, targetCarId: display.id })
    expect(driveBonusFor(nothing, [display])).toBe(0)
  })
})

describe('assignDriveAsk', () => {
  const crowd = (archetype: Archetype, n: number) =>
    Array.from({ length: n }, (_, i) =>
      generateCustomer(`c${i}`, stock, createRng(i), { archetype }),
    )

  it('asks about as often as each archetype’s drive odds', () => {
    for (const a of Object.keys(ARCHETYPES) as Archetype[]) {
      const asked = assignDriveAsk(crowd(a, 2000), createRng(7)).filter((c) => c.wantsDrive)
      expect(asked.length / 2000, a).toBeCloseTo(ARCHETYPES[a].drive, 1)
    }
  })

  it('has tire-kickers and couples ask most, decisive buyers least, about a third in all', () => {
    expect(ARCHETYPES['tire-kicker'].drive).toBeGreaterThan(ARCHETYPES.regular.drive)
    expect(ARCHETYPES.couple.drive).toBeGreaterThan(ARCHETYPES.regular.drive)
    expect(ARCHETYPES.decisive.drive).toBeLessThan(ARCHETYPES.regular.drive)
    const all = Object.values(ARCHETYPES)
    const share =
      all.reduce((s, t) => s + t.weight * t.drive, 0) / all.reduce((s, t) => s + t.weight, 0)
    expect(share).toBeGreaterThan(0.3)
    expect(share).toBeLessThan(0.4)
  })

  it('never has a seller or a service client ask, and draws one roll each', () => {
    let rolls = 0
    const low = {
      next: () => (rolls++, 0),
      int: (a: number) => a,
      pick: <T>(xs: readonly T[]) => xs[0],
    }
    const service = { ...shopper(), service: {} } as Customer
    const selling = { ...shopper(), selling: {} } as Customer
    const out = assignDriveAsk([service, selling, shopper()], low)
    expect(out.map((c) => c.wantsDrive)).toEqual([false, false, true])
    expect(rolls).toBe(3)
  })
})

describe('cars out', () => {
  const drive = newDrive(lot.id, PLAYER_ID, 25)

  it('takes out a car someone is walking to or driving, and brings it back after', () => {
    const out = syncCarsOut(stock, [shopper({ drive })])
    expect(out.find((c) => c.id === lot.id)?.status).toBe('out')
    expect(syncCarsOut(out, [shopper({ drive })])).toBe(out)
    const back = syncCarsOut(out, [shopper({ drive: { ...drive, back: true } })])
    expect(back.find((c) => c.id === lot.id)?.status).toBe('available')
    expect(
      syncCarsOut(out, [shopper({ drive, phase: 'leaving' })]).find((c) => c.id === lot.id)?.status,
    ).toBe('available')
    expect(syncCarsOut(stock, [])).toBe(stock)
  })

  it('knows when the player is out in the car', () => {
    expect(playerRiding([shopper({ drive })])).toBe(false)
    expect(playerRiding([shopper({ drive, phase: 'driving' })])).toBe(true)
    expect(playerRiding([shopper({ drive, phase: 'driving', handlerId: 'emp-1' })])).toBe(false)
  })
})
