import { describe, expect, it } from 'vitest'
import { ARCHETYPES, type Archetype } from './archetypes'
import { generateCustomer, PLAYER_ID, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import { createRng } from './rng'
import {
  assignDriveAsk,
  carsHeld,
  CUT_KEEPS,
  DING_BASE,
  dingChance,
  DRIVE_DIRT,
  DRIVE_MILES,
  driveDirt,
  rollWear,
  staffDriveCar,
  wearCar,
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
  perfectDrive,
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
    const good = { points: [{ topic: 'power' as const, fit: 'good' as const }], cut: false }
    expect(driveScore(good, c, half)).toBeCloseTo(DRIVE_BASE + POINT_SCORE.good)
    expect(
      driveScore({ points: [], cut: false }, c, { cleanliness: 1, used: null }),
    ).toBeGreaterThan(driveScore({ points: [], cut: false }, c, { cleanliness: 0, used: null }))
    const worn = { cleanliness: 0.5, used: { ...usedInfo, condition: 0.1 } }
    expect(driveScore({ points: [], cut: false }, c, worn)).toBeLessThan(DRIVE_BASE)
    const lots = Array.from({ length: 6 }, () => ({
      topic: 'power' as const,
      fit: 'good' as const,
    }))
    expect(driveScore({ points: lots, cut: false }, c, half)).toBe(1)
  })

  it('adds 5 to 15 points to the odds of a yes, by the score and the level', () => {
    expect(driveBonus(0)).toBeCloseTo(DRIVE_BONUS.min)
    expect(driveBonus(1)).toBeCloseTo(DRIVE_BONUS.max)
    expect(driveBonus(0.5, 2)).toBeCloseTo(DRIVE_BONUS.min + DRIVE_BONUS.max)
  })

  it('cuts the discount they hope for by up to half', () => {
    expect(driveExpect({ expect: 0.06 }, 0)).toBe(0.06)
    expect(driveExpect({ expect: 0.06 }, 1)).toBeCloseTo(0.06 * (1 - MAX_EXPECT_CUT))
  })
})

describe('perfectDrive', () => {
  const point = (fit: 'good' | 'ok' | 'poor') => ({ topic: null, fit })
  it('needs every talking point made, and every one a good fit', () => {
    expect(perfectDrive({ points: [point('good'), point('good')] })).toBe(true)
    expect(perfectDrive({ points: [point('good'), point('ok')] })).toBe(false)
    expect(perfectDrive({ points: [point('good')] })).toBe(false)
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

describe('salespeople’s drives', () => {
  const keen = (extra: Partial<Customer> = {}) =>
    shopper({ handlerId: 'emp-1', wantsDrive: true, ...extra })

  it('takes out a shopper who asked, in a car no other drive holds', () => {
    expect(staffDriveCar(keen(), stock)?.id).toBe(lot.id)
    expect(staffDriveCar(keen(), stock, new Set([lot.id]))).toBeNull()
    expect(staffDriveCar(keen({ wantsDrive: false }), stock)).toBeNull()
    expect(staffDriveCar(keen({ phase: 'waiting' }), stock)).toBeNull()
    const had = { ...newDrive(lot.id, 'emp-1', 25), back: true }
    expect(staffDriveCar(keen({ drive: had }), stock)).toBeNull()
  })

  it('knows which cars drives hold', () => {
    const drive = newDrive(lot.id, 'emp-1', 25)
    expect([...carsHeld([keen({ drive })])]).toEqual([lot.id])
    expect(carsHeld([keen({ drive: { ...drive, back: true } })]).size).toBe(0)
  })
})

describe('mud, miles and dings', () => {
  it('muddies the car more in the rain', () => {
    expect(driveDirt('sunny')).toBe(DRIVE_DIRT.dry)
    expect(driveDirt('rain')).toBe(DRIVE_DIRT.rain)
    expect(DRIVE_DIRT.rain).toBeGreaterThan(DRIVE_DIRT.dry)
  })

  it('dings about 1 drive in 30, less with a skilled rider, more in the rain', () => {
    expect(dingChance('emp-1', 3, 'sunny')).toBeCloseTo(DING_BASE)
    expect(DING_BASE).toBeGreaterThan(1 / 40)
    expect(DING_BASE).toBeLessThan(1 / 20)
    expect(dingChance('emp-1', 5, 'sunny')).toBeLessThan(dingChance('emp-1', 1, 'sunny'))
    expect(dingChance(PLAYER_ID, 1, 'sunny')).toBeLessThan(DING_BASE)
    expect(dingChance('emp-1', 3, 'rain')).toBeGreaterThan(DING_BASE)
    expect(dingChance('emp-1', 3, 'sunny', 2)).toBeCloseTo(2 * DING_BASE)
  })

  it('puts miles on a used car only, and rolls a ding now and then', () => {
    const rng = createRng(5)
    let dings = 0
    for (let i = 0; i < 3000; i++) {
      const wear = rollWear(lot, 'emp-1', 3, 'sunny', rng)
      expect(wear.miles).toBe(0)
      if (wear.ding) dings++
    }
    expect(dings / 3000).toBeGreaterThan(DING_BASE * 0.6)
    expect(dings / 3000).toBeLessThan(DING_BASE * 1.4)
    const used = { used: { year: 2020, miles: 40_000, condition: 0.7, acquiredDay: 1 } }
    const miles = rollWear(used, 'emp-1', 3, 'sunny', createRng(1)).miles
    expect(miles).toBeGreaterThanOrEqual(DRIVE_MILES.min)
    expect(miles).toBeLessThanOrEqual(DRIVE_MILES.max)
  })

  it('wears the car: dirtier, more miles, a ding that stays', () => {
    const used = {
      ...lot,
      cleanliness: 0.5,
      used: { year: 2020, miles: 40_000, condition: 0.7, acquiredDay: 1 },
    }
    const [worn] = wearCar([used], used.id, { dirt: 0.15, miles: 12, ding: true })
    expect(worn.cleanliness).toBeCloseTo(0.35)
    expect(worn.used!.miles).toBe(40_012)
    expect(worn.ding).toBe(true)
    const [again] = wearCar([worn], used.id, { dirt: 0.5, miles: 0, ding: false })
    expect(again.cleanliness).toBe(0)
    expect(again.ding).toBe(true)
  })
})
