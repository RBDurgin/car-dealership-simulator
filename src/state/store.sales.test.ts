import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { GUEST_CHAIR_ID, SALES_DESKS } from '../sim/layout'
import { staffAsk } from '../sim/negotiation'
import { FINANCE_FEE, salesCommission, type Role } from '../sim/staff'
import { STARTING_CASH, useGame } from './store'

// Customers' answers are random; these tests always get a yes.
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: () => ({ answer: 'accept' }),
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = A) => game().customers.find((c) => c.id === id)
const car = (id: string) => game().inventory.find((c) => c.id === id)!
const employee = (id: string) => game().roster.find((e) => e.id === id)!

const A = 'customer-a'
const B = 'customer-b'

const shopper = (extra: Partial<Customer> = {}): Customer => ({
  id: A,
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
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
  ...extra,
})

let nextHire = 1
/** Puts a new employee of `role` and `skill` on the payroll, at their post. Returns their id. */
function hired(role: Role, skill = 3): string {
  const template = initial.candidates.find((c) => c.role === role)!
  const id = `hire-${nextHire++}`
  useGame.setState({ candidates: [{ ...template, id, skill, name: `${role} ${id}` }] })
  game().hire(id)
  game().dispatchStaff({ type: 'atPost', id })
  return id
}

/** A salesperson walks over, greets, pitches and gets a yes. */
function talkRound(id: string, customerId = A) {
  expect(game().staffClaim(id, customerId)).toBe(true)
  game().staffGreet(id)
  game().staffOffer(id)
  game().answerOffer(customerId)
}

/** What a salesperson earns selling `id` at MSRP. */
const commissionOn = (id: string) => salesCommission(car(id).msrp, car(id).cost)

describe('AI salespeople', () => {
  beforeEach(() => {
    useGame.setState(
      {
        ...initial,
        customers: [
          shopper(),
          shopper({ id: B, name: 'Sam C.', browseCarIds: ['lot-car-2'], targetCarId: 'lot-car-2' }),
        ],
      },
      true,
    )
  })

  it('sell a car at their own desk and earn a commission', () => {
    const sam = hired('sales')
    talkRound(sam)
    expect(customer()).toMatchObject({ phase: 'following', handlerId: sam, sellerId: sam })
    // Customer quotes are only for the player's own deals.
    expect(game().notice?.text).not.toMatch(/Lead the way/)

    game().staffLead(sam)
    expect(customer()?.chairId).toBe(SALES_DESKS[0].guestChairId)
    game().dispatchCustomer({ type: 'seat', id: A })
    expect(customer()?.phase).toBe('signing')
    game().staffSign(sam, A)

    const price = car('lot-car-1').msrp
    expect(car('lot-car-1').status).toBe('sold')
    expect(game().cash).toBe(STARTING_CASH + price)
    expect(game().dayStats.sales).toEqual([
      expect.objectContaining({
        price,
        soldBy: employee(sam).name,
        signedBy: null,
        msrp: price,
        cost: car('lot-car-1').cost,
        commission: commissionOn('lot-car-1'),
      }),
    ])
    expect(game().notice?.text).toMatch(new RegExp(`${employee(sam).name} sold`))
  })

  it('open at MSRP from average skill, a little under below that', () => {
    const sam = hired('sales', 3)
    const kim = hired('sales', 1)
    game().staffClaim(sam, A)
    game().staffGreet(sam)
    expect(customer()?.phase).toBe('talking')
    game().staffOffer(sam)
    expect(customer()?.offer).toEqual({ carId: 'lot-car-1', price: car('lot-car-1').msrp })
    game().staffClaim(kim, B)
    game().staffGreet(kim)
    game().staffOffer(kim)
    expect(customer(B)?.offer?.price).toBe(staffAsk(1, car('lot-car-2'), null))
    expect(customer(B)?.offer?.price).toBeLessThan(car('lot-car-2').msrp)
  })

  it('come down by skill after a counter, and sell at the agreed price', () => {
    const sam = hired('sales', 3)
    const msrp = car('lot-car-1').msrp
    game().staffClaim(sam, A)
    game().staffGreet(sam)
    game().staffOffer(sam)
    game().dispatchCustomer({ type: 'respond', id: A, answer: 'counter', counter: msrp - 2000 })
    expect(customer()).toMatchObject({ phase: 'talking', handlerId: sam })
    // Back in talking, they pitch again: an average seller gives up 40% of the gap.
    game().staffOffer(sam)
    expect(customer()?.offer?.price).toBe(msrp - 800)
    game().answerOffer(A)
    game().staffLead(sam)
    game().dispatchCustomer({ type: 'seat', id: A })
    game().staffSign(sam, A)
    expect(game().dayStats.sales[0]).toMatchObject({
      price: msrp - 800,
      msrp,
      soldBy: employee(sam).name,
    })
  })

  it('take the counter when green', () => {
    const kim = hired('sales', 1)
    const lot = car('lot-car-1')
    const counter = lot.cost + 1000
    game().staffClaim(kim, A)
    game().staffGreet(kim)
    game().staffOffer(kim)
    game().dispatchCustomer({ type: 'respond', id: A, answer: 'counter', counter })
    game().staffOffer(kim)
    expect(customer()?.offer?.price).toBe(counter)
  })

  it('hand buyers to a free finance manager, and keep the sale to their name', () => {
    const sam = hired('sales')
    const fm = hired('finance')
    talkRound(sam)
    game().staffLead(sam)
    // Straight over to the office: nobody else is with finance.
    expect(customer()).toMatchObject({
      phase: 'following',
      handlerId: fm,
      chairId: GUEST_CHAIR_ID,
      sellerId: sam,
    })
    game().dispatchCustomer({ type: 'seat', id: A })
    game().staffSign(fm, A)

    expect(game().dayStats.sales).toEqual([
      expect.objectContaining({
        soldBy: employee(sam).name,
        signedBy: employee(fm).name,
        commission: commissionOn('lot-car-1') + FINANCE_FEE,
      }),
    ])
  })

  it('use their own desk while finance is busy', () => {
    const sam = hired('sales')
    hired('finance')
    // The player's buyer is already with finance.
    useGame.setState({
      customers: [
        ...game().customers,
        shopper({ id: 'c', phase: 'queued', handlerId: game().roster[1].id }),
      ],
    })
    talkRound(sam)
    game().staffLead(sam)
    expect(customer()).toMatchObject({ handlerId: sam, chairId: SALES_DESKS[0].guestChairId })
  })

  it('never both take the same customer, nor one the player is heading to', () => {
    const sam = hired('sales')
    const kim = hired('sales')
    expect(game().staffClaim(sam, A)).toBe(true)
    expect(game().staffClaim(kim, A)).toBe(false)
    // One customer at a time.
    expect(game().staffClaim(sam, B)).toBe(false)

    game().requestAction(B, 'greet')
    expect(game().activeAction?.targetId).toBe(B)
    expect(game().staffClaim(kim, B)).toBe(false)
  })

  it("keep the player off a customer they're helping", () => {
    const sam = hired('sales')
    game().staffClaim(sam, A)
    game().requestAction(A, 'greet')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/is helping Alex B\./)
  })

  it('get their own desk each', () => {
    const sam = hired('sales')
    const kim = hired('sales')
    talkRound(sam, A)
    talkRound(kim, B)
    game().staffLead(sam)
    game().staffLead(kim)
    expect(customer(A)?.chairId).toBe(SALES_DESKS[0].guestChairId)
    expect(customer(B)?.chairId).toBe(SALES_DESKS[1].guestChairId)
  })

  it('let go mid-pitch leave the customer waiting, but finish a buyer in hand', () => {
    const sam = hired('sales')
    game().staffClaim(sam, A)
    game().staffGreet(sam)
    game().fire(sam)
    expect(customer()).toMatchObject({ phase: 'waiting', handlerId: null })

    const kim = hired('sales')
    talkRound(kim, B)
    game().fire(kim)
    expect(customer(B)).toMatchObject({ phase: 'following', handlerId: kim })
    game().staffLead(kim)
    game().dispatchCustomer({ type: 'seat', id: B })
    game().staffSign(kim, B)
    expect(game().dayStats.sales).toEqual([
      expect.objectContaining({
        soldBy: `sales ${kim}`,
        commission: commissionOn('lot-car-2'),
      }),
    ])
  })

  it('at closing drop the customers they are talking to, finish their buyers, and are paid', () => {
    const sam = hired('sales')
    const kim = hired('sales')
    const wages = employee(sam).wage + employee(kim).wage
    talkRound(sam, A)
    game().staffClaim(kim, B)

    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    expect(customer(B)).toMatchObject({ phase: 'leaving', leaveReason: 'closing' })
    expect(customer(A)?.phase).toBe('following')
    game().staffLead(sam)
    expect(customer(A)?.chairId).toBe(SALES_DESKS[0].guestChairId)
    game().dispatchCustomer({ type: 'seat', id: A })
    game().staffSign(sam, A)
    for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })

    const price = car('lot-car-1').msrp
    expect(game().dayStats).toMatchObject({
      settled: true,
      wages,
      commissions: commissionOn('lot-car-1'),
    })
    expect(game().cash).toBe(STARTING_CASH + price - wages - commissionOn('lot-car-1'))
  })

  it('give up on a car that sold while they talked', () => {
    const sam = hired('sales')
    game().staffClaim(sam, A)
    game().staffGreet(sam)
    game().sellCar('lot-car-1')
    game().staffOffer(sam)
    expect(customer()).toMatchObject({ phase: 'waiting', handlerId: null, offer: null })
  })
})
