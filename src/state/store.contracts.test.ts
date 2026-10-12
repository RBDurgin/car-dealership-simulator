import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chargeback, ChargebackDeal } from '../sim/chargebacks'
import { CLOSE_MINUTE } from '../sim/clock'
import { calendarOf } from '../sim/calendar'
import { newContract, WARRANTY_DAYS, type Contract } from '../sim/contracts'
import type { Credit } from '../sim/credit'
import type { Customer } from '../sim/customers'
import { guestChairOf, totalGross, type Sale } from '../sim/deal'
import type { OwnedExpansion } from '../sim/expansions'
import type { SaleFi } from '../sim/fi'
import { MANAGER_DESK } from '../sim/layout'
import { GARAGE_EXPANSION, warrantyPay } from '../sim/service'
import { wageFor, type Employee } from '../sim/staff'
import { useGame } from './store'

// Customers say yes on the price and to every product.
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: () => ({ answer: 'accept' }),
}))
vi.mock('../sim/fi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/fi')>()),
  productTake: () => 1,
}))
// What `sign` asks of the chargeback roll, and what it got back.
const rolled = vi.hoisted(() => ({ calls: [] as { fi: SaleFi; deal: ChargebackDeal }[] }))
vi.mock('../sim/chargebacks', async (importOriginal) => {
  const m = await importOriginal<typeof import('../sim/chargebacks')>()
  return {
    ...m,
    rollChargebacks: (
      fi: SaleFi,
      deal: ChargebackDeal,
      rng: Parameters<typeof m.rollChargebacks>[2],
    ) => {
      rolled.calls.push({ fi, deal })
      return m.rollChargebacks(fi, deal, rng)
    },
  }
})

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = 'customer-a') => game().customers.find((c) => c.id === id)

const loan: Credit = { tier: 'C', finance: true, down: 0.1 }

const shopper = (): Customer => ({
  id: 'customer-a',
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 200_000,
  preferredModels: ['sedan'],
  patience: 120,
  patienceLeft: 120,
  browseCarIds: ['lot-car-1'],
  browsed: 1,
  targetCarId: 'lot-car-1',
  offer: null,
  expect: 0.04,
  haggle: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
  vehicle: null,
  selling: null,
  trade: null,
  rivalQuote: null,
  clientId: null,
  loyaltyCut: 0,
  referredBy: null,
  guest: false,
  credit: loan,
  fi: null,
  service: null,
})

function perform(targetId: string, action: Parameters<typeof initial.requestAction>[1]) {
  game().requestAction(targetId, action)
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
}

/** Sells `lot-car-1` to the shopper at the player's desk with a warranty and GAP. */
function sellWithWarranty() {
  useGame.setState({ ...initial, customers: [shopper()] }, true)
  perform('customer-a', 'greet')
  perform('customer-a', 'offer')
  game().answerOffer('customer-a')
  const desk = MANAGER_DESK.chairId
  game().requestAction(desk, 'closeDeal')
  const id = game().activeAction!.id
  game().dispatchCustomer({ type: 'seat', id: 'customer-a', chairId: guestChairOf(desk) })
  game().arriveAction(id)
  game().completeAction(id)
  game().fiLender('union', 2)
  game().fiPresent('warranty', 2000)
  game().fiPresent('gap', 800)
  game().fiSign()
}

const garage: OwnedExpansion[] = [
  { id: 'east-lot', day: 1 },
  { id: GARAGE_EXPANSION, day: 1 },
]

const staff = (id: string, role: Employee['role']): Employee => ({
  id,
  name: id,
  variant: 'male-c',
  role,
  skill: 3,
  wage: wageFor(role, 3),
  status: 'atPost',
  fired: false,
  quitting: false,
})

const car = {
  model: 'sedan' as const,
  used: false,
  price: 30_000,
  boughtDay: 1,
  year: 2026,
  miles: 0,
  condition: 1,
}

const chargeback = (extra: Partial<Chargeback> = {}): Chargeback => ({
  day: 1,
  amount: 1000,
  customerName: 'Ann K.',
  kind: 'warranty',
  financeId: null,
  clawback: 0,
  ...extra,
})

/** Closes day 1 with `state`, settling it. */
function settle(state: Partial<ReturnType<typeof game>> = {}) {
  useGame.setState({
    ...initial,
    clock: { day: 1, minute: CLOSE_MINUTE - 1 },
    arrivals: { minutes: [], sources: [], spawned: 0 },
    customers: [],
    ...state,
  })
  game().tickClock({ day: 1, minute: CLOSE_MINUTE })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
  expect(game().dayStats.settled).toBe(true)
}

/** Opens `day` after closing the day before with `state`. */
function openOn(day: number, state: Partial<ReturnType<typeof game>> = {}) {
  game().newGame()
  useGame.setState({
    clock: { day: day - 1, minute: CLOSE_MINUTE },
    customers: [],
    roster: [],
    ...state,
  })
  game().startNextDay()
}

describe('warranty contracts and chargebacks at the sale', () => {
  beforeEach(() => {
    rolled.calls = []
  })

  it('make a contract of an extended warranty, and roll its chargebacks', () => {
    sellWithWarranty()
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'bought' })
    const sale = game().dayStats.sales[0]
    expect(game().contracts).toEqual([
      {
        id: 'contract-1-1',
        customerName: 'Alex B.',
        car: expect.objectContaining({ model: sale.model, price: sale.price, boughtDay: 1 }),
        soldDay: 1,
        endDay: 1 + WARRANTY_DAYS,
        price: 2000,
      },
    ])
    expect(rolled.calls).toHaveLength(1)
    expect(rolled.calls[0].fi).toEqual(sale.fi)
    expect(rolled.calls[0].deal).toEqual({
      day: 1,
      customerName: 'Alex B.',
      tier: 'C',
      financeId: null,
      scale: 1,
    })
    for (const c of game().chargebacks) expect(c.day).toBeGreaterThan(1)
  })
})

describe('chargebacks landing', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('come off cash and the F&I gross on their day, the rest wait', () => {
    settle()
    const plain = { cash: game().cash, gross: totalGross(game().dayStats) }
    const later = chargeback({ day: 9 })
    settle({ chargebacks: [chargeback(), chargeback({ amount: 500, kind: 'reserve' }), later] })
    expect(game().cash).toBe(plain.cash - 1500)
    expect(totalGross(game().dayStats)).toBe(plain.gross - 1500)
    expect(game().dayStats.fi).toMatchObject({ chargebackCount: 2, chargebacks: 1500, clawback: 0 })
    expect(game().monthFi).toMatchObject({ chargebackCount: 2, chargebacks: 1500 })
    expect(game().chargebacks).toEqual([later])
  })

  it('take the finance manager’s share back out of his commissions, while he’s still here', () => {
    const fm = staff('fm-1', 'finance')
    const sale = { commission: 400, financeCommission: 400 } as Sale
    const base = { roster: [fm], dayStats: { ...initial.dayStats, sales: [sale] } }
    settle(base)
    const plain = { cash: game().cash, commissions: game().dayStats.commissions }
    settle({ ...base, chargebacks: [chargeback({ financeId: fm.id, clawback: 150 })] })
    expect(game().dayStats.commissions).toBe(plain.commissions - 150)
    expect(game().dayStats.fi.clawback).toBe(150)
    expect(game().cash).toBe(plain.cash - 1000 + 150)
    // Gone since: he keeps it.
    settle({
      ...base,
      roster: [],
      chargebacks: [chargeback({ financeId: fm.id, clawback: 150 })],
    })
    expect(game().dayStats.fi.clawback).toBe(0)
  })

  it('are told the morning they land', () => {
    openOn(2, { chargebacks: [chargeback({ day: 2 }), chargeback({ day: 2, amount: 840 })] })
    expect(game().notice?.text).toContain('Two chargebacks today: -$1,840')
    expect(game().chargebacks).toHaveLength(2)
  })
})

describe('warranty claims', () => {
  beforeEach(() => useGame.setState(initial, true))

  /** A Monday a while after the contracts were sold. */
  const DAY = (() => {
    for (let d = 60; ; d++) if (calendarOf(d).weekday === 0) return d
  })()
  const contracts: Contract[] = Array.from({ length: 150 }, (_, i) =>
    newContract(`contract-1-${i + 1}`, `Buyer ${i}`, car, 1, 1800),
  )

  it('bring covered cars to the garage, and none without one', () => {
    openOn(DAY, { expansions: garage, contracts })
    const claims = game().serviceVisits.contractIds.filter((id) => id !== null)
    expect(claims.length).toBeGreaterThan(0)
    expect(
      game().serviceVisits.kinds.filter((_, i) => game().serviceVisits.contractIds[i]),
    ).toEqual(claims.map(() => 'repair'))
    openOn(DAY, { contracts })
    expect(game().serviceVisits.contractIds.every((id) => id === null)).toBe(true)
  })

  it('drop contracts that have run out', () => {
    const old = { ...contracts[0], endDay: DAY - 1 }
    openOn(DAY, { contracts: [old, contracts[1]] })
    expect(game().contracts).toEqual([contracts[1]])
  })

  it('are booked free and paid by the warranty company', () => {
    const mechanic = staff('mech-1', 'mechanic')
    openOn(DAY, { expansions: garage, contracts })
    const minute = 9 * 60 + 10
    useGame.setState({
      roster: [mechanic],
      clock: { day: DAY, minute: 9 * 60 },
      arrivals: { minutes: [], sources: [], spawned: 0 },
      clientVisits: [],
      service: { ...game().service, rate: 'premium' },
      serviceVisits: {
        minutes: [minute],
        kinds: ['repair'],
        clientIds: [null],
        contractIds: [contracts[0].id],
        spawned: 0,
      },
      helpOpen: false,
    })
    game().tickClock({ day: DAY, minute })
    const c = game().customers.find((x) => x.service?.contractId)!
    expect(c).toMatchObject({
      name: 'Buyer 0',
      service: { kind: 'repair', car: { model: 'sedan' } },
    })
    game().dispatchCustomer({ type: 'parked', id: c.id })
    useGame.setState({
      activeAction: {
        id: 99,
        targetId: c.id,
        action: 'checkIn',
        phase: 'performing',
        startedAt: 0,
      },
    })
    game().completeAction(99)
    game().answerOffer(c.id)
    const job = game().serviceJobs.find((j) => j.customerId === c.id)!
    expect(job).toMatchObject({ kind: 'repair', labor: 0, parts: 0, contractId: contracts[0].id })
    expect(job.warranty).toBe(warrantyPay(job.partsCost, 'repair'))

    game().staffStartJob(mechanic.id, job.id, 0)
    useGame.setState({
      serviceJobs: game().serviceJobs.map((j) => (j.id === job.id ? { ...j, finding: null } : j)),
    })
    game().tickClock({ day: DAY, minute: minute + 200 })
    const cash = game().cash
    game().serviceCollect(c.id)
    expect(game().cash).toBe(cash + job.warranty - job.partsCost)
    expect(game().dayStats.service).toMatchObject({
      jobs: 1,
      claims: 1,
      contract: job.warranty,
      recalls: 0,
      warranty: 0,
    })
    expect(game().notice?.text).toContain('Our warranty company pays')
  })
})
