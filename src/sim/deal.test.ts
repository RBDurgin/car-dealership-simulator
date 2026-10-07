import { describe, expect, it } from 'vitest'
import { PLAYER_ID, type Customer } from './customers'
import {
  averageDiscount,
  actionBlocker,
  budgetHint,
  callNextBuyer,
  customerActions,
  customerInteractable,
  dealCustomer,
  deskActions,
  costOfSales,
  emptyStats,
  employeeActions,
  grossProfit,
  guestChairBusy,
  hasBuyersInHand,
  inConversation,
  netIncome,
  recordDepartures,
  missedSummary,
  recordMissed,
  recordVisitors,
  revenue,
  salesBySeller,
  salesBySource,
  theftLoss,
  type Sale,
  walkOuts,
} from './deal'
import { Grid } from './grid'
import { buildInventory } from './inventory'
import { GUEST_CHAIR_ID } from './layout'
import type { Source } from './marketing'
import { createRng } from './rng'
import type { Employee } from './staff'

/** A finance manager at the desk. */
const fm: Employee = {
  id: 'staff-1',
  name: 'Jordan K.',
  variant: 'female-e',
  role: 'finance',
  skill: 3,
  wage: 215,
  status: 'atPost',
  fired: false,
  quitting: false,
}

const base: Customer = {
  id: 'c1',
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 41_500,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: ['lot-car-1'],
  browsed: 0,
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
}

const at = (phase: Customer['phase'], extra: Partial<Customer> = {}): Customer => ({
  ...base,
  phase,
  ...extra,
})
/** A customer in a deal with the player. */
const mine = (phase: Customer['phase'], extra: Partial<Customer> = {}): Customer =>
  at(phase, { handlerId: PLAYER_ID, ...extra })

describe('customerActions', () => {
  it('offers a greeting while browsing or waiting, an offer while talking', () => {
    expect(customerActions(at('browsing'))).toEqual(['greet'])
    expect(customerActions(at('waiting'))).toEqual(['greet'])
    expect(customerActions(at('talking'))).toEqual(['offer'])
  })

  it('offers nothing while arriving, mid-deal or leaving', () => {
    for (const phase of ['arriving', 'considering', 'following', 'signing', 'leaving'] as const) {
      expect(customerActions(at(phase)), phase).toEqual([])
    }
  })
})

describe('dealCustomer', () => {
  it('finds whoever the player is dealing with', () => {
    const list = [at('waiting'), mine('following', { id: 'c2' }), at('leaving', { id: 'c3' })]
    expect(dealCustomer(list, PLAYER_ID)?.id).toBe('c2')
    expect(dealCustomer([at('waiting')], PLAYER_ID)).toBeNull()
  })

  it('keeps each handler to their own customer', () => {
    const list = [at('signing', { id: 'c2', handlerId: 'staff-1' }), mine('talking', { id: 'c3' })]
    expect(dealCustomer(list, PLAYER_ID)?.id).toBe('c3')
    expect(dealCustomer(list, 'staff-1')?.id).toBe('c2')
    expect(dealCustomer(list, 'staff-2')).toBeNull()
  })

  it("counts only the player's talking and considering as a conversation", () => {
    expect(inConversation([mine('talking')])).toBe(true)
    expect(inConversation([mine('considering')])).toBe(true)
    expect(inConversation([mine('following')])).toBe(false)
    expect(inConversation([at('talking', { handlerId: 'staff-1' })])).toBe(false)
    expect(inConversation([])).toBe(false)
  })
})

describe('customerInteractable', () => {
  it('is approached from the tiles around where they stand', () => {
    const grid = new Grid(5, 5)
    grid.setBlocked(2, 1)
    const it = customerInteractable(grid, at('waiting'), { tx: 2, tz: 2 })
    expect(it).toMatchObject({ id: 'c1', kind: 'customer', name: 'Alex B.', actions: ['greet'] })
    expect(it.rect).toEqual({ tx: 2, tz: 2, w: 1, h: 1 })
    expect(it.approachTiles).toHaveLength(3)
    expect(it.approachTiles).not.toContainEqual({ tx: 2, tz: 1 })
  })
})

describe('actionBlocker', () => {
  it('allows customer actions that fit their phase', () => {
    expect(actionBlocker('greet', 'c1', [at('waiting')], [], [])).toBeNull()
    expect(actionBlocker('offer', 'c1', [mine('talking')], [], [])).toBeNull()
  })

  it('blocks customer actions once they have left or moved on', () => {
    expect(actionBlocker('greet', 'c1', [], [], [])).toMatch(/left/)
    expect(actionBlocker('greet', 'c1', [at('leaving')], [], [])).toMatch(/Alex B\. left/)
    expect(actionBlocker('offer', 'c1', [at('waiting')], [], [])).toMatch(/busy/)
  })

  it('blocks customer actions on someone staff are looking after', () => {
    const c = at('talking', { handlerId: 'staff-1' })
    expect(actionBlocker('offer', 'c1', [c], [], [])).toMatch(/being helped/)
  })

  it("only allows closing a deal with the player's buyer following or seated", () => {
    expect(actionBlocker('closeDeal', 'office-chair', [mine('talking')], [], [])).not.toBeNull()
    expect(actionBlocker('closeDeal', 'office-chair', [mine('following')], [], [])).toBeNull()
    expect(actionBlocker('closeDeal', 'office-chair', [mine('signing')], [], [])).toBeNull()
    const theirs = at('signing', { handlerId: 'staff-1' })
    expect(actionBlocker('closeDeal', 'office-chair', [theirs], [], [])).not.toBeNull()
  })

  it('leaves the paperwork to a finance manager on duty', () => {
    const buyer = [mine('following')]
    expect(actionBlocker('closeDeal', 'office-chair', buyer, [fm], [])).toMatch(/Hand buyers off/)
    expect(actionBlocker('handOff', 'office-chair', buyer, [fm], [])).toBeNull()
    expect(actionBlocker('handOff', 'office-chair', buyer, [], [])).toMatch(/No finance/)
    expect(actionBlocker('handOff', 'office-chair', [mine('talking')], [fm], [])).toMatch(/Nobody/)
  })

  it('keeps the player off the desk while a let-go finance manager finishes up', () => {
    const list = [mine('following'), at('queued', { id: 'c2', handlerId: fm.id })]
    const fired = { ...fm, fired: true, status: 'leaving' as const }
    expect(actionBlocker('closeDeal', 'office-chair', list, [fired], [])).toMatch(/still using/)
  })

  it('never blocks the furniture actions', () => {
    expect(actionBlocker('sit', 'office-chair', [], [], [])).toBeNull()
    expect(actionBlocker('getCoffee', 'coffee-machine', [], [], [])).toBeNull()
  })
})

describe('the finance desk', () => {
  it('offers a hand-off while finance is on duty, otherwise the chair itself', () => {
    expect(deskActions([fm])).toEqual(['handOff'])
    expect(deskActions([{ ...fm, status: 'arriving' }])).toEqual(['handOff'])
    expect(deskActions([])).toEqual(['sit', 'closeDeal'])
    expect(deskActions([{ ...fm, status: 'leaving' }])).toEqual(['sit', 'closeDeal'])
  })

  it('takes hand-offs from the finance manager on duty too', () => {
    expect(employeeActions(fm, [fm])).toEqual(['handOff', 'inspect'])
    const left = { ...fm, status: 'leaving' as const }
    expect(employeeActions(left, [left])).toEqual(['inspect'])
    const porter = { ...fm, id: 'staff-2', role: 'porter' as const }
    expect(employeeActions(porter, [fm, porter])).toEqual(['inspect'])
  })

  it('calls the first buyer in the lounge once the guest chair is free', () => {
    const queued = (id: string) => at('queued', { id, handlerId: fm.id })
    const busy = [
      at('signing', { handlerId: fm.id, chairId: GUEST_CHAIR_ID }),
      queued('c2'),
      queued('c3'),
    ]
    expect(guestChairBusy(busy)).toBe(true)
    expect(callNextBuyer(busy)).toBe(busy)

    const free = [at('leaving', { leaveReason: 'bought' }), queued('c2'), queued('c3')]
    expect(guestChairBusy(free)).toBe(false)
    const called = callNextBuyer(free)
    expect(called.map((c) => c.phase)).toEqual(['leaving', 'following', 'queued'])
    // On the way to the chair, they hold it.
    expect(guestChairBusy(called)).toBe(true)
    expect(callNextBuyer(called)).toBe(called)
  })

  it("doesn't count the player's follower as holding the chair", () => {
    expect(guestChairBusy([mine('following')])).toBe(false)
  })

  it('knows who has buyers in hand', () => {
    const list = [at('queued', { handlerId: fm.id }), at('leaving', { id: 'c2', handlerId: null })]
    expect(hasBuyersInHand(list, fm.id)).toBe(true)
    expect(hasBuyersInHand([at('leaving')], fm.id)).toBe(false)
  })
})

describe('budgetHint', () => {
  it('rounds the budget to the nearest $5k', () => {
    expect(budgetHint(at('talking', { budget: 41_500 }))).toBe(40_000)
    expect(budgetHint(at('talking', { budget: 43_000 }))).toBe(45_000)
    expect(budgetHint(at('talking', { budget: 1_000 }))).toBe(5_000)
  })
})

describe('day stats', () => {
  it('counts each walk-out once, by reason, and leaves buyers to the sales log', () => {
    const prev = [at('waiting'), at('waiting', { id: 'c2' }), at('signing', { id: 'c3' })]
    const next = [
      at('leaving', { leaveReason: 'impatient' }),
      at('leaving', { id: 'c2', leaveReason: 'refused' }),
      at('leaving', { id: 'c3', leaveReason: 'bought' }),
    ]
    const stats = recordDepartures(emptyStats(), prev, next)
    expect(stats).toMatchObject({ impatient: 1, refused: 1, closing: 0 })
    expect(walkOuts(stats)).toBe(2)
    // Already leaving last time: not counted again.
    expect(recordDepartures(stats, next, next)).toBe(stats)
  })

  it('counts customers who arrive already leaving', () => {
    const stats = recordDepartures(emptyStats(), [], [at('leaving', { leaveReason: 'closing' })])
    expect(stats.closing).toBe(1)
  })

  const sale = (price: number, cost = 0, source: Source = 'regular'): Sale => ({
    customerName: 'A',
    carId: 'x',
    model: 'sedan' as const,
    price,
    msrp: price,
    cost,
    minute: 600,
    soldBy: null,
    signedBy: null,
    commission: 0,
    source,
  })

  it('adds up revenue, cost and gross profit', () => {
    const stats = { ...emptyStats(), sales: [sale(30_000, 27_000), sale(25_000, 22_500)] }
    expect(revenue(stats)).toBe(55_000)
    expect(costOfSales(stats)).toBe(49_500)
    expect(grossProfit(stats)).toBe(5_500)
    expect(revenue(emptyStats())).toBe(0)
    expect(grossProfit(emptyStats())).toBe(0)
  })

  it('nets gross profit less staff costs, interest, ads and improvements, plus the owner bonus', () => {
    const stats = {
      ...emptyStats(),
      sales: [sale(30_000, 27_000)],
      wages: 400,
      commissions: 750,
      interest: 160,
      marketing: 1_200,
      improvements: 3_000,
      owner: { goal: { kind: 'sales' as const, count: 1 }, met: true, bonus: 1_500, line: '' },
    }
    expect(netIncome(stats)).toBe(3_000 - 400 - 750 - 160 - 1_200 - 3_000 + 1_500)
  })

  it('writes off stolen stock, floored or not', () => {
    const stats = {
      ...emptyStats(),
      sales: [sale(30_000, 27_000)],
      nazma: {
        ...emptyStats().nazma,
        stolen: [
          { model: 'suv' as const, cost: 36_000, floored: true },
          { model: 'sedan' as const, cost: 22_000, floored: false },
        ],
      },
    }
    expect(theftLoss(emptyStats())).toBe(0)
    expect(theftLoss(stats)).toBe(58_000)
    expect(netIncome(stats)).toBe(3_000 - 58_000)
  })

  it('counts visitors by what brought them in', () => {
    const stats = recordVisitors(emptyStats(), [
      base,
      { ...base, source: 'tv' },
      { ...base, source: 'tv' },
      { ...base, source: 'walk-in' },
    ])
    expect(stats).toMatchObject({ visitors: 4, walkIns: 1 })
    expect(stats.bySource).toEqual({ regular: 1, tv: 2, 'walk-in': 1 })
    const none = emptyStats()
    expect(recordVisitors(none, [])).toBe(none)
  })

  it('tallies visitors, cars and gross by source, busiest first', () => {
    const stats = {
      ...emptyStats(),
      bySource: { regular: 2, tv: 3 },
      sales: [sale(30_000, 27_000, 'tv'), sale(20_000, 18_000, 'tv'), sale(25_000, 22_000)],
    }
    expect(salesBySource(stats)).toEqual([
      { source: 'tv', visitors: 3, cars: 2, gross: 5_000 },
      { source: 'regular', visitors: 2, cars: 1, gross: 3_000 },
    ])
  })

  it('tallies customers who find none of their body types in stock, by first choice', () => {
    const stock = buildInventory(createRng(1)).filter(
      (c) => c.model !== 'truck' && c.model !== 'van',
    )
    const wants = (...preferredModels: Customer['preferredModels']) => ({
      ...base,
      preferredModels,
    })
    const stats = recordMissed(
      emptyStats(),
      [wants('truck', 'van'), wants('truck'), wants('van', 'sedan'), wants('van')],
      stock,
    )
    expect(stats.missed).toEqual({ truck: 2, van: 1 })
    const none = emptyStats()
    expect(recordMissed(none, [wants('sedan')], stock)).toBe(none)
  })

  it('sums up missed demand, most asked-for first', () => {
    expect(missedSummary({ van: 1, suv: 2 })).toBe('Summit Ridge ×2, Summit Hauler ×1')
    expect(missedSummary({})).toBe('')
  })

  it('breaks the sales down by seller, the player first', () => {
    const sale = (price: number, soldBy: string | null, commission = 0, msrp = price) => ({
      customerName: 'A',
      carId: 'x',
      model: 'sedan' as const,
      msrp,
      cost: msrp - 3_000,
      minute: 600,
      price,
      soldBy,
      signedBy: null,
      commission,
      source: 'regular' as const,
    })
    const stats = {
      ...emptyStats(),
      sales: [sale(28_000, 'Kim P.', 500, 30_000), sale(20_000, null), sale(10_000, 'Kim P.', 750)],
    }
    const tallies = salesBySeller(stats)
    expect(tallies).toEqual([
      { seller: null, cars: 1, revenue: 20_000, msrp: 20_000, gross: 3_000, commission: 0 },
      { seller: 'Kim P.', cars: 2, revenue: 38_000, msrp: 40_000, gross: 4_000, commission: 1250 },
    ])
    expect(tallies.map(averageDiscount)).toEqual([0, 0.05])
    expect(salesBySeller(emptyStats())).toEqual([])
  })
})
