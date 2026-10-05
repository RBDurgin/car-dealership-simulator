import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { PLAYER_ID, type Customer } from '../sim/customers'
import { dealCustomer } from '../sim/deal'
import { FINANCE_FEE } from '../sim/staff'
import { STARTING_CASH, useGame } from './store'

// Customers' answers are random; these tests always get a yes.
vi.mock('../sim/customers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/customers')>()),
  decide: () => true,
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = (id = 'customer-a') => game().customers.find((c) => c.id === id)
const car = (id: string) => game().inventory.find((c) => c.id === id)!

const shopper = (extra: Partial<Customer> = {}): Customer => ({
  id: 'customer-a',
  name: 'Alex B.',
  variant: 'male-a',
  budget: 200_000,
  preferredModels: ['sedan'],
  patience: 120,
  patienceLeft: 120,
  browseCarIds: ['lot-car-1'],
  browsed: 1,
  targetCarId: 'lot-car-1',
  offer: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
  ...extra,
})

/** Runs an action to the end, as the player and the timers would. */
function perform(targetId: string, action: Parameters<typeof initial.requestAction>[1]) {
  game().requestAction(targetId, action)
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
}

/** Greets, offers and gets a yes: the customer follows the player. */
function sell(id: string) {
  perform(id, 'greet')
  perform(id, 'offer')
  game().answerOffer(id)
}

/** Hires today's finance applicant and sits them at the desk. Returns their id. */
function seatedFinance(): string {
  const c = game().candidates.find((x) => x.role === 'finance')!
  game().hire(c.id)
  game().dispatchStaff({ type: 'atPost', id: c.id })
  return c.id
}

const B = 'customer-b'

describe('handing off to finance', () => {
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

  it('frees the player as soon as the buyer is handed over', () => {
    const fm = seatedFinance()
    sell('customer-a')
    perform('office-chair', 'handOff')
    // Straight over to the guest chair: nobody else is signing.
    expect(customer()).toMatchObject({ phase: 'following', handlerId: fm })
    expect(game().activeAction).toBeNull()
    expect(dealCustomer(game().customers, PLAYER_ID)).toBeNull()
    expect(game().notice?.text).toMatch(/take it from here/)
    // And can greet someone else without dropping the sale.
    perform(B, 'greet')
    expect(customer(B)?.phase).toBe('talking')
    expect(customer()?.phase).toBe('following')
  })

  it('finance signs the paperwork, banks the sale and earns a fee', () => {
    const fm = seatedFinance()
    const name = game().roster[0].name
    sell('customer-a')
    perform('office-chair', 'handOff')
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    expect(customer()?.phase).toBe('signing')
    game().staffSign(fm, 'customer-a')
    const price = car('lot-car-1').msrp
    expect(car('lot-car-1').status).toBe('sold')
    expect(game().cash).toBe(STARTING_CASH + price)
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'bought' })
    expect(game().dayStats.sales).toEqual([
      expect.objectContaining({
        carId: 'lot-car-1',
        price,
        signedBy: name,
        commission: FINANCE_FEE,
      }),
    ])
    expect(game().notice?.text).toMatch(new RegExp(`${name} sold`))
  })

  it('queues the next buyer in the lounge and calls them when the desk frees up', () => {
    const fm = seatedFinance()
    sell('customer-a')
    perform('office-chair', 'handOff')
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    sell(B)
    perform('office-chair', 'handOff')
    expect(customer(B)).toMatchObject({ phase: 'queued', handlerId: fm })
    expect(game().notice?.text).toMatch(/wait in the lounge/)

    game().staffSign(fm, 'customer-a')
    expect(customer(B)?.phase).toBe('following')
    game().dispatchCustomer({ type: 'seat', id: B })
    game().staffSign(fm, B)
    expect(game().dayStats.sales).toHaveLength(2)
  })

  it('ignores a signature for someone finance is not handling', () => {
    const fm = seatedFinance()
    sell('customer-a')
    game().staffSign(fm, 'customer-a')
    expect(customer()?.phase).toBe('following')
    expect(game().dayStats.sales).toHaveLength(0)
  })

  it('leaves the paperwork to finance, and the player signs when there is none', () => {
    seatedFinance()
    sell('customer-a')
    game().requestAction('office-chair', 'closeDeal')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/Hand buyers off/)

    useGame.setState({ roster: [] })
    game().requestAction('office-chair', 'closeDeal')
    const id = game().activeAction!.id
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    game().arriveAction(id)
    game().completeAction(id)
    expect(game().dayStats.sales).toEqual([
      expect.objectContaining({ signedBy: null, commission: 0 }),
    ])
  })

  it("won't hand off without a finance manager", () => {
    sell('customer-a')
    game().requestAction('office-chair', 'handOff')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/No finance manager/)
  })

  it('finishes the lounge queue after closing, and pays the fees with payroll', () => {
    const fm = seatedFinance()
    const wage = game().roster[0].wage
    sell('customer-a')
    perform('office-chair', 'handOff')
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    sell(B)
    perform('office-chair', 'handOff')

    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    expect(customer()?.phase).toBe('signing')
    expect(customer(B)?.phase).toBe('queued')
    game().staffSign(fm, 'customer-a')
    game().dispatchCustomer({ type: 'seat', id: B })
    game().staffSign(fm, B)
    for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })

    const revenue = car('lot-car-1').msrp + car('lot-car-2').msrp
    expect(game().dayStats).toMatchObject({
      settled: true,
      wages: wage,
      commissions: 2 * FINANCE_FEE,
    })
    expect(game().cash).toBe(STARTING_CASH + revenue - wage - 2 * FINANCE_FEE)
  })

  it('a finance manager let go mid-deal still finishes the paperwork', () => {
    const fm = seatedFinance()
    sell('customer-a')
    perform('office-chair', 'handOff')
    game().dispatchCustomer({ type: 'seat', id: 'customer-a' })
    game().fire(fm)
    expect(game().notice?.text).toMatch(/finish their paperwork/)
    game().staffSign(fm, 'customer-a')
    expect(game().dayStats.sales).toHaveLength(1)
    expect(game().dayStats.sales[0].commission).toBe(FINANCE_FEE)
  })
})
