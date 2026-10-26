import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  achievementNotice,
  achievementsFor,
  BACK_END_GROSS,
  BIG_TICKET_GROSS,
  CLEAN_BOOKS_DEALS,
  ROAD_SALES,
  SCRATCH_FREE_DRIVES,
  TEAM_DRIVES,
  CLOSER_SALES,
  dayAchievements,
  HAPPY_TEAM_DAYS,
  HAPPY_TEAM_SIZE,
  HUDDLES,
  isHappyTeam,
  SIX_FIGURES,
  TEAM_MORALE,
  STAR_SELLER_SALES,
  type AchievementId,
  type AchievementState,
  type DayContext,
  type EarnedAchievement,
} from './achievements'
import { DAYS_PER_MONTH } from './calendar'
import { CAR_MODELS } from './customers'
import type { AuctionBuy } from './auction'
import { emptyStats, type DayStats, type Sale } from './deal'
import { sellerFee } from './wholesale'
import { emptyFiStats, type SaleFi } from './fi'
import { IMPROVEMENTS, type ImprovementId } from './improvements'
import { buildInventory, type InventoryCar } from './inventory'
import { freeSlots, slotPlacement } from './ordering'
import { emptyCareer } from './progression'
import { createRng } from './rng'
import type { Employee } from './staff'
import { emptyLifetime, emptyRecords } from './stats'

const inventory = buildInventory(createRng(42)).map((c) => ({ ...c, cleanliness: 1 }))

const sale = (extra: Partial<Sale> = {}): Sale => ({
  customerName: 'Alex B.',
  carId: inventory[0].id,
  model: 'sedan',
  price: 29_000,
  msrp: 30_000,
  cost: 27_000,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
  ...extra,
})

const employee = (id: string, extra: Partial<Employee> = {}): Employee => ({
  id,
  name: 'Sam T.',
  variant: 'female-e',
  role: 'sales',
  skill: 3,
  wage: 130,
  status: 'atPost',
  fired: false,
  quitting: false,
  xp: 0,
  potential: 5,
  hiredDay: 1,
  raiseAsk: null,
  morale: 70,
  lowDays: 0,
  moraleWhy: [],
  daysOff: [],
  streak: 0,
  training: null,
  trained: false,
  senior: false,
  praisedDay: null,
  monthXp: 0,
  levels: [],
  ...extra,
})

const base: AchievementState = {
  screen: 'playing',
  clock: { day: 5 },
  cash: 20_000,
  inventory,
  roster: [],
  improvements: [],
  expansions: [],
  weather: 'sunny',
  dayStats: emptyStats(),
  career: emptyCareer(),
  lifetime: emptyLifetime(),
  clients: [],
}

const withStats = (s: AchievementState, patch: Partial<DayStats>): AchievementState => ({
  ...s,
  dayStats: { ...s.dayStats, ...patch },
})
/** `prev` with `sales` signed since. */
const selling = (prev: AchievementState, ...sales: Sale[]): AchievementState =>
  withStats(prev, { sales: [...prev.dayStats.sales, ...sales] })

const earns = (prev: AchievementState, next: AchievementState, id: AchievementId) =>
  achievementsFor(prev, next, []).includes(id)

const ctx = (patch: Partial<DayContext> = {}): DayContext => ({
  day: 5,
  stats: { ...emptyStats(), settled: true },
  log: [],
  records: emptyRecords(),
  reputation: 50,
  career: emptyCareer(),
  franchise: 'bronze',
  inventory,
  monthFi: emptyFiStats(),
  ...patch,
})
const dayEarns = (c: DayContext, id: AchievementId) => dayAchievements(c, []).includes(id)

describe('the catalogue', () => {
  it('has unique ids, each with a title, a short text and a group', () => {
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(ACHIEVEMENTS.length)
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30)
    for (const a of ACHIEVEMENTS) {
      expect(a.title).not.toBe('')
      expect(a.text).not.toBe('')
      expect(a.group).toBeTruthy()
      expect(`🏆 ${a.title}: ${a.text}`.length).toBeLessThanOrEqual(80)
    }
  })

  it('has a few hidden ones', () => {
    const hidden = ACHIEVEMENTS.filter((a) => a.hidden)
    expect(hidden.length).toBeGreaterThanOrEqual(2)
    expect(hidden.length).toBeLessThanOrEqual(3)
  })
})

describe('achievementsFor', () => {
  it('does nothing when nothing it reads has changed', () => {
    const rich = { ...base, cash: SIX_FIGURES * 2, dayStats: { ...emptyStats(), sales: [sale()] } }
    expect(achievementsFor(rich, rich, [])).toEqual([])
    expect(achievementsFor(rich, { ...rich, weather: 'rain' }, [])).toEqual([])
  })

  it('does nothing on the title screen or as a game starts from it', () => {
    const next = selling(base, sale())
    expect(achievementsFor({ ...base, screen: 'title' }, next, [])).toEqual([])
    expect(achievementsFor(base, { ...next, screen: 'title' }, [])).toEqual([])
  })

  it('never returns one already earned', () => {
    const next = selling(base, sale({ price: 30_000 }))
    const earned: EarnedAchievement[] = [
      { id: 'first-sale', day: 1, level: 'medium' },
      { id: 'full-sticker', day: 2, level: 'hard' },
    ]
    expect(achievementsFor(base, next, [])).toEqual(
      expect.arrayContaining(['first-sale', 'full-sticker']),
    )
    expect(achievementsFor(base, next, earned)).not.toContain('first-sale')
    expect(achievementsFor(base, next, earned)).not.toContain('full-sticker')
  })

  it('counts lifetime sales from the career and today', () => {
    expect(earns(base, selling(base, sale()), 'first-sale')).toBe(true)
    const nine = { ...base, career: { ...emptyCareer(), sales: 8 } }
    expect(earns(nine, selling(nine, sale()), 'ten-sales')).toBe(false)
    expect(earns(nine, selling(nine, sale(), sale()), 'ten-sales')).toBe(true)
    // Once settled, today's sales are in the career already.
    const settled = withStats(
      { ...base, career: { ...emptyCareer(), sales: 9 } },
      {
        settled: true,
        sales: [sale()],
      },
    )
    expect(earns(settled, selling(settled, sale()), 'ten-sales')).toBe(false)
  })

  it('takes a new car at full MSRP as Full Sticker, not a dollar under or a used one', () => {
    expect(earns(base, selling(base, sale({ price: 30_000 })), 'full-sticker')).toBe(true)
    expect(earns(base, selling(base, sale({ price: 29_999 })), 'full-sticker')).toBe(false)
    expect(earns(base, selling(base, sale({ price: 30_000, used: true })), 'full-sticker')).toBe(
      false,
    )
  })

  it('looks only at sales since the last change', () => {
    const sold = selling(base, sale({ price: 30_000 }))
    expect(earns(sold, selling(sold, sale()), 'full-sticker')).toBe(false)
  })

  it(`makes ${CLOSER_SALES} sales in a day a Closer, not one fewer`, () => {
    const four = withStats(base, { sales: Array.from({ length: CLOSER_SALES - 2 }, () => sale()) })
    expect(earns(four, selling(four, sale()), 'closer')).toBe(false)
    expect(earns(four, selling(four, sale(), sale()), 'closer')).toBe(true)
  })

  it('marks a deal closed on the last round as Patient', () => {
    expect(earns(base, selling(base, sale({ lastRound: true })), 'patient')).toBe(true)
    expect(earns(base, selling(base, sale()), 'patient')).toBe(false)
  })

  it(`takes $${BIG_TICKET_GROSS} gross on one sale as a Big Ticket`, () => {
    const big = sale({ price: 32_000, cost: 32_000 - BIG_TICKET_GROSS })
    expect(earns(base, selling(base, big), 'big-ticket')).toBe(true)
    expect(earns(base, selling(base, { ...big, price: big.price - 1 }), 'big-ticket')).toBe(false)
  })

  it('needs every model, from the career and today', () => {
    const [last, ...rest] = CAR_MODELS
    const soldByModel = Object.fromEntries(rest.map((m) => [m, 1]))
    const almost = { ...base, career: { ...emptyCareer(), soldByModel } }
    expect(earns(almost, selling(almost, sale({ model: rest[0] })), 'every-model')).toBe(false)
    expect(earns(almost, selling(almost, sale({ model: last })), 'every-model')).toBe(true)
  })

  it('needs a sale from every ad channel', () => {
    const almost = {
      ...base,
      lifetime: { ...emptyLifetime(), bySource: { newspaper: 1, radio: 2, tv: 1, online: 1 } },
    }
    expect(earns(almost, selling(almost, sale({ source: 'walk-in' })), 'ad-man')).toBe(false)
    expect(earns(almost, selling(almost, sale({ source: 'classifieds' })), 'ad-man')).toBe(true)
  })

  it(`reaches Six Figures at $${SIX_FIGURES}`, () => {
    expect(earns(base, { ...base, cash: SIX_FIGURES - 1 }, 'six-figures')).toBe(false)
    expect(earns(base, { ...base, cash: SIX_FIGURES }, 'six-figures')).toBe(true)
  })

  it('opens Fully Loaded on a morning with no free space', () => {
    const free = freeSlots(inventory, [])
    const fill: InventoryCar[] = free.map((slot, i) => ({
      ...inventory[0],
      id: `fill-${i}`,
      status: 'available',
      rect: slotPlacement(slot).rect,
    }))
    const full = { ...base, clock: { day: 6 }, inventory: [...inventory, ...fill] }
    expect(earns(base, full, 'fully-loaded')).toBe(true)
    expect(
      earns(base, { ...full, inventory: [...inventory, ...fill.slice(1)] }, 'fully-loaded'),
    ).toBe(false)
    // Only at opening, not as the day goes on.
    expect(earns({ ...base, clock: { day: 6 } }, full, 'fully-loaded')).toBe(false)
  })

  it('takes hires and a full house of roles', () => {
    expect(earns(base, { ...base, roster: [employee('s1')] }, 'first-hire')).toBe(true)
    const all = [
      employee('s1'),
      employee('r1', { role: 'receptionist' }),
      employee('f1', { role: 'finance' }),
      employee('p1', { role: 'porter' }),
    ]
    expect(earns(base, { ...base, roster: all }, 'full-house')).toBe(false)
    const guard = employee('g1', { role: 'security' })
    expect(earns(base, { ...base, roster: [...all, guard] }, 'full-house')).toBe(true)
    // Someone let go doesn't count.
    expect(
      earns(base, { ...base, roster: [...all, { ...guard, fired: true }] }, 'full-house'),
    ).toBe(false)
  })

  it(`makes a salesperson with ${STAR_SELLER_SALES} sales a Star Seller`, () => {
    const almost = {
      ...base,
      roster: [employee('s1')],
      lifetime: {
        ...emptyLifetime(),
        bySeller: { s1: { sales: STAR_SELLER_SALES - 1, gross: 0 } },
      },
    }
    expect(earns(almost, selling(almost, sale()), 'star-seller')).toBe(false)
    expect(
      earns(almost, selling(almost, sale({ soldBy: 'Sam T.', sellerId: 's1' })), 'star-seller'),
    ).toBe(true)
  })

  it('reads Nazma run off, by whom, and an employee kept', () => {
    const nazma = (patch: Partial<DayStats['nazma']>) =>
      withStats(base, { nazma: { ...base.dayStats.nazma, ...patch } })
    expect(earns(base, nazma({ runOff: 'player' }), 'not-on-my-lot')).toBe(true)
    expect(earns(base, nazma({ runOff: 'player' }), 'guard-dog')).toBe(false)
    expect(earns(base, nazma({ runOff: 'guard' }), 'guard-dog')).toBe(true)
    expect(earns(base, nazma({ kept: [{ name: 'Sam T.', raise: 50 }] }), 'loyal')).toBe(true)
  })

  it('needs three sales on a rainy day', () => {
    const rainy = withStats({ ...base, weather: 'rain' }, { sales: [sale()] })
    expect(earns(rainy, selling(rainy, sale()), 'rain-or-shine')).toBe(false)
    expect(earns(rainy, selling(rainy, sale(), sale()), 'rain-or-shine')).toBe(true)
    const sunny = { ...rainy, weather: 'sunny' as const }
    expect(earns(sunny, selling(sunny, sale(), sale()), 'rain-or-shine')).toBe(false)
  })

  it('reads used-car deals', () => {
    expect(earns(base, selling(base, sale({ trade: {} as Sale['trade'] })), 'trade-in')).toBe(true)
    const flip = sale({ used: true, price: 14_000, cost: 12_000 })
    expect(earns(base, selling(base, flip), 'flipper')).toBe(true)
    expect(earns(base, selling(base, { ...flip, price: 13_999 }), 'flipper')).toBe(false)
    const bought = (price: number) =>
      withStats(base, {
        bought: [
          {
            model: 'sedan',
            year: 2020,
            sellerName: 'B',
            price,
            value: 9_000,
            trade: false,
            hope: 10_000,
          },
        ],
      })
    expect(earns(base, bought(9_999), 'bought-low')).toBe(true)
    expect(earns(base, bought(10_000), 'bought-low')).toBe(false)
  })

  it('sells a used car fresh within three days of buying it', () => {
    const used = (acquiredDay: number) => ({
      ...base,
      inventory: [
        {
          ...inventory[0],
          status: 'sold' as const,
          used: { year: 2020, miles: 40_000, condition: 0.8, acquiredDay },
        },
      ],
    })
    const s = sale({ used: true })
    expect(earns(used(2), selling(used(2), s), 'fresh-lot')).toBe(true)
    expect(earns(used(1), selling(used(1), s), 'fresh-lot')).toBe(false)
  })

  it('owns every outdoor improvement as Tube Man Fan', () => {
    const outside = (Object.keys(IMPROVEMENTS) as ImprovementId[]).filter(
      (id) => IMPROVEMENTS[id].area === 'outside',
    )
    const owned = outside.map((id) => ({ id, day: 3 }))
    expect(earns(base, { ...base, improvements: owned }, 'tube-man-fan')).toBe(true)
    expect(earns(base, { ...base, improvements: owned.slice(1) }, 'tube-man-fan')).toBe(false)
  })

  it('counts five washes of your own in a day', () => {
    const four = withStats(base, { washes: 4 })
    expect(earns(base, four, 'car-wash')).toBe(false)
    expect(earns(four, withStats(four, { washes: 5 }), 'car-wash')).toBe(true)
  })

  it('reads the service, the client book and the rival', () => {
    const jobs = withStats(base, { service: { ...base.dayStats.service, jobs: 1 } })
    expect(earns(base, jobs, 'first-service')).toBe(true)
    const tradeUp = sale({ returning: true, trade: {} as Sale['trade'] })
    expect(earns(base, selling(base, tradeUp), 'trade-up')).toBe(true)
    expect(earns(base, selling(base, sale({ returning: true })), 'trade-up')).toBe(false)
    const referred = withStats(base, { clients: { ...base.dayStats.clients, referrals: 1 } })
    expect(earns(base, referred, 'referral')).toBe(true)
    const bust = { ...base, career: { ...emptyCareer(), rivalsBeaten: 1 } }
    expect(earns(base, bust, 'rival-bust')).toBe(true)
  })
})

describe('dayAchievements', () => {
  const settled = (patch: Partial<DayStats>): DayStats => ({
    ...emptyStats(),
    settled: true,
    ...patch,
  })

  it('takes a positive net as In the Black, not a zero one', () => {
    expect(dayEarns(ctx({ stats: settled({ sales: [sale()] }) }), 'in-the-black')).toBe(true)
    expect(dayEarns(ctx(), 'in-the-black')).toBe(false)
  })

  it('needs the quota met for Holdback', () => {
    const quota = (sold: number) =>
      settled({
        quota: {
          quota: 40,
          sold,
          payout: 0,
          csi: null,
          tier: { from: 'bronze', to: 'bronze' },
        },
      })
    expect(dayEarns(ctx({ stats: quota(40) }), 'holdback')).toBe(true)
    expect(dayEarns(ctx({ stats: quota(39) }), 'holdback')).toBe(false)
  })

  it('needs every sale by staff, on a day of three or more, for Hands Off', () => {
    const staff = sale({ soldBy: 'Sam T.', sellerId: 's1' })
    expect(dayEarns(ctx({ stats: settled({ sales: [staff, staff, staff] }) }), 'hands-off')).toBe(
      true,
    )
    expect(dayEarns(ctx({ stats: settled({ sales: [staff, staff] }) }), 'hands-off')).toBe(false)
    expect(dayEarns(ctx({ stats: settled({ sales: [staff, staff, sale()] }) }), 'hands-off')).toBe(
      false,
    )
  })

  it('checks the stock at closing for No Debt and Spotless', () => {
    const cars = inventory.filter((c) => c.status !== 'sold').slice(0, 10)
    expect(cars).toHaveLength(10)
    expect(dayEarns(ctx({ inventory: cars }), 'no-debt')).toBe(true)
    expect(dayEarns(ctx({ inventory: cars.slice(1) }), 'no-debt')).toBe(false)
    const floored = [{ ...cars[0], floored: true }, ...cars.slice(1)]
    expect(dayEarns(ctx({ inventory: floored }), 'no-debt')).toBe(false)
    expect(dayEarns(ctx({ inventory: cars }), 'spotless')).toBe(true)
    const dusty = [{ ...cars[0], cleanliness: 0.89 }, ...cars.slice(1)]
    expect(dayEarns(ctx({ inventory: dusty }), 'spotless')).toBe(false)
  })

  it('reads the calendar: a busy Saturday, a sale weekend, a year and a streak', () => {
    // Day 6 is a Saturday.
    expect(dayEarns(ctx({ day: 6, stats: settled({ visitors: 20 }) }), 'busy-saturday')).toBe(true)
    expect(dayEarns(ctx({ day: 6, stats: settled({ visitors: 19 }) }), 'busy-saturday')).toBe(false)
    expect(dayEarns(ctx({ day: 5, stats: settled({ visitors: 30 }) }), 'busy-saturday')).toBe(false)
    expect(dayEarns(ctx({ day: 12 * DAYS_PER_MONTH }), 'one-year')).toBe(true)
    expect(dayEarns(ctx({ day: 12 * DAYS_PER_MONTH - 1 }), 'one-year')).toBe(false)
    expect(dayEarns(ctx({ records: { ...emptyRecords(), streak: 14 } }), 'streak')).toBe(true)
    expect(dayEarns(ctx({ records: { ...emptyRecords(), streak: 13 } }), 'streak')).toBe(false)
  })

  it('sums the sales over a sale weekend', async () => {
    const { eventOn } = await import('./events')
    const sunday = Array.from({ length: 200 }, (_, i) => i + 1).find(
      (d) => eventOn(d) && !eventOn(d + 1),
    )!
    const record = (day: number, sales: number) => ({
      day,
      sales,
      usedSales: 0,
      gross: 0,
      net: 0,
      visitors: 0,
      walkOuts: 0,
      reputation: 50,
      cash: 0,
      marketing: 0,
    })
    // The Thursday before doesn't count.
    const log = [
      record(sunday - 3, 5),
      record(sunday - 2, 3),
      record(sunday - 1, 3),
      record(sunday, 3),
    ]
    expect(dayEarns(ctx({ day: sunday, log }), 'sale-weekend')).toBe(false)
    log[3] = record(sunday, 4)
    expect(dayEarns(ctx({ day: sunday, log }), 'sale-weekend')).toBe(true)
  })

  it('reads reputation, rank, franchise and CSI', () => {
    expect(dayEarns(ctx({ reputation: 75 }), 'well-known')).toBe(true)
    expect(dayEarns(ctx({ reputation: 74 }), 'well-known')).toBe(false)
    expect(dayEarns(ctx({ reputation: 95 }), 'beloved')).toBe(true)
    const career = (rank: ReturnType<typeof emptyCareer>['rank']) => ({ ...emptyCareer(), rank })
    expect(dayAchievements(ctx({ career: career('trusted-dealer') }), [])).toEqual(
      expect.arrayContaining(['main-street', 'trusted-dealer']),
    )
    expect(dayEarns(ctx({ career: career('trusted-dealer') }), 'regional-name')).toBe(false)
    expect(dayEarns(ctx({ career: career('dealer-of-the-year') }), 'dealer-of-the-year')).toBe(true)
    expect(dayEarns(ctx({ franchise: 'gold' }), 'gold-franchise')).toBe(true)
    expect(dayEarns(ctx({ franchise: 'silver' }), 'gold-franchise')).toBe(false)
    expect(dayEarns(ctx({ career: { ...emptyCareer(), bestCsi: 90 } }), 'csi-90')).toBe(true)
    expect(dayEarns(ctx({ career: { ...emptyCareer(), bestCsi: 89 } }), 'csi-90')).toBe(false)
  })

  it('never returns one already earned', () => {
    const c = ctx({ reputation: 99 })
    expect(dayAchievements(c, [{ id: 'beloved', day: 2, level: 'easy' }])).not.toContain('beloved')
  })
})

describe('finance achievements', () => {
  const fi = (extra: Partial<SaleFi> = {}): SaleFi => ({
    financed: true,
    lender: 'union',
    markup: 1,
    amount: 25_000,
    reserve: 400,
    fee: 0,
    products: [],
    presented: 1,
    pressure: 1,
    gross: 400,
    ...extra,
  })
  const product = (id: SaleFi['products'][number]['id']) => ({ id, price: 1000, cost: 400 })

  it('marks a financed deal closed at your own desk, not a salesperson’s or a cash one', () => {
    expect(earns(base, selling(base, sale({ fi: fi() })), 'first-loan')).toBe(true)
    expect(earns(base, selling(base, sale({ fi: fi(), soldBy: 'Sam T.' })), 'first-loan')).toBe(
      false,
    )
    expect(earns(base, selling(base, sale({ fi: fi(), signedBy: 'e1' })), 'first-loan')).toBe(false)
    const cash = fi({ financed: false, lender: null })
    expect(earns(base, selling(base, sale({ fi: cash })), 'first-loan')).toBe(false)
  })

  it('marks every product taken in one deal', () => {
    const all = fi({ products: (['warranty', 'gap', 'protection', 'tyre'] as const).map(product) })
    expect(earns(base, selling(base, sale({ fi: all })), 'the-works')).toBe(true)
    const three = fi({ products: all.products.slice(1) })
    expect(earns(base, selling(base, sale({ fi: three })), 'the-works')).toBe(false)
  })

  it('marks a big back end', () => {
    const big = sale({ fi: fi({ gross: BACK_END_GROSS }) })
    expect(earns(base, selling(base, big), 'back-end')).toBe(true)
    const small = sale({ fi: fi({ gross: BACK_END_GROSS - 1 }) })
    expect(earns(base, selling(base, small), 'back-end')).toBe(false)
  })

  it('marks a finished warranty repair', () => {
    const service = { ...base.dayStats.service, claims: 1 }
    expect(earns(base, withStats(base, { service }), 'covered')).toBe(true)
  })

  it('marks a busy month with no chargebacks, on its last day only', () => {
    const month = { ...emptyFiStats(), financed: CLEAN_BOOKS_DEALS }
    expect(dayEarns(ctx({ day: DAYS_PER_MONTH, monthFi: month }), 'clean-books')).toBe(true)
    expect(dayEarns(ctx({ day: DAYS_PER_MONTH - 1, monthFi: month }), 'clean-books')).toBe(false)
    const charged = { ...month, chargebackCount: 1 }
    expect(dayEarns(ctx({ day: DAYS_PER_MONTH, monthFi: charged }), 'clean-books')).toBe(false)
    const quiet = { ...month, financed: CLEAN_BOOKS_DEALS - 1 }
    expect(dayEarns(ctx({ day: DAYS_PER_MONTH, monthFi: quiet }), 'clean-books')).toBe(false)
  })
})

describe('test drive achievements', () => {
  const driving = (patch: Partial<DayStats['drives']>) =>
    withStats(base, { drives: { ...base.dayStats.drives, ...patch } })

  it('marks your first ride along, not a salesperson’s', () => {
    expect(earns(base, driving({ taken: 1 }), 'first-drive')).toBe(true)
    expect(earns(base, driving({ taken: 1, byStaff: 1 }), 'first-drive')).toBe(false)
  })

  it('marks a drive where every talking point counted', () => {
    expect(earns(base, driving({ taken: 1, perfect: 1 }), 'perfect-pitch')).toBe(true)
    expect(earns(base, driving({ taken: 1 }), 'perfect-pitch')).toBe(false)
  })

  it(`needs ${ROAD_SALES} buyers who drove, and ${TEAM_DRIVES} drives by salespeople, in a day`, () => {
    expect(earns(base, driving({ bought: ROAD_SALES }), 'sold-on-the-road')).toBe(true)
    expect(earns(base, driving({ bought: ROAD_SALES - 1 }), 'sold-on-the-road')).toBe(false)
    expect(earns(base, driving({ byStaff: TEAM_DRIVES }), 'road-crew')).toBe(true)
    expect(earns(base, driving({ byStaff: TEAM_DRIVES - 1 }), 'road-crew')).toBe(false)
  })

  it('marks a ding, and keeps it hidden', () => {
    expect(earns(base, driving({ dings: 1 }), 'fender-bender')).toBe(true)
    expect(ACHIEVEMENTS.find((a) => a.id === 'fender-bender')?.hidden).toBe(true)
  })

  it(`marks a day of ${SCRATCH_FREE_DRIVES}+ drives without a ding`, () => {
    const day = (taken: number, dings = 0) =>
      ctx({
        stats: { ...emptyStats(), settled: true, drives: { ...emptyStats().drives, taken, dings } },
      })
    expect(dayEarns(day(SCRATCH_FREE_DRIVES), 'not-a-scratch')).toBe(true)
    expect(dayEarns(day(SCRATCH_FREE_DRIVES - 1), 'not-a-scratch')).toBe(false)
    expect(dayEarns(day(SCRATCH_FREE_DRIVES, 1), 'not-a-scratch')).toBe(false)
  })
})

describe('auction achievements', () => {
  const buy = (patch: Partial<AuctionBuy> = {}): AuctionBuy => ({
    model: 'sedan',
    year: 2020,
    price: 9_000,
    fee: 470,
    value: 12_000,
    wholesale: 10_000,
    graded: 'Fair',
    ...patch,
  })
  const won = (...bought: AuctionBuy[]) =>
    withStats(base, { auction: { ...base.dayStats.auction, bought } })
  const wholesaled = (price: number, cost: number) =>
    withStats(base, {
      wholesale: {
        ...base.dayStats.wholesale,
        sold: [
          { model: 'van', year: 2019, price, fee: sellerFee(price), cost, buyer: 'Lakeside Auto' },
        ],
      },
    })

  it('marks the first lot won, and a steal under 80% of wholesale', () => {
    expect(earns(base, won(buy()), 'first-lot')).toBe(true)
    expect(earns(base, won(buy()), 'a-steal')).toBe(false)
    expect(earns(base, won(buy({ price: 7_900 })), 'a-steal')).toBe(true)
  })

  it('marks a car bought back from Nazma', () => {
    expect(earns(base, won(buy({ stolen: true })), 'bought-back')).toBe(true)
    expect(earns(base, won(buy()), 'bought-back')).toBe(false)
  })

  it('marks a wholesale that made money after the fee', () => {
    expect(earns(base, wholesaled(9_000, 8_000), 'sold-to-the-trade')).toBe(true)
    expect(earns(base, wholesaled(8_000, 8_000), 'sold-to-the-trade')).toBe(false)
  })
})

describe('staff growth achievements', () => {
  it('marks someone hired at skill 1 grown to 5, not someone hired higher', () => {
    const grown = employee('s1', {
      skill: 5,
      levels: [2, 3, 4, 5].map((skill) => ({ skill, day: skill * 20 })),
    })
    expect(earns(base, { ...base, roster: [grown] }, 'homegrown')).toBe(true)
    const hiredAt2 = { ...grown, levels: grown.levels.slice(1) }
    expect(earns(base, { ...base, roster: [hiredAt2] }, 'homegrown')).toBe(false)
  })

  it('marks a first senior and an Employee of the Month', () => {
    expect(
      earns(base, { ...base, roster: [employee('s1', { senior: true })] }, 'first-senior'),
    ).toBe(true)
    expect(earns(base, { ...base, roster: [employee('s1')] }, 'first-senior')).toBe(false)
    const named = ctx({
      stats: {
        ...emptyStats(),
        settled: true,
        eotm: { id: 's1', name: 'Dana', role: 'sales', day: 28 },
      },
    })
    expect(dayEarns(named, 'eotm')).toBe(true)
    expect(dayEarns(ctx(), 'eotm')).toBe(false)
  })

  it(`needs a happy team of ${HAPPY_TEAM_SIZE}+ for ${HAPPY_TEAM_DAYS} days`, () => {
    const happy = (n: number, morale = TEAM_MORALE) =>
      Array.from({ length: n }, (_, i) => employee(`s${i}`, { morale }))
    expect(isHappyTeam(happy(HAPPY_TEAM_SIZE))).toBe(true)
    expect(isHappyTeam(happy(HAPPY_TEAM_SIZE - 1))).toBe(false)
    expect(isHappyTeam([...happy(HAPPY_TEAM_SIZE), employee('x', { morale: 79 })])).toBe(false)
    expect(
      isHappyTeam([...happy(HAPPY_TEAM_SIZE), employee('x', { morale: 10, fired: true })]),
    ).toBe(true)
    const run = (happyStreak: number) => ctx({ records: { ...emptyRecords(), happyStreak } })
    expect(dayEarns(run(HAPPY_TEAM_DAYS), 'happy-team')).toBe(true)
    expect(dayEarns(run(HAPPY_TEAM_DAYS - 1), 'happy-team')).toBe(false)
  })

  it(`counts ${HUDDLES} huddles, today’s among them`, () => {
    const before = { ...base, lifetime: { ...base.lifetime, huddles: HUDDLES - 1 } }
    expect(earns(before, withStats(before, { huddle: true }), 'huddle-up')).toBe(true)
    const fewer = { ...base, lifetime: { ...base.lifetime, huddles: HUDDLES - 2 } }
    expect(earns(fewer, withStats(fewer, { huddle: true }), 'huddle-up')).toBe(false)
  })
})

describe('achievementNotice', () => {
  it('names one, or counts several', () => {
    expect(achievementNotice(['full-sticker'])).toBe('🏆 Full Sticker: sold a new car at full MSRP')
    expect(achievementNotice(['first-sale', 'full-sticker', 'closer'])).toBe(
      '🏆 3 achievements: First Sale, Full Sticker and Closer',
    )
  })
})
