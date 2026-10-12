import { beforeEach, describe, expect, it } from 'vitest'
import type { Credit } from '../sim/credit'
import type { Customer } from '../sim/customers'
import { salesBySeller, salesByFinance } from '../sim/deal'
import { emptyFiStats, staffMarkup, staffPlan } from '../sim/fi'
import { GUEST_CHAIR_ID, SALES_DESKS } from '../sim/layout'
import {
  financeCommission,
  financeSeconds,
  FI_PRODUCT_SECONDS,
  salesCommission,
  type Role,
} from '../sim/staff'
import { financePaperwork } from './derived'
import { STARTING_CASH, useGame } from './store'

const A = 'customer-a'
const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = A) => game().customers.find((c) => c.id === id)
const car = (id: string) => game().inventory.find((c) => c.id === id)!
const employee = (id: string) => game().roster.find((e) => e.id === id)!

const loan = (extra: Partial<Credit> = {}): Credit => ({
  tier: 'A',
  finance: true,
  down: 0.1,
  ...extra,
})

/** A buyer who agreed to `lot-car-1` at its sticker, sat at `chairId` with `handlerId`. */
const buyer = (handlerId: string, chairId: string, extra: Partial<Customer> = {}): Customer => ({
  id: A,
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
  offer: { carId: 'lot-car-1', price: car('lot-car-1').msrp },
  expect: 0.04,
  haggle: null,
  phase: 'signing',
  leaveReason: null,
  handlerId,
  chairId,
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

/** Seats `c` across from their handler. */
const seat = (c: Customer) => useGame.setState({ customers: [c] })

describe('the finance manager at the menu', () => {
  beforeEach(() => useGame.setState({ ...initial }, true))

  it('runs the menu by his skill and earns a share of its gross', () => {
    const fm = hired('finance', 4)
    seat(buyer(fm, GUEST_CHAIR_ID))
    const c = customer()!
    const price = c.offer!.price
    const plan = staffPlan(4, c, price)!
    game().staffSign(fm, A)

    const sale = game().dayStats.sales[0]
    expect(sale.signedBy).toBe(employee(fm).name)
    expect(sale.fi).toMatchObject({
      financed: true,
      lender: plan.deal.lender,
      markup: staffMarkup(4, 'A'),
      presented: plan.presents.length,
    })
    expect(sale.fi!.reserve).toBeGreaterThan(0)
    expect(sale.commission).toBe(financeCommission(sale.fi!.gross))
    expect(sale.financeCommission).toBe(sale.commission)
    expect(game().cash).toBe(STARTING_CASH + price + sale.fi!.gross)
    expect(game().dayStats.fi).toMatchObject({ financed: 1, menus: 1, financedMenus: 1 })
    expect(game().monthFi).toEqual(game().dayStats.fi)
    // His row in the summary, and the player's has none of it.
    expect(salesByFinance(game().dayStats)).toEqual([
      { name: employee(fm).name, deals: 1, fi: sale.fi!.gross, commission: sale.commission },
    ])
    expect(salesBySeller(game().dayStats)[0]).toMatchObject({ seller: null, commission: 0, fi: 0 })
  })

  it('takes longer over the paperwork for each product he presents', () => {
    const fm = hired('finance')
    const c = buyer(fm, GUEST_CHAIR_ID)
    const presents = staffPlan(3, c, c.offer!.price)!.presents.length
    expect(presents).toBeGreaterThan(0)
    expect(financePaperwork(game(), c, employee(fm))).toBe(
      financeSeconds(3) + presents * FI_PRODUCT_SECONDS,
    )
  })

  it('gets a buyer no lender takes a loan with more down', () => {
    const fm = hired('finance')
    seat(buyer(fm, GUEST_CHAIR_ID, { credit: loan({ tier: 'D', down: 0 }) }))
    game().staffSign(fm, A)
    const sale = game().dayStats.sales[0]
    expect(sale.fi).toMatchObject({ financed: true, lender: 'subprime' })
    expect(game().dayStats.fi.declined).toBe(0)
  })

  it('lets one go who can’t put more down', () => {
    const fm = hired('finance')
    const price = car('lot-car-1').msrp
    seat(buyer(fm, GUEST_CHAIR_ID, { budget: price, credit: loan({ tier: 'D', down: 0 }) }))
    game().staffSign(fm, A)
    expect(game().dayStats.sales).toEqual([])
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'declined' })
    expect(game().dayStats.fi.declined).toBe(1)
    expect(game().monthFi.declined).toBe(1)
    expect(car('lot-car-1').status).toBe('available')
  })
})

describe('a salesperson at their own desk', () => {
  beforeEach(() => useGame.setState({ ...initial }, true))

  const desk = SALES_DESKS[0].guestChairId

  it('arranges the loan at the buy rate and presents nothing', () => {
    const sam = hired('sales')
    seat(buyer(sam, desk, { sellerId: sam }))
    const price = customer()!.offer!.price
    game().staffSign(sam, A)
    const sale = game().dayStats.sales[0]
    expect(sale.fi).toMatchObject({
      financed: true,
      lender: 'prime',
      markup: 0,
      reserve: 0,
      products: [],
      presented: 0,
      gross: 0,
    })
    expect(sale.commission).toBe(salesCommission(price, car('lot-car-1').cost))
    expect(game().dayStats.fi).toEqual({ ...emptyFiStats(), financed: 1 })
  })

  it('sends a buyer no lender takes at the buy rate over to finance', () => {
    const sam = hired('sales')
    const fm = hired('finance')
    seat(buyer(sam, desk, { sellerId: sam, credit: loan({ tier: 'D', down: 0 }) }))
    game().staffSign(sam, A)
    expect(game().dayStats.sales).toEqual([])
    // Finance is free, so they're called straight over to his desk.
    expect(customer()).toMatchObject({
      phase: 'following',
      handlerId: fm,
      chairId: GUEST_CHAIR_ID,
      sellerId: sam,
    })
    expect(game().notice?.text).toMatch(/Over to finance/)
  })

  it('lets them go with nobody in finance', () => {
    const sam = hired('sales')
    seat(buyer(sam, desk, { sellerId: sam, credit: loan({ tier: 'D', down: 0 }) }))
    game().staffSign(sam, A)
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'declined' })
    expect(game().dayStats.fi.declined).toBe(1)
    expect(game().notice?.text).toMatch(/no finance manager/)
  })
})
