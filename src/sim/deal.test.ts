import { describe, expect, it } from 'vitest'
import { PLAYER_ID, type Customer } from './customers'
import {
  actionBlocker,
  budgetHint,
  callNextBuyer,
  customerActions,
  customerInteractable,
  dealCustomer,
  deskActions,
  emptyStats,
  employeeActions,
  guestChairBusy,
  hasBuyersInHand,
  inConversation,
  recordDepartures,
  revenue,
  salesBySeller,
  walkOuts,
} from './deal'
import { Grid } from './grid'
import { GUEST_CHAIR_ID } from './layout'
import type { Employee } from './staff'

/** A finance manager at the desk. */
const fm: Employee = {
  id: 'staff-1',
  name: 'Jordan K.',
  variant: 'female-a',
  role: 'finance',
  skill: 3,
  wage: 215,
  status: 'atPost',
  fired: false,
}

const base: Customer = {
  id: 'c1',
  name: 'Alex B.',
  variant: 'male-a',
  budget: 41_500,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: ['lot-car-1'],
  browsed: 0,
  targetCarId: 'lot-car-1',
  offer: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
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

  it('adds up revenue', () => {
    const sale = {
      customerName: 'A',
      carId: 'x',
      model: 'sedan' as const,
      minute: 600,
      soldBy: null,
      signedBy: null,
      commission: 0,
    }
    const stats = {
      ...emptyStats(),
      sales: [
        { ...sale, price: 1000 },
        { ...sale, price: 2500 },
      ],
    }
    expect(revenue(stats)).toBe(3500)
    expect(revenue(emptyStats())).toBe(0)
  })

  it('breaks the sales down by seller, the player first', () => {
    const sale = (price: number, soldBy: string | null, commission = 0) => ({
      customerName: 'A',
      carId: 'x',
      model: 'sedan' as const,
      minute: 600,
      price,
      soldBy,
      signedBy: null,
      commission,
    })
    const stats = {
      ...emptyStats(),
      sales: [sale(30_000, 'Kim P.', 900), sale(20_000, null), sale(10_000, 'Kim P.', 500)],
    }
    expect(salesBySeller(stats)).toEqual([
      { seller: null, cars: 1, revenue: 20_000, commission: 0 },
      { seller: 'Kim P.', cars: 2, revenue: 40_000, commission: 1400 },
    ])
    expect(salesBySeller(emptyStats())).toEqual([])
  })
})
