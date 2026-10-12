import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Credit } from '../sim/credit'
import { PLAYER_ID, type Customer } from '../sim/customers'
import { dealCustomer, guestChairOf, totalGross } from '../sim/deal'
import { PRODUCTS } from '../sim/fi'
import { MANAGER_DESK } from '../sim/layout'
import { FINANCE_FEE } from '../sim/staff'
import { STARTING_CASH, useGame } from './store'

// Customers' answers are random; these tests always get a yes on the price,
// and whatever `take.chance` says on the products.
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: () => ({ answer: 'accept' }),
}))
const take = vi.hoisted(() => ({ chance: 1 }))
vi.mock('../sim/fi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/fi')>()),
  productTake: () => take.chance,
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = 'customer-a') => game().customers.find((c) => c.id === id)
const car = (id: string) => game().inventory.find((c) => c.id === id)!

const loan = (extra: Partial<Credit> = {}): Credit => ({
  tier: 'A',
  finance: true,
  down: 0.1,
  ...extra,
})

const shopper = (extra: Partial<Customer> = {}): Customer => ({
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
  credit: loan(),
  fi: null,
  service: null,
  ...extra,
})

function perform(targetId: string, action: Parameters<typeof initial.requestAction>[1]) {
  game().requestAction(targetId, action)
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
}

/** Greets, sells, and closes at `desk` (the player's own by default): on to the F&I menu. */
function toMenu(desk = MANAGER_DESK.chairId) {
  perform('customer-a', 'greet')
  perform('customer-a', 'offer')
  game().answerOffer('customer-a')
  game().requestAction(desk, 'closeDeal')
  const id = game().activeAction!.id
  // The world sits them in the guest chair across that desk.
  game().dispatchCustomer({ type: 'seat', id: 'customer-a', chairId: guestChairOf(desk) })
  game().arriveAction(id)
  game().completeAction(id)
}

function seatedFinance(): string {
  const c = game().candidates.find((x) => x.role === 'finance')!
  game().hire(c.id)
  game().dispatchStaff({ type: 'atPost', id: c.id })
  return c.id
}

describe('the F&I menu', () => {
  beforeEach(() => {
    take.chance = 1
  })

  const start = (extra: Partial<Customer> = {}) =>
    useGame.setState({ ...initial, customers: [shopper(extra)] }, true)

  it('opens at the player’s desk once the paperwork is done, in its guest chair', () => {
    start()
    toMenu()
    expect(customer()).toMatchObject({
      phase: 'menu',
      chairId: MANAGER_DESK.guestChairId,
      fi: { lender: 'prime', markup: 0, down: 0.1, presented: 0 },
    })
    expect(car('lot-car-1').status).toBe('available')
  })

  it('signs with the loan and the products taken, and banks the F&I gross', () => {
    start()
    toMenu()
    const price = car('lot-car-1').msrp
    game().fiLender('union', 1.5)
    game().fiPresent('warranty', 2000)
    take.chance = 0
    game().fiPresent('gap', 900)
    // The loan is settled once a product is presented.
    game().fiLender('prime', 2)
    expect(customer()?.fi).toMatchObject({ lender: 'union', markup: 1.5, presented: 2 })
    game().fiSign()
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'bought' })
    const sale = game().dayStats.sales[0]
    expect(sale.fi).toMatchObject({
      financed: true,
      lender: 'union',
      markup: 1.5,
      products: [{ id: 'warranty', price: 2000, cost: 900 }],
      presented: 2,
    })
    expect(sale.fi!.reserve).toBeGreaterThan(0)
    expect(sale.fi!.gross).toBe(sale.fi!.reserve + 1100)
    expect(game().cash).toBe(STARTING_CASH + price + sale.fi!.gross)
    const stats = game().dayStats
    expect(stats.fi).toMatchObject({ financed: 1, cash: 0, menus: 1, sold: { warranty: 1 } })
    expect(totalGross(stats)).toBe(price - sale.cost + sale.fi!.gross)
  })

  it('presents a product turned down again only for less', () => {
    start()
    toMenu()
    take.chance = 0
    game().fiPresent('warranty', 2000)
    game().fiPresent('warranty', 2000)
    expect(customer()?.fi?.presented).toBe(1)
    take.chance = 1
    game().fiPresent('warranty', 1800)
    expect(customer()?.fi?.products).toEqual([
      { id: 'warranty', price: 1800, cost: 810, taken: true },
    ])
  })

  it('offers a cash buyer no loan and no GAP', () => {
    start({ credit: loan({ finance: false, down: 0 }) })
    toMenu()
    expect(customer()?.fi?.lender).toBeNull()
    game().fiPresent('gap', PRODUCTS.gap.low)
    expect(customer()?.fi?.presented).toBe(0)
    game().fiPresent('protection', 400)
    game().fiSign()
    expect(game().dayStats.sales[0].fi).toMatchObject({
      financed: false,
      reserve: 0,
      products: [{ id: 'protection', price: 400 }],
    })
    expect(game().dayStats.fi).toMatchObject({ financed: 0, cash: 1, financedMenus: 0 })
  })

  it('sends home a buyer no lender takes who can’t put more down', () => {
    // Tier D needs 10% down, and their budget is all on the car.
    start({ credit: loan({ tier: 'D', down: 0 }), budget: 1 })
    toMenu()
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'declined' })
    expect(car('lot-car-1').status).toBe('available')
    expect(game().dayStats.fi.declined).toBe(1)
    expect(game().dayStats.sales).toHaveLength(0)
    expect(game().notice?.text).toMatch(/No lender will take/)
  })

  it('saves a declined buyer with more down, or lets them go', () => {
    start({ credit: loan({ tier: 'D', down: 0 }) })
    toMenu()
    expect(customer()).toMatchObject({ phase: 'menu', fi: { lender: null } })
    game().fiSign()
    expect(customer()?.phase).toBe('menu')
    game().fiMoreDown()
    expect(customer()?.fi).toMatchObject({ lender: 'subprime', down: 0.1 })
    game().fiSign()
    // Subprime's fee on tier D comes off the F&I.
    expect(game().dayStats.sales[0].fi).toMatchObject({ lender: 'subprime', fee: 595 })

    start({ credit: loan({ tier: 'D', down: 0 }) })
    toMenu()
    game().fiLetGo()
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'declined' })
    expect(game().dayStats.fi.declined).toBe(1)
  })

  it('sends the buyer back to waiting when the player walks off', () => {
    start()
    toMenu()
    game().walkAway()
    expect(customer()).toMatchObject({ phase: 'waiting', fi: null, handlerId: null })
  })

  it('is spared at closing, and walking off after it sends the buyer home', () => {
    start()
    toMenu()
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    expect(customer()?.phase).toBe('menu')
    game().walkAway()
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'closing' })
  })

  it('doesn’t drain patience', () => {
    start()
    toMenu()
    const left = customer()!.patienceLeft
    game().dispatchCustomer({ type: 'tick', minutes: 30 })
    expect(customer()?.patienceLeft).toBe(left)
  })

  it('runs at the office desk too, with nobody in finance', () => {
    start()
    toMenu('office-chair')
    expect(customer()).toMatchObject({ phase: 'menu', chairId: 'guest-chair' })
  })

  it('at the player’s desk with a finance manager on duty, records products and pays them nothing', () => {
    start()
    seatedFinance()
    // The office desk is theirs: the player hands off there.
    perform('customer-a', 'greet')
    perform('customer-a', 'offer')
    game().answerOffer('customer-a')
    game().requestAction('office-chair', 'closeDeal')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/Hand buyers off/)
    // Their own desk isn't.
    game().requestAction(MANAGER_DESK.chairId, 'closeDeal')
    const id = game().activeAction!.id
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    game().arriveAction(id)
    game().completeAction(id)
    expect(customer()?.phase).toBe('menu')
    expect(dealCustomer(game().customers, PLAYER_ID)?.id).toBe('customer-a')
    game().fiPresent('warranty', 1500)
    game().fiSign()
    const sale = game().dayStats.sales[0]
    expect(sale).toMatchObject({ soldBy: null, signedBy: null, commission: 0 })
    expect(sale.fi?.products).toEqual([{ id: 'warranty', price: 1500, cost: 675 }])
    expect(sale.commission).not.toBe(FINANCE_FEE)
  })
})
