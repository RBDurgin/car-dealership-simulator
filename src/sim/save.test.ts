import type { EarnedAchievement } from './achievements'
import { describe, expect, it } from 'vitest'
import {
  defaultPerks,
  emptyMonthCsi,
  SERVICE_INTERVAL,
  type Appreciation,
  type Client,
  type ClientPerks,
  type MonthCsi,
} from './clients'
import { CLOSE_MINUTE } from './clock'
import type { OwnedExpansion } from './expansions'
import type { FranchiseTier } from './franchise'
import { PARKING_SPACES, type CarModel } from './layout'
import type { OwnedImprovement } from './improvements'
import { CAR_MODELS } from './customers'
import { BASE_MSRP, buildInventory } from './inventory'
import type { Campaign } from './marketing'
import type { Order } from './ordering'
import { emptyCareer, type Career } from './progression'
import { START_REPUTATION } from './reputation'
import { emptyRival, type Rival } from './rival'
import { BASE_SLOTS } from './ordering'
import { monthlyQuota } from './quota'
import { lastTheftNight } from './nazma'
import { createRng } from './rng'
import { DEFAULT_DEALERSHIP_NAME } from './dealershipName'
import type { Chargeback } from './chargebacks'
import { newContract } from './contracts'
import { emptyFiStats } from './fi'
import { createSave, parseSave, SAVE_VERSION } from './save'
import { defaultService, type ServiceSettings } from './service'
import {
  emptyLifetime,
  emptyRecords,
  tupleToRecord,
  type DayRecord,
  type Lifetime,
  type Records,
} from './stats'
import type { TipId } from './tips'
import { LATEST_NEWS, legacyNews } from './whatsNew'
import type { Employee } from './staff'

const employee = (id: string, extra: Partial<Employee> = {}): Employee => ({
  id,
  name: 'Sam T.',
  variant: 'female-e',
  role: 'receptionist',
  skill: 3,
  wage: 130,
  status: 'leaving',
  fired: false,
  quitting: false,
  ...extra,
})

const source = () => ({
  clock: { day: 3, minute: CLOSE_MINUTE },
  cash: 31_500,
  inventory: buildInventory(createRng(1)),
  roster: [employee('staff-1-1'), employee('staff-2-1', { fired: true })],
  orders: [order],
  campaigns: [campaign, expired],
  improvements: [improvement],
  reputation: 62,
  // As a v8 save upgrades, so the older upgrades compare equal.
  monthSales: { count: 0, msrp: 0 },
  quota: monthlyQuota(0, BASE_SLOTS, 62),
  // As a v9 save upgrades, so the older upgrades compare equal.
  difficulty: 'medium' as const,
  // As a v10 save upgrades, so the older upgrades compare equal.
  bailoutUsed: false,
  tipsSeen: [] as TipId[],
  // As a v12 save upgrades, so the older upgrades compare equal.
  career: emptyCareer() as Career,
  // As a v14 save upgrades, so the older upgrades compare equal.
  franchise: 'bronze' as FranchiseTier,
  // As a v15 save upgrades, so the older upgrades compare equal.
  expansions: [] as OwnedExpansion[],
  // As a v16 save upgrades, so the older upgrades compare equal.
  won: false,
  // As a v17 save of day 3 upgrades (no theft yet), so the older upgrades compare equal.
  rival: emptyRival() as Rival,
  // As a v21 save upgrades, so the older upgrades compare equal.
  service: defaultService() as ServiceSettings,
  // As a v22 save upgrades, so the older upgrades compare equal.
  clients: [] as Client[],
  clientPerks: defaultPerks() as ClientPerks,
  appreciation: null as Appreciation | null,
  monthCsi: emptyMonthCsi() as MonthCsi,
  monthFi: emptyFiStats(),
  contracts: [],
  chargebacks: [],
  // As a v25 save of day 3 upgrades, so the older upgrades compare equal.
  log: [] as DayRecord[],
  lifetime: emptyLifetime() as Lifetime,
  records: emptyRecords() as Records,
  statsFrom: 4,
  // As a v26 save upgrades, so the older upgrades compare equal.
  achievements: [] as EarnedAchievement[],
  // As a v27 save upgrades.
  dealershipName: DEFAULT_DEALERSHIP_NAME,
})

const record = (day: number, extra: Partial<DayRecord> = {}): DayRecord => ({
  day,
  sales: 2,
  usedSales: 1,
  gross: 6_400,
  net: 3_150,
  visitors: 11,
  walkOuts: 4,
  reputation: 52,
  cash: 31_500,
  marketing: 900,
  ...extra,
})

const client: Client = {
  id: 'client-3-0',
  name: 'Alex B.',
  variant: 'male-a',
  companion: null,
  archetype: 'regular',
  status: 'client',
  since: 3,
  lastVisit: 3,
  visits: 1,
  bought: 1,
  car: {
    model: 'sedan',
    used: false,
    price: 28_500,
    boughtDay: 3,
    year: 2026,
    miles: 0,
    condition: 1,
  },
  budget: 32_000,
  preferredModels: ['sedan'],
  lastDeal: null,
  satisfaction: 78,
  reasons: [{ kind: 'wait', points: -8, detail: 25 }],
  dueDay: 41,
  expires: null,
  lastCall: null,
  callsThisCycle: 0,
  appointment: null,
  referredBy: null,
  referrals: 0,
  friendsSent: 0,
  thanked: false,
  serviceDue: 3 + SERVICE_INTERVAL,
  chargedBack: false,
}

const order: Order = {
  id: 'order-3-1',
  model: 'truck',
  cost: 45_800,
  financing: 'floor',
  slot: { location: 'lot', index: 2 },
  day: 3,
}

// Bought on day 3, running days 4–6; and one that ended today.
const campaign: Campaign = { id: 'tv-3-1', channel: 'tv', startDay: 4, endDay: 6 }
const improvement: OwnedImprovement = { id: 'tube-man', day: 3 }
const expired: Campaign = { id: 'online-1-1', channel: 'online', startDay: 1, endDay: 3 }

describe('save data', () => {
  it('keeps the day, cash and inventory, drops the fired and sends everyone home', () => {
    const save = createSave(source(), 123)
    expect(save).toMatchObject({ version: SAVE_VERSION, savedAt: 123, day: 3, cash: 31_500 })
    expect(save.inventory).toEqual(source().inventory)
    expect(save.roster.map((e) => [e.id, e.status])).toEqual([['staff-1-1', 'off']])
    expect(save.orders).toEqual([order])
  })

  it('keeps only the ad campaigns that carry on tomorrow', () => {
    expect(createSave(source(), 123).campaigns).toEqual([campaign])
  })

  it('writes a car left in the shop back as for sale, and still reads one', () => {
    const src = source()
    const inShop = { ...src.inventory[0], status: 'recon' as const }
    const save = createSave({ ...src, inventory: [inShop, ...src.inventory.slice(1)] }, 123)
    expect(save.inventory[0].status).toBe('available')
    const raw = JSON.parse(JSON.stringify(save))
    raw.inventory[0].status = 'recon'
    expect(parseSave(raw)?.inventory[0].status).toBe('recon')
  })

  it('round-trips through JSON', () => {
    const save = createSave(source(), 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save)
  })

  it('upgrades a version 2 save, costing each car from its MSRP', () => {
    const save = createSave(source(), 123)
    const v2 = {
      ...save,
      version: 2,
      orders: undefined,
      campaigns: undefined,
      improvements: undefined,
      reputation: undefined,
      inventory: save.inventory.map((car) => ({
        ...car,
        cost: undefined,
        arrivedDay: undefined,
        floored: undefined,
      })),
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v2)))
    expect(upgraded).toMatchObject({
      version: SAVE_VERSION,
      day: 3,
      cash: 31_500,
      orders: [],
      campaigns: [],
      improvements: [],
      reputation: START_REPUTATION,
      // The month's target is set at the reputation the save is upgraded to.
      quota: monthlyQuota(0, BASE_SLOTS, START_REPUTATION),
    })
    expect(upgraded?.roster).toEqual(save.roster)
    upgraded?.inventory.forEach((car, i) => {
      expect(car).toEqual({ ...save.inventory[i], cost: Math.round((car.msrp * 0.89) / 100) * 100 })
    })
  })

  it('upgrades a version 3 save: opening stock, owned outright, and no orders', () => {
    const save = createSave(source(), 123)
    const v3 = {
      ...save,
      version: 3,
      orders: undefined,
      campaigns: undefined,
      improvements: undefined,
      reputation: undefined,
      inventory: save.inventory.map((car) => ({
        ...car,
        arrivedDay: undefined,
        floored: undefined,
      })),
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v3)))
    expect(upgraded).toEqual({
      ...save,
      news: legacyNews(3),
      orders: [],
      campaigns: [],
      improvements: [],
      reputation: START_REPUTATION,
      // The month's target is set at the reputation the save is upgraded to.
      quota: monthlyQuota(0, BASE_SLOTS, START_REPUTATION),
    })
  })

  it('upgrades a version 4 save with no ad campaigns', () => {
    const save = createSave(source(), 123)
    const v4 = {
      ...save,
      version: 4,
      campaigns: undefined,
      improvements: undefined,
      reputation: undefined,
    }
    expect(parseSave(JSON.parse(JSON.stringify(v4)))).toEqual({
      ...save,
      news: legacyNews(4),
      campaigns: [],
      improvements: [],
      reputation: START_REPUTATION,
      // The month's target is set at the reputation the save is upgraded to.
      quota: monthlyQuota(0, BASE_SLOTS, START_REPUTATION),
    })
  })

  it('upgrades a version 5 save with no improvements', () => {
    const save = createSave(source(), 123)
    const v5 = { ...save, version: 5, improvements: undefined, reputation: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v5)))).toEqual({
      ...save,
      news: legacyNews(5),
      improvements: [],
      reputation: START_REPUTATION,
      // The month's target is set at the reputation the save is upgraded to.
      quota: monthlyQuota(0, BASE_SLOTS, START_REPUTATION),
    })
  })

  it('upgrades a version 6 save to the starting reputation', () => {
    const save = createSave(source(), 123)
    const v6 = { ...save, version: 6, reputation: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v6)))).toEqual({
      ...save,
      news: legacyNews(6),
      reputation: START_REPUTATION,
      // The month's target is set at the reputation the save is upgraded to.
      quota: monthlyQuota(0, BASE_SLOTS, START_REPUTATION),
    })
  })

  it('upgrades a version 7 save: nobody is thinking of quitting', () => {
    const save = createSave(source(), 123)
    const v7 = {
      ...save,
      version: 7,
      roster: save.roster.map((e) => ({ ...e, quitting: undefined })),
    }
    expect(parseSave(JSON.parse(JSON.stringify(v7)))).toEqual({ ...save, news: legacyNews(7) })
  })

  it('upgrades a version 8 save: the month starts afresh, with a target from reputation', () => {
    const save = createSave(source(), 123)
    const v8 = { ...save, version: 8, monthSales: undefined, quota: undefined }
    expect(save.quota).toBeGreaterThan(0)
    expect(parseSave(JSON.parse(JSON.stringify(v8)))).toEqual({
      ...save,
      news: legacyNews(8),
      monthSales: { count: 0, msrp: 0 },
      quota: monthlyQuota(0, BASE_SLOTS, 62),
    })
  })

  it('upgrades a version 9 save to Medium', () => {
    const save = createSave({ ...source(), difficulty: 'hard' }, 123)
    const v9 = { ...save, version: 9, difficulty: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v9)))).toEqual({
      ...save,
      difficulty: 'medium',
      news: legacyNews(9),
    })
  })

  it('upgrades a version 10 save with the safety net unused and no tips seen', () => {
    const save = createSave({ ...source(), bailoutUsed: true, tipsSeen: ['wash'] }, 123)
    const v10 = { ...save, version: 10, bailoutUsed: undefined, tipsSeen: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v10)))).toEqual({
      ...save,
      news: legacyNews(10),
      bailoutUsed: false,
      tipsSeen: [],
    })
  })

  it('upgrades a version 11 save: every car is new', () => {
    const save = createSave(source(), 123)
    const v11 = {
      ...save,
      version: 11,
      inventory: save.inventory.map((car) => ({ ...car, used: undefined })),
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v11)))
    expect(upgraded).toEqual({ ...save, news: legacyNews(11) })
    expect(upgraded?.inventory.every((c) => c.used === null)).toBe(true)
  })

  it('upgrades a version 12 save with an empty career at the first rank', () => {
    const career: Career = {
      ...emptyCareer(),
      gross: 90_000,
      sales: 30,
      days: 12,
      rank: 'main-street',
    }
    const save = createSave({ ...source(), career }, 123)
    const v12 = { ...save, version: 12, career: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v12)))).toEqual({
      ...save,
      career: emptyCareer(),
      news: legacyNews(12),
    })
  })

  it('upgrades a version 13 save with the news its version had already shown', () => {
    const save = createSave(source(), 123)
    const v13 = { ...save, version: 13, news: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v13)))).toEqual({ ...save, news: 9 })
  })

  it('gives each old save the news from the version it started at, through every upgrade', () => {
    const save = createSave(source(), 123)
    const v2 = {
      ...save,
      version: 2,
      news: undefined,
      inventory: save.inventory.map((car) => ({ ...car, cost: undefined })),
    }
    const news = (raw: object) => parseSave(JSON.parse(JSON.stringify(raw)))?.news
    expect(news(v2)).toBe(0)
    expect(news({ ...save, version: 8, news: undefined })).toBe(6)
    expect(news({ ...save, version: 12, news: undefined })).toBe(8)
    expect(news({ ...save, version: 13, news: undefined })).toBe(9)
  })

  it('writes the latest news, round-trips it, clamps a newer build’s, and rejects a bad one', () => {
    const save = createSave(source(), 123)
    expect(save.news).toBe(LATEST_NEWS)
    const seen = { ...save, news: 4 }
    expect(parseSave(JSON.parse(JSON.stringify(seen)))?.news).toBe(4)
    expect(parseSave({ ...save, news: LATEST_NEWS + 5 })?.news).toBe(LATEST_NEWS)
    expect(parseSave({ ...save, news: -1 })).toBeNull()
    expect(parseSave({ ...save, news: 2.5 })).toBeNull()
    expect(parseSave({ ...save, news: undefined })).toBeNull()
  })

  it('upgrades a version 14 save at Bronze', () => {
    const save = createSave({ ...source(), franchise: 'gold' }, 123)
    const v14 = { ...save, version: 14, franchise: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v14)))).toEqual({ ...save, franchise: 'bronze' })
  })

  it('upgrades a version 15 save with no expansions', () => {
    const save = createSave(source(), 123)
    const v15 = { ...save, version: 15, expansions: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v15)))).toEqual(save)
  })

  it('upgrades a version 16 save that hasn’t won', () => {
    const save = createSave(source(), 123)
    const v16 = { ...save, version: 16, won: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v16)))).toEqual(save)
  })

  it('upgrades a version 17 save with the rival unopened, and his last theft replayed', () => {
    const save = createSave(source(), 123)
    const v17 = { ...save, version: 17, rival: undefined }
    expect(parseSave(JSON.parse(JSON.stringify(v17)))).toEqual(save)
    const late = createSave({ ...source(), clock: { day: 40, minute: CLOSE_MINUTE } }, 123)
    const lastTheftDay = lastTheftNight(40)
    expect(lastTheftDay).toBeGreaterThan(0)
    expect(parseSave({ ...late, version: 17, rival: undefined })?.rival).toEqual({
      ...emptyRival(),
      lastTheftDay,
    })
    const hard = { ...late, version: 17, rival: undefined, difficulty: 'hard' }
    expect(parseSave(hard)?.rival.lastTheftDay).toBe(lastTheftNight(40, 1.5))
  })

  it('upgrades a version 18 save with no weekly shares yet', () => {
    const rival: Rival = { ...emptyRival(), status: 'open', shares: [0.2], weeks: [] }
    const save = createSave({ ...source(), rival }, 123)
    const { weeks: _, ...old } = rival
    const v18 = { ...save, version: 18, rival: old }
    expect(parseSave(JSON.parse(JSON.stringify(v18)))).toEqual(save)
  })

  it('upgrades a version 19 save with no move picked yet', () => {
    const rival: Rival = { ...emptyRival(), status: 'open', shares: [0.2], weeks: [0.18] }
    const save = createSave({ ...source(), rival }, 123)
    const { move: _, ...old } = rival
    const v19 = { ...save, version: 19, rival: old }
    expect(parseSave(JSON.parse(JSON.stringify(v19)))).toEqual(save)
  })

  it('upgrades a version 20 save with nobody beaten and no bust day', () => {
    const rival: Rival = { ...emptyRival(), status: 'open', shares: [0.2], weeks: [0.18] }
    const save = createSave({ ...source(), rival }, 123)
    const { closedDay: _, ...oldRival } = rival
    const { rivalsBeaten: __, ...oldCareer } = save.career
    const v20 = { ...save, version: 20, rival: oldRival, career: oldCareer }
    expect(parseSave(JSON.parse(JSON.stringify(v20)))).toEqual(save)
    expect(parseSave({ ...save, career: oldCareer })).toBeNull()
  })

  it('mends a client saved with a NaN (null) budget from their priciest model', () => {
    const prospect = { ...client, preferredModels: ['truck', 'suv'] as CarModel[] }
    const save = createSave({ ...source(), clients: [prospect] }, 123)
    const broken = JSON.parse(JSON.stringify({ ...save, clients: [{ ...prospect, budget: NaN }] }))
    const budget = Math.round(Math.max(BASE_MSRP.truck, BASE_MSRP.suv) / 500) * 500
    expect(parseSave(broken)?.clients).toEqual([{ ...prospect, budget }])
  })

  it('upgrades a version 23 save: nobody has sent a friend or been thanked yet', () => {
    const save = createSave({ ...source(), clients: [{ ...client, thanked: true }] }, 123)
    const { friendsSent: _, thanked: __, ...old } = save.clients[0]
    const v23 = { ...save, version: 23, clients: [old] }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v23)))
    expect(upgraded?.clients).toEqual([{ ...client, friendsSent: 0, thanked: false }])
    expect(parseSave({ ...save, clients: [old] })).toBeNull()
  })

  it('upgrades a version 24 save: no best CSI yet, and clients due for service after buying', () => {
    const save = createSave({ ...source(), clients: [client] }, 123)
    const { bestCsi: _, ...career } = save.career
    const v24 = {
      ...save,
      version: 24,
      career,
      clients: [
        { ...client, serviceDue: null },
        { ...client, id: 'p', status: 'prospect', car: null, serviceDue: null },
      ],
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v24)))
    expect(upgraded?.career.bestCsi).toBeNull()
    expect(upgraded?.clients[0].serviceDue).toBe(client.car!.boughtDay + SERVICE_INTERVAL)
    expect(upgraded?.clients[1].serviceDue).toBeNull()
    expect(parseSave({ ...save, career })).toBeNull()
  })

  it('keeps the log as tuples, the lifetime totals and records, and rejects a malformed log', () => {
    const lifetime: Lifetime = {
      ...emptyLifetime(),
      sales: 4,
      byModel: { sedan: 3, truck: 1 },
      bySource: { tv: 4 },
      bySeller: { player: { sales: 1, gross: 2_000 }, 'staff-1-1': { sales: 3, gross: 7_000 } },
    }
    const records: Records = {
      ...emptyRecords(),
      bestDay: { value: 6_400, day: 3 },
      biggestDeal: { value: 3_100, day: 2, model: 'truck' },
      streak: 2,
    }
    const log = [record(2), record(3, { net: -1_200 })]
    const save = createSave({ ...source(), log, lifetime, records, statsFrom: 2 }, 123)
    expect(save.log).toEqual([
      [2, 2, 1, 6_400, 3_150, 11, 4, 52, 31_500, 900],
      [3, 2, 1, 6_400, -1_200, 11, 4, 52, 31_500, 900],
    ])
    expect(save.log.map(tupleToRecord)).toEqual(log)
    const parsed = parseSave(JSON.parse(JSON.stringify(save)))
    expect(parsed).toEqual(save)
    // A short tuple, days out of order, or a bad record are rejected.
    expect(parseSave({ ...save, log: [[2, 2, 1]] })).toBeNull()
    expect(parseSave({ ...save, log: [save.log[1], save.log[0]] })).toBeNull()
    expect(parseSave({ ...save, log: [save.log[0], save.log[0]] })).toBeNull()
    expect(
      parseSave({ ...save, records: { ...records, biggestDeal: { value: 1, day: 1 } } }),
    ).toBeNull()
    expect(parseSave({ ...save, lifetime: { ...lifetime, byModel: { boat: 1 } } })).toBeNull()
    expect(parseSave({ ...save, statsFrom: 0 })).toBeNull()
  })

  it('reads a 500-day log quickly', () => {
    const log = Array.from({ length: 500 }, (_, i) => record(i + 1))
    const json = JSON.stringify(createSave({ ...source(), log, statsFrom: 1 }, 123))
    const start = performance.now()
    expect(parseSave(JSON.parse(json))?.log).toHaveLength(500)
    expect(performance.now() - start).toBeLessThan(50)
  })

  it('keeps the achievements earned, dropping any this build no longer has', () => {
    const achievements: EarnedAchievement[] = [
      { id: 'first-sale', day: 1, level: 'medium' },
      { id: 'full-sticker', day: 3, level: 'hard' },
    ]
    const save = createSave({ ...source(), achievements }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.achievements).toEqual(achievements)
    const gone = {
      ...save,
      achievements: [...achievements, { id: 'moon-shot', day: 2, level: 'easy' }],
    }
    expect(parseSave(gone)?.achievements).toEqual(achievements)
    expect(
      parseSave({ ...save, achievements: [{ id: 'first-sale', day: 0, level: 'medium' }] }),
    ).toBeNull()
    expect(
      parseSave({ ...save, achievements: [{ id: 'first-sale', day: 1, level: 'insane' }] }),
    ).toBeNull()
    expect(parseSave({ ...save, achievements: undefined })).toBeNull()
  })

  it('keeps the dealership’s name, and tidies a bad one', () => {
    const save = createSave({ ...source(), dealershipName: "Robert's Rides" }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.dealershipName).toBe("Robert's Rides")
    expect(parseSave({ ...save, dealershipName: '  Big\n Al  ' })?.dealershipName).toBe('Big Al')
    expect(parseSave({ ...save, dealershipName: 7 })?.dealershipName).toBe(DEFAULT_DEALERSHIP_NAME)
  })

  it('keeps the month’s F&I', () => {
    const monthFi = {
      ...emptyFiStats(),
      financed: 3,
      cash: 1,
      menus: 2,
      financedMenus: 2,
      reserve: 900,
      productGross: 1_400,
      sold: { warranty: 1, gap: 2 },
    }
    const save = createSave({ ...source(), monthFi }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.monthFi).toEqual(monthFi)
    expect(parseSave({ ...save, monthFi: undefined })).toBeNull()
    expect(parseSave({ ...save, monthFi: { ...monthFi, reserve: 'lots' } })).toBeNull()
    expect(parseSave({ ...save, monthFi: { ...monthFi, sold: { hat: 1 } } })).toBeNull()
  })

  it('keeps warranty contracts in force and chargebacks still to land', () => {
    const car = {
      model: 'sedan' as const,
      used: false,
      price: 30_000,
      boughtDay: 4,
      year: 2026,
      miles: 0,
      condition: 1,
    }
    const contracts = [
      newContract('contract-4-1', 'Ann K.', car, 4, 1800),
      // Runs out tonight: gone by morning.
      { ...newContract('contract-1-1', 'Bo L.', car, 1, 1600), endDay: 3 },
    ]
    const chargebacks: Chargeback[] = [
      {
        day: 40,
        amount: 990,
        customerName: 'Ann K.',
        kind: 'warranty',
        financeId: 'fm-1',
        clawback: 149,
      },
    ]
    const save = createSave({ ...source(), contracts, chargebacks }, 123)
    const back = parseSave(JSON.parse(JSON.stringify(save)))
    expect(back?.contracts).toEqual([contracts[0]])
    expect(back?.chargebacks).toEqual(chargebacks)
    expect(parseSave({ ...save, contracts: undefined })).toBeNull()
    expect(parseSave({ ...save, contracts: [{ ...contracts[0], car: null }] })).toBeNull()
    expect(parseSave({ ...save, chargebacks: [{ ...chargebacks[0], kind: 'hat' }] })).toBeNull()
  })

  it('keeps a client soured by a chargeback, and upgrades a version 30 save with none', () => {
    const save = createSave({ ...source(), clients: [{ ...client, chargedBack: true }] }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.clients[0].chargedBack).toBe(true)
    const { chargedBack: _, ...old } = save.clients[0]
    const v30 = { ...save, version: 30, clients: [old] }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v30)))
    expect(upgraded?.version).toBe(SAVE_VERSION)
    expect(upgraded?.clients).toEqual([client])
    expect(parseSave({ ...save, clients: [old] })).toBeNull()
  })

  it('upgrades a version 29 save with no contracts or chargebacks', () => {
    const { contracts: _, chargebacks: __, monthFi, ...rest } = createSave(source(), 123)
    const {
      chargebackCount: _c,
      chargebacks: _a,
      clawback: _w,
      ...oldFi
    } = {
      ...monthFi,
      reserve: 500,
    }
    const v29 = { ...rest, monthFi: oldFi, version: 29 }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v29)))
    expect(upgraded?.version).toBe(SAVE_VERSION)
    expect(upgraded?.contracts).toEqual([])
    expect(upgraded?.chargebacks).toEqual([])
    expect(upgraded?.monthFi).toEqual({ ...emptyFiStats(), reserve: 500 })
  })

  it('upgrades a version 28 save with no F&I this month', () => {
    const { monthFi: _, ...v28 } = createSave(source(), 123)
    const upgraded = parseSave(JSON.parse(JSON.stringify({ ...v28, version: 28 })))
    expect(upgraded?.version).toBe(SAVE_VERSION)
    expect(upgraded?.monthFi).toEqual(emptyFiStats())
  })

  it('upgrades a version 27 save with the default name', () => {
    const { dealershipName: _, ...v27 } = createSave(source(), 123)
    const upgraded = parseSave(JSON.parse(JSON.stringify({ ...v27, version: 27 })))
    expect(upgraded?.version).toBe(SAVE_VERSION)
    expect(upgraded?.dealershipName).toBe(DEFAULT_DEALERSHIP_NAME)
  })

  it('upgrades a version 26 save with no achievements', () => {
    const { achievements: _, ...v26 } = createSave(source(), 123)
    const upgraded = parseSave(JSON.parse(JSON.stringify({ ...v26, version: 26 })))
    expect(upgraded?.version).toBe(SAVE_VERSION)
    expect(upgraded?.achievements).toEqual([])
  })

  it('upgrades a version 25 save with an empty log, kept from the next day', () => {
    const save = createSave(source(), 123)
    const { log: _, lifetime: __, records: ___, statsFrom: ____, ...v25 } = save
    const upgraded = parseSave(JSON.parse(JSON.stringify({ ...v25, version: 25 })))
    expect(upgraded).toMatchObject({
      log: [],
      lifetime: emptyLifetime(),
      records: emptyRecords(),
      statsFrom: save.day + 1,
    })
  })

  it('upgrades a version 22 save with an empty client book', () => {
    const save = createSave({ ...source(), clients: [client] }, 123)
    const v22 = {
      ...save,
      version: 22,
      clients: undefined,
      clientPerks: undefined,
      appreciation: undefined,
      monthCsi: undefined,
    }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v22)))
    expect(upgraded?.version).toBe(SAVE_VERSION)
    expect(upgraded?.clients).toEqual([])
    expect(upgraded?.clientPerks).toEqual(defaultPerks())
    expect(upgraded?.appreciation).toBeNull()
    expect(upgraded?.monthCsi).toEqual(emptyMonthCsi())
  })

  it('keeps the client book and its levers, and rejects malformed ones', () => {
    const perks: ClientPerks = { loyaltyDiscount: 0.02, referralFee: 250, receptionCalls: false }
    const prospect: Client = {
      ...client,
      id: 'client-4-0',
      name: 'Sam K.',
      status: 'prospect',
      car: null,
      bought: 0,
      dueDay: null,
      expires: 18,
      lastDeal: { model: 'suv', ask: 31_500, counter: 29_800 },
      appointment: { day: 5, minute: 630, reason: 'beBack' },
    }
    const save = createSave(
      {
        ...source(),
        clients: [client, prospect],
        clientPerks: perks,
        appreciation: { day: 9, month: 1 },
        monthCsi: { total: 312, count: 4 },
      },
      123,
    )
    const back = parseSave(JSON.parse(JSON.stringify(save)))
    expect(back?.clients).toEqual([client, prospect])
    expect(back?.clientPerks).toEqual(perks)
    expect(back?.appreciation).toEqual({ day: 9, month: 1 })
    expect(back?.monthCsi).toEqual({ total: 312, count: 4 })
    const bad = (c: Partial<Record<keyof Client, unknown>>) =>
      parseSave({ ...save, clients: [{ ...client, ...c }] })
    expect(bad({ status: 'friend' })).toBeNull()
    expect(bad({ satisfaction: 120 })).toBeNull()
    expect(bad({ archetype: 'alien' })).toBeNull()
    expect(bad({ car: { ...client.car, model: 'hovercar' } })).toBeNull()
    expect(bad({ dueDay: undefined })).toBeNull()
    expect(parseSave({ ...save, clientPerks: { ...perks, loyaltyDiscount: 0.5 } })).toBeNull()
    expect(parseSave({ ...save, appreciation: { day: 9 } })).toBeNull()
    expect(parseSave({ ...save, monthCsi: undefined })).toBeNull()
  })

  it('upgrades a version 21 save: the shop at its defaults, its sales spread over the models', () => {
    const career: Career = { ...emptyCareer(), sales: 2 * CAR_MODELS.length + 1 }
    const save = createSave({ ...source(), career }, 123)
    const { soldByModel: _, ...oldCareer } = career
    const v21 = { ...save, version: 21, career: oldCareer, service: undefined }
    const upgraded = parseSave(JSON.parse(JSON.stringify(v21)))
    expect(upgraded?.service).toEqual(defaultService())
    const spread = upgraded?.career.soldByModel ?? {}
    expect(Object.values(spread).reduce((a, b) => a + b, 0)).toBe(career.sales)
    expect(spread[CAR_MODELS[0]]).toBe(3)
    expect(spread[CAR_MODELS[1]]).toBe(2)
    const none = createSave(source(), 123)
    const { soldByModel: __, ...empty } = none.career
    expect(parseSave({ ...none, version: 21, career: empty, service: undefined })).toEqual(none)
  })

  it('keeps the service settings, and rejects a rate it doesn’t know', () => {
    const service: ServiceSettings = { rate: 'premium', autoRecon: true }
    const save = createSave({ ...source(), service }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.service).toEqual(service)
    expect(parseSave({ ...save, service: { ...service, rate: 'free' } })).toBeNull()
    expect(parseSave({ ...save, service: { rate: 'budget' } })).toBeNull()
    expect(parseSave({ ...save, service: undefined })).toBeNull()
  })

  it('keeps the rival, and rejects a malformed one', () => {
    const rival: Rival = {
      ...emptyRival(),
      status: 'open',
      generation: 1,
      openDay: 22,
      strength: 47.5,
      undercut: 0.04,
      shares: [0.15, 0.17],
      weeks: [0.16],
      stolen: ['truck'],
      hires: ['Dana K.'],
      lastTheftDay: 31,
      move: { id: 'priceWar', from: 29 },
    }
    const save = createSave({ ...source(), rival }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.rival).toEqual(rival)
    expect(parseSave({ ...save, rival: { ...rival, status: 'bust' } })).toBeNull()
    expect(parseSave({ ...save, rival: { ...rival, shares: ['a'] } })).toBeNull()
    expect(parseSave({ ...save, rival: { ...rival, weeks: undefined } })).toBeNull()
    expect(parseSave({ ...save, rival: { ...rival, move: { id: 'riot', from: 29 } } })).toBeNull()
    expect(parseSave({ ...save, rival: { ...rival, move: undefined } })).toBeNull()
    expect(parseSave({ ...save, rival: undefined })).toBeNull()
  })

  it('keeps the win, and rejects a save without one', () => {
    const save = createSave({ ...source(), won: true }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.won).toBe(true)
    expect(parseSave({ ...save, won: 'yes' })).toBeNull()
    expect(parseSave({ ...save, won: undefined })).toBeNull()
  })

  it('keeps the expansions, and rejects one it doesn’t know', () => {
    const expansions: OwnedExpansion[] = [{ id: 'east-lot', day: 20 }]
    const save = createSave({ ...source(), expansions }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.expansions).toEqual(expansions)
    expect(parseSave({ ...save, expansions: [{ id: 'west-lot', day: 20 }] })).toBeNull()
    expect(parseSave({ ...save, expansions: [{ id: 'east-lot' }] })).toBeNull()
  })

  it('keeps the franchise tier, and rejects one it doesn’t know', () => {
    const save = createSave({ ...source(), franchise: 'silver' }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.franchise).toBe('silver')
    expect(parseSave({ ...save, franchise: 'platinum' })).toBeNull()
  })

  it('keeps the career, and rejects a rank it doesn’t know', () => {
    const career: Career = {
      gross: 120_000,
      sales: 41,
      days: 20,
      monthGross: 30_000,
      bestMonth: 95_000,
      bestCsi: 84,
      rank: 'main-street',
      rivalsBeaten: 2,
      soldByModel: { sedan: 30, truck: 11 },
    }
    const save = createSave({ ...source(), career }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.career).toEqual(career)
    expect(parseSave({ ...save, career: { ...career, rank: 'emperor' } })).toBeNull()
    expect(parseSave({ ...save, career: { ...career, gross: 'lots' } })).toBeNull()
    expect(parseSave({ ...save, career: { ...career, soldByModel: { hovercar: 1 } } })).toBeNull()
    expect(parseSave({ ...save, career: { ...career, soldByModel: undefined } })).toBeNull()
  })

  it('keeps a used car, and rejects one whose condition is out of range', () => {
    const used = { year: 2019, miles: 64_000, condition: 0.55, acquiredDay: 2 }
    const base = source()
    const inventory = base.inventory.map((c, i) => (i === 0 ? { ...c, used } : c))
    const save = createSave({ ...base, inventory }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.inventory[0].used).toEqual(used)
    const bad = inventory.map((c, i) => (i === 0 ? { ...c, used: { ...used, condition: 2 } } : c))
    expect(parseSave({ ...save, inventory: bad })).toBeNull()
  })

  it('keeps the safety net and tips seen, and rejects a tip it doesn’t know', () => {
    const save = createSave({ ...source(), bailoutUsed: true, tipsSeen: ['wash', 'nazma'] }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toMatchObject({
      bailoutUsed: true,
      tipsSeen: ['wash', 'nazma'],
    })
    expect(parseSave({ ...save, tipsSeen: ['juggle'] })).toBeNull()
    expect(parseSave({ ...save, bailoutUsed: 'yes' })).toBeNull()
  })

  it('keeps the difficulty level, and rejects one it doesn’t know', () => {
    const save = createSave({ ...source(), difficulty: 'easy' }, 123)
    expect(parseSave(JSON.parse(JSON.stringify(save)))?.difficulty).toBe('easy')
    expect(parseSave({ ...save, difficulty: 'nightmare' })).toBeNull()
    expect(parseSave({ ...save, difficulty: undefined })).toBeNull()
  })

  it('keeps the month’s sales and quota', () => {
    const monthSales = { count: 5, msrp: 180_000 }
    expect(createSave({ ...source(), monthSales, quota: 16 }, 123)).toMatchObject({
      monthSales: { count: 5, msrp: 180_000 },
      quota: 16,
    })
  })

  it('dresses staff in a dropped model in one still in use, and guards in uniform', () => {
    const save = createSave(source(), 123)
    const roster = [
      { ...save.roster[0], variant: 'female-a' },
      { ...save.roster[0], id: 'staff-1-2', variant: 'male-c' },
      { ...save.roster[0], id: 'staff-1-3', role: 'security', variant: 'female-e' },
    ]
    const loaded = parseSave(JSON.parse(JSON.stringify({ ...save, roster })))
    expect(loaded?.roster.map((e) => e.variant)).toEqual(['male-e', 'male-e', 'male-c'])
  })

  it('saves nobody as thinking of quitting', () => {
    const s = source()
    const save = createSave({ ...s, roster: [employee('staff-1-1', { quitting: true })] }, 123)
    expect(save.roster[0].quitting).toBe(false)
  })

  it('keeps the reputation', () => {
    expect(createSave(source(), 123).reputation).toBe(62)
  })

  it('keeps every improvement bought, including today’s', () => {
    expect(createSave(source(), 123).improvements).toEqual([improvement])
  })

  it('rejects anything that is not a save of this version', () => {
    const save = createSave(source(), 123)
    expect(parseSave(null)).toBeNull()
    expect(parseSave('save')).toBeNull()
    expect(parseSave({ ...save, version: SAVE_VERSION + 1 })).toBeNull()
    expect(parseSave({ ...save, cash: undefined })).toBeNull()
    expect(parseSave({ ...save, day: 0 })).toBeNull()
    expect(parseSave({ ...save, inventory: [{ id: 'x' }] })).toBeNull()
    // A car saved before cars got dirty (version 1).
    const { cleanliness: _, ...unwashed } = save.inventory[0]
    expect(parseSave({ ...save, inventory: [unwashed] })).toBeNull()
    expect(parseSave({ ...save, version: 1 })).toBeNull()
    const { cost: __, ...uncosted } = save.inventory[0]
    expect(parseSave({ ...save, inventory: [uncosted] })).toBeNull()
    expect(parseSave({ ...save, roster: 'nobody' })).toBeNull()
    expect(parseSave({ ...save, roster: [{ ...save.roster[0], role: 'janitor' }] })).toBeNull()
    const guard = { ...save.roster[0], role: 'security' }
    expect(parseSave({ ...save, roster: [guard] })?.roster).toEqual([guard])
    expect(parseSave({ ...save, orders: undefined })).toBeNull()
    expect(parseSave({ ...save, orders: [{ ...order, financing: 'lease' }] })).toBeNull()
    expect(
      parseSave({
        ...save,
        orders: [{ ...order, slot: { location: 'lot', index: PARKING_SPACES.length } }],
      }),
    ).toBeNull()
    const { floored: ___, ...unfloored } = save.inventory[0]
    expect(parseSave({ ...save, inventory: [unfloored] })).toBeNull()
    expect(parseSave({ ...save, campaigns: undefined })).toBeNull()
    expect(parseSave({ ...save, campaigns: [{ ...campaign, channel: 'blimp' }] })).toBeNull()
    expect(parseSave({ ...save, improvements: undefined })).toBeNull()
    expect(parseSave({ ...save, improvements: [{ id: 'statue', day: 2 }] })).toBeNull()
    expect(parseSave({ ...save, reputation: undefined })).toBeNull()
    expect(parseSave({ ...save, reputation: 101 })).toBeNull()
    expect(parseSave({ ...save, reputation: -1 })).toBeNull()
    expect(parseSave({ ...save, monthSales: undefined })).toBeNull()
    expect(parseSave({ ...save, monthSales: { count: 1 } })).toBeNull()
    expect(parseSave({ ...save, quota: 0 })).toBeNull()
  })
})
