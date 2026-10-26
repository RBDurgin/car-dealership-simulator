import { CSI_FLOOR } from './csi'
import { describe, expect, it } from 'vitest'
import { WASH_BELOW } from './cleanliness'
import { generateCustomer, PLAYER_ID, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import type { NazmaVisit } from './nazma'
import type { Client } from './clients'
import type { FiDeal } from './fi'
import { createRng } from './rng'
import { clientJob, type Finding } from './service'
import { serviceClient } from './serviceClients'
import { newDrive } from './testDrive'
import { STALE_DAYS } from './usedCars'
import { SENIOR_DAYS } from './growth'
import { wageFor, type Employee } from './staff'
import {
  APPRECIATION_TIP_CLIENTS,
  DRIVE_STAFF_TIP_DRIVES,
  FINANCE_TIP_DEALS,
  LOW_CASH,
  TIP_IDS,
  TRAINING_TIP_DAYS,
  tipFor,
  tipText,
  TIPS,
  type TipId,
  type TipState,
} from './tips'

const inventory = buildInventory(createRng(42)).map((c) => ({ ...c, cleanliness: 1 }))
const customer = (id: string, patch: Partial<Customer> = {}): Customer => ({
  ...generateCustomer(id, inventory, createRng(1)),
  handlerId: PLAYER_ID,
  phase: 'talking',
  ...patch,
})
const nazma = (status: NazmaVisit['status']): NazmaVisit => ({
  scheme: 'smudge',
  status,
  targets: [],
  progress: 0,
  arrivalMinute: 600,
  chatting: false,
})

const base: TipState = {
  screen: 'playing',
  clock: { day: 1 },
  cash: 20_000,
  inventory,
  customers: [customer('c1')],
  dayStats: { missed: {}, quota: null },
  owner: null,
  nazma: null,
  franchise: 'bronze',
  career: { rank: 'corner-lot' },
  rival: { status: 'unopened' },
  expansions: [],
  serviceJobs: [],
  clients: [],
}
const garage: TipState['expansions'] = [
  { id: 'east-lot', day: 1 },
  { id: 'service-bay', day: 1 },
]
const roughUsed = {
  ...inventory[0],
  id: 'used-2-1',
  used: { year: 2018, miles: 110_000, condition: 0.3, acquiredDay: 2 },
}
const sellerCar = (parked: boolean): Partial<Customer> => ({
  phase: parked ? 'waiting' : 'arriving',
  handlerId: null,
  vehicle: {
    car: { model: 'sedan', year: 2020, miles: 70_000, condition: 0.6, acquiredDay: 1 },
    spot: 0,
    parked,
  },
  selling: { hope: 9_000, estimate: { estimate: 8_500, margin: 2_000 }, appraised: false },
})
const tradeCar = (parked: boolean): Partial<Customer> => {
  const { selling, ...rest } = sellerCar(parked)
  return { ...rest, phase: parked ? 'browsing' : 'arriving', trade: selling }
}
/** A buyer with the rival's quote on the first car, being talked to by `handlerId`. */
const quoted = (handlerId: string | null): Partial<Customer> => ({
  phase: handlerId ? 'talking' : 'waiting',
  handlerId,
  targetCarId: inventory[0].id,
  rivalQuote: { model: inventory[0].model, price: 20_000 },
})
const usedOn = (acquiredDay: number) => ({
  year: 2020,
  miles: 70_000,
  condition: 0.6,
  acquiredDay,
})
const withCar = (patch: Partial<InventoryCar>) =>
  inventory.map((c, i) => (i === 0 ? { ...c, ...patch } : c))

/** The tip for a change from `prev` (patched onto base) to `next`. */
const tip = (next: Partial<TipState>, prev: Partial<TipState> = {}, seen: TipId[] = []) =>
  tipFor({ ...base, ...prev }, { ...base, ...next }, seen)

const visit = serviceClient('s1', 'oil', 0, createRng(1), 1, 'standard').service!
const recallVisit = serviceClient('s2', 'recall', 1, createRng(2), 1, 'standard').service!
const job = clientJob('client-1-1', 'oil', 's1', visit.quote, {
  name: 'Sam',
  model: 'sedan',
  condition: 0.6,
})
const finding: Finding = {
  label: 'Worn brake pads',
  minutes: 60,
  labor: 120,
  parts: 140,
  partsCost: 100,
  status: 'found',
}

const clientsOf = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `client-1-${i}`, status: 'client' }) as Client)

/** The player's buyer at the menu (`lender` null: nobody will take the loan), or still signing. */
const fiDeal = (lender: FiDeal['lender']): FiDeal => ({
  lender,
  markup: 0,
  down: 0.1,
  products: [],
  presented: 0,
})
const atMenu = (lender: FiDeal['lender'], finance = true): Partial<Customer> => ({
  phase: 'menu',
  credit: { tier: lender ? 'A' : 'D', finance, down: 0.1 },
  fi: fiDeal(lender),
})
const fiStats = (financed: number, declined = 0, chargebackCount = 0) => ({
  missed: {},
  quota: null,
  fi: { financed, declined, chargebackCount },
})

const driveStats = (taken: number, byStaff = 0, dings = 0) => ({
  missed: {},
  quota: null,
  drives: { taken, byStaff, dings },
})
const staff = (patch: Partial<Employee> = {}): Employee => ({
  id: 'staff-1-1',
  name: 'Dana',
  variant: 'female-e',
  role: 'sales',
  skill: 1,
  wage: wageFor('sales', 1),
  status: 'atPost',
  fired: false,
  quitting: false,
  xp: 0,
  potential: 3,
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
  ...patch,
})
const idleSeller = [staff()]
const seasoned = [staff({ skill: 5, potential: 5 })]

const dueBook = [{ id: 'client-1-0', status: 'client', dueDay: 40 } as Client]

const triggers: Record<TipId, [Partial<TipState>, Partial<TipState>]> = {
  wash: [{ inventory: withCar({ cleanliness: WASH_BELOW - 0.01 }) }, {}],
  haggle: [
    { customers: [customer('c1', { haggle: { round: 2, lastAsk: 30_000, counter: 28_000 } })] },
    {},
  ],
  restock: [{ inventory: withCar({ status: 'sold' }) }, {}],
  missed: [{ dayStats: { missed: { sedan: 1 }, quota: null } }, {}],
  nazma: [{ nazma: nazma('onLot') }, { nazma: nazma('coming') }],
  owner: [
    { owner: { goal: { kind: 'noImpatient' }, announced: true } },
    { owner: { goal: { kind: 'noImpatient' }, announced: false } },
  ],
  lowCash: [{ cash: LOW_CASH - 1 }, { cash: LOW_CASH }],
  stats: [{ dayStats: { missed: {}, quota: null, newRecords: ['bestDay'] } }, {}],
  achievement: [
    { achievements: [{ id: 'first-sale', day: 1, level: 'easy' }] },
    { achievements: [] },
  ],
  csi: [
    {
      dayStats: {
        missed: {},
        quota: {
          quota: 40,
          sold: 42,
          payout: 900,
          csi: CSI_FLOOR - 1,
          tier: { from: 'bronze', to: 'silver' },
        },
      },
    },
    {},
  ],
  franchise: [{ franchise: 'silver' }, { franchise: 'bronze' }],
  expansion: [{ career: { rank: 'main-street' } }, { career: { rank: 'corner-lot' } }],
  seller: [
    { customers: [customer('c2', sellerCar(true))] },
    { customers: [customer('c2', sellerCar(false))] },
  ],
  tradeIn: [
    { customers: [customer('c3', tradeCar(true))] },
    { customers: [customer('c3', tradeCar(false))] },
  ],
  rivalQuote: [
    { customers: [customer('c4', quoted(PLAYER_ID))] },
    { customers: [customer('c4', quoted(null))] },
  ],
  rivalOpens: [{ rival: { status: 'open' } }, { rival: { status: 'announced' } }],
  rivalBust: [{ rival: { status: 'closed' } }, { rival: { status: 'open' } }],
  serviceBay: [
    { expansions: garage, clock: { day: 2 } },
    { expansions: garage, clock: { day: 1 } },
  ],
  recon: [
    { inventory: [...inventory, roughUsed], expansions: garage, clock: { day: 3 } },
    { expansions: garage, clock: { day: 3 } },
  ],
  serviceClient: [
    { customers: [customer('s1', { phase: 'waiting', service: visit })] },
    { customers: [customer('s1', { phase: 'arriving', service: visit })] },
  ],
  recall: [
    { customers: [customer('s2', { phase: 'waiting', service: recallVisit })] },
    { customers: [customer('s2', { phase: 'arriving', service: recallVisit })] },
  ],
  finding: [
    { serviceJobs: [{ ...job, status: 'inBay', bay: 0, finding }] },
    { serviceJobs: [{ ...job, status: 'inBay', bay: 0 }] },
  ],
  clientBook: [{ clients: [{ id: 'client-1-0' } as Client] }, {}],
  followUp: [
    { clients: [{ id: 'client-1-0', status: 'prospect' } as Client] },
    { clients: [{ id: 'client-1-0', status: 'lapsed' } as Client] },
  ],
  appointment: [
    {
      clients: [
        {
          id: 'client-1-0',
          status: 'prospect',
          appointment: { day: 2, minute: 600, reason: 'beBack' },
        } as Client,
      ],
    },
    { clients: [{ id: 'client-1-0', status: 'prospect', appointment: null } as Client] },
  ],
  tradeUpDue: [
    { clients: dueBook, clock: { day: 40 } },
    { clients: dueBook, clock: { day: 39 } },
  ],
  staleUsed: [
    { inventory: withCar({ used: usedOn(1) }), clock: { day: 1 + STALE_DAYS } },
    { inventory: withCar({ used: usedOn(1) }), clock: { day: STALE_DAYS } },
  ],
  wholesale: [
    {
      inventory: withCar({ used: usedOn(1) }),
      clock: { day: 1 + STALE_DAYS },
      career: { rank: 'main-street' },
    },
    {
      inventory: withCar({ used: usedOn(1) }),
      clock: { day: STALE_DAYS },
      career: { rank: 'main-street' },
    },
  ],
  auction: [{ auction: { over: false } }, { auction: null }],
  inspect: [
    {
      dayStats: {
        missed: {},
        quota: null,
        auction: { surprises: [{ model: 'sedan', year: 2020, graded: 'Good', arrived: 'Fair' }] },
      },
    },
    {},
  ],
  declinedCredit: [
    { customers: [customer('b1', atMenu(null))] },
    { customers: [customer('b1', { phase: 'signing' })] },
  ],
  fiMenu: [
    { customers: [customer('b1', atMenu('prime'))] },
    { customers: [customer('b1', { phase: 'signing' })] },
  ],
  chargeback: [{ dayStats: fiStats(0, 0, 1) }, { dayStats: fiStats(0) }],
  financeManager: [
    { dayStats: fiStats(FINANCE_TIP_DEALS), roster: [] },
    { dayStats: fiStats(FINANCE_TIP_DEALS - 1), roster: [] },
  ],
  testDrive: [
    { customers: [customer('d1', { phase: 'waiting', handlerId: null, wantsDrive: true })] },
    { customers: [customer('d1', { phase: 'browsing', handlerId: null, wantsDrive: true })] },
  ],
  ding: [{ dayStats: driveStats(1, 0, 1) }, { dayStats: driveStats(0) }],
  driveStaff: [
    { dayStats: driveStats(DRIVE_STAFF_TIP_DRIVES + 1, 1), roster: idleSeller },
    { dayStats: driveStats(DRIVE_STAFF_TIP_DRIVES, 1), roster: idleSeller },
  ],
  levelUp: [
    { roster: [staff({ raiseAsk: { wage: wageFor('sales', 2), day: 1 } })] },
    { roster: [staff()] },
  ],
  lowMorale: [{ roster: [staff({ morale: 20 })] }, { roster: [staff()] }],
  rota: [{ roster: [staff({ daysOff: [0] })] }, { roster: [staff()] }],
  training: [
    { roster: idleSeller, clock: { day: 1 + TRAINING_TIP_DAYS } },
    { roster: idleSeller, clock: { day: TRAINING_TIP_DAYS } },
  ],
  promote: [
    { roster: seasoned, clock: { day: 1 + SENIOR_DAYS } },
    { roster: seasoned, clock: { day: SENIOR_DAYS } },
  ],
  referral: [{ customers: [customer('f1', { referredBy: 'client-1-0' })] }, {}],
  appreciation: [
    { clients: clientsOf(APPRECIATION_TIP_CLIENTS) },
    // The tenth was a prospect yesterday.
    {
      clients: clientsOf(APPRECIATION_TIP_CLIENTS).map((c, i) =>
        i === 0 ? { ...c, status: 'prospect' as const } : c,
      ),
    },
  ],
}

describe('tipFor', () => {
  it('has a text for every tip', () => {
    for (const id of TIP_IDS) expect(tipText(id)).toBe(`Tip: ${TIPS[id]}`)
  })

  it.each(TIP_IDS)('gives the %s tip when it first happens, and never once seen', (id) => {
    const [next, prev] = triggers[id]
    expect(tip(next, prev)).toBe(id)
    expect(tip(next, prev, [id])).toBeNull()
  })

  it('points stale used cars at the auction once it’s open, instead of the plain tip', () => {
    const [next, prev] = triggers.staleUsed
    const open = { career: { rank: 'main-street' as const } }
    expect(tip({ ...next, ...open }, { ...prev, ...open })).toBe('wholesale')
    expect(tip({ ...next, ...open }, { ...prev, ...open }, ['wholesale'])).toBeNull()
    expect(tip(next, prev, ['staleUsed'])).toBeNull()
  })

  it('points at reconditioning only once the garage is up, and only for a rough car', () => {
    const [next, prev] = triggers.recon
    expect(tip({ ...next, expansions: [] }, { ...prev, expansions: [] })).toBeNull()
    const fair = { ...roughUsed, used: { ...roughUsed.used, condition: 0.7 } }
    expect(tip({ ...next, inventory: [...inventory, fair] }, prev)).toBeNull()
  })

  it('gives nothing when nothing changed', () => {
    expect(tip({})).toBeNull()
  })

  it('stays quiet on the title screen and as a game starts from it', () => {
    const [next, prev] = triggers.lowCash
    expect(tip({ ...next, screen: 'title' }, prev)).toBeNull()
    expect(tip(next, { ...prev, screen: 'title' })).toBeNull()
  })

  it('only counts crossings, not a car already dirty or cash already low', () => {
    const dirty = withCar({ cleanliness: 0.5 })
    expect(tip({ inventory: withCar({ cleanliness: 0.4 }) }, { inventory: dirty })).toBeNull()
    expect(tip({ cash: 1_000 }, { cash: 2_000 })).toBeNull()
  })

  it('doesn’t count a dirty car that was sold, or a salesperson’s counter', () => {
    expect(tip({ inventory: withCar({ status: 'sold', cleanliness: 0.5 }) }, {}, ['restock'])).toBe(
      null,
    )
    const staff = customer('c1', {
      handlerId: 'staff-1-1',
      haggle: { round: 2, lastAsk: 30_000, counter: 28_000 },
    })
    expect(tip({ customers: [staff] })).toBeNull()
  })

  it('points at the menu only for the player’s financed buyer', () => {
    const [, prev] = triggers.fiMenu
    expect(tip({ customers: [customer('b1', atMenu('prime', false))] }, prev)).toBeNull()
    const staff = customer('b1', { ...atMenu('prime'), handlerId: 'staff-1-1' })
    expect(tip({ customers: [staff] }, prev)).toBeNull()
  })

  it('counts a buyer a salesperson’s banks declined too', () => {
    expect(tip({ dayStats: fiStats(0, 1) }, { dayStats: fiStats(0) })).toBe('declinedCredit')
  })

  it('suggests a finance manager only when there isn’t one', () => {
    const [next, prev] = triggers.financeManager
    const roster = [staff({ role: 'finance' })]
    expect(tip({ ...next, roster }, { ...prev, roster })).toBeNull()
    const gone = [{ ...roster[0], fired: true }]
    expect(tip({ ...next, roster: gone }, { ...prev, roster: gone })).toBe('financeManager')
  })

  it('points at training only for someone who can still learn', () => {
    const [next, prev] = triggers.training
    expect(tip({ ...next, roster: seasoned }, { ...prev, roster: seasoned })).toBeNull()
    const booked = [staff({ training: { day: 20, course: 'basic' } })]
    expect(tip({ ...next, roster: booked }, { ...prev, roster: booked })).toBeNull()
  })

  it('counts a coverage gap only when there was none', () => {
    const [next] = triggers.rota
    expect(tip(next, next)).toBeNull()
    expect(tip(next, { roster: [staff({ daysOff: [1] })] })).toBeNull()
  })

  it('points at a salesperson’s drives only while one is free', () => {
    const [next, prev] = triggers.driveStaff
    const busy = [customer('d2', { handlerId: 'staff-1-1' })]
    expect(tip({ ...next, customers: busy }, { ...prev, customers: busy })).toBeNull()
    const off = [staff({ status: 'off' })]
    expect(tip({ ...next, roster: off }, { ...prev, roster: off })).toBeNull()
    // Drives the salespeople took don't count.
    expect(tip({ ...next, dayStats: driveStats(5, 3) }, prev)).toBeNull()
  })

  it('points at the key only once it shows', () => {
    const [next] = triggers.testDrive
    const driven = customer('d1', { phase: 'waiting', handlerId: null, wantsDrive: true })
    const back = { ...driven, drive: { ...newDrive('car', PLAYER_ID, 20), back: true } }
    expect(tip({ customers: [back] }, next)).toBeNull()
  })

  it('gives the first unseen tip when several apply', () => {
    const next = { cash: LOW_CASH - 1, nazma: nazma('onLot') }
    expect(tip(next)).toBe('nazma')
    expect(tip(next, {}, ['nazma'])).toBe('lowCash')
  })
})
