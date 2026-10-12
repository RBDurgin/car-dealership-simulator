import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultPerks,
  emptyMonthCsi,
  PROSPECT_DAYS,
  SERVICE_INTERVAL,
  type Client,
} from '../sim/clients'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { createSave } from '../sim/save'
import type { Role } from '../sim/staff'
import { useGame } from './store'

// Customers' answers are random; these tests always get a yes.
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: () => ({ answer: 'accept' }),
}))

const initial = useGame.getState()
const game = () => useGame.getState()

const A = 'customer-a'
const B = 'customer-b'

const shopper = (extra: Partial<Customer> = {}): Customer => ({
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
  credit: null,
  fi: null,
  service: null,
  ...extra,
})

let nextHire = 1
function hired(role: Role, skill = 3): string {
  const template = initial.candidates.find((c) => c.role === role)!
  const id = `hire-${nextHire++}`
  useGame.setState({ candidates: [{ ...template, id, skill, name: `${role} ${id}` }] })
  game().hire(id)
  game().dispatchStaff({ type: 'atPost', id })
  return id
}

/** A salesperson sells lot-car-1 to Alex. */
function sellToAlex(): string {
  const sam = hired('sales')
  expect(game().staffClaim(sam, A)).toBe(true)
  game().staffGreet(sam)
  game().staffOffer(sam)
  game().answerOffer(A)
  game().staffLead(sam)
  game().dispatchCustomer({ type: 'seat', id: A })
  game().staffSign(sam, A)
  return sam
}

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('the client book', () => {
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

  it('starts a new game with an empty book and the default levers', () => {
    game().newGame()
    expect(game().clients).toEqual([])
    expect(game().clientPerks).toEqual(defaultPerks())
    expect(game().appreciation).toBeNull()
    expect(game().monthCsi).toEqual(emptyMonthCsi())
  })

  it('makes a buyer a client, scored, with the car they bought', () => {
    sellToAlex()
    const [alex] = game().clients
    expect(alex).toMatchObject({ name: 'Alex B.', status: 'client', bought: 1 })
    expect(alex.car?.model).toBe(game().inventory.find((c) => c.id === 'lot-car-1')!.model)
    expect(game().dayStats.clients.added).toBe(1)
    expect(game().dayStats.clients.scores).toEqual([
      expect.objectContaining({ clientId: alex.id, outcome: 'bought', score: alex.satisfaction }),
    ])
  })

  it('counts a new-car buyer’s score in the month’s CSI, due for service later', () => {
    sellToAlex()
    const [alex] = game().clients
    expect(game().monthCsi).toEqual({ total: alex.satisfaction, count: 1 })
    expect(alex.serviceDue).toBe(game().clock.day + SERVICE_INTERVAL)
  })

  it('keeps a greeted walk-out as a prospect, but not one nobody greeted', () => {
    const sam = hired('sales')
    game().staffClaim(sam, B)
    game().staffGreet(sam)
    endDay()
    expect(game().clients.map((c) => [c.name, c.status])).toEqual([['Sam C.', 'prospect']])
    expect(game().dayStats.clients.prospects).toBe(1)
    expect(game().clients[0].expires).toBe(game().clock.day + PROSPECT_DAYS)
  })

  it('keeps the book through a save, pruning expired prospects in the morning', () => {
    sellToAlex()
    endDay()
    const day = game().clock.day
    const gone: Client = {
      ...game().clients[0],
      id: 'client-0-0',
      name: 'Kim P.',
      status: 'prospect',
      car: null,
      dueDay: null,
      expires: day,
    }
    useGame.setState({
      clients: [...game().clients, gone],
      clientPerks: { loyaltyDiscount: 0.02, referralFee: 100, receptionCalls: false },
    })
    const save = JSON.parse(JSON.stringify(createSave(game(), 0)))
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().clients.map((c) => c.name)).toEqual(['Alex B.'])
    expect(game().clientPerks).toEqual({
      loyaltyDiscount: 0.02,
      referralFee: 100,
      receptionCalls: false,
    })
  })

  it('plans the same day with or without a book', () => {
    game().newGame()
    endDay()
    const before = useGame.getState()
    game().startNextDay()
    const without = { arrivals: game().arrivals, candidates: game().candidates }

    useGame.setState(before, true)
    withAlexInBook()
    game().startNextDay()
    expect(game().clients).toHaveLength(1)
    expect(game().arrivals).toEqual(without.arrivals)
    expect(game().candidates).toEqual(without.candidates)
  })

  it('brings someone back from the book (dev), as they were, once at a time', () => {
    game().newGame()
    withAlexInBook()
    game().devReturnClient()
    const back = game().customers.filter((c) => c.clientId === 'client-1-0')
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ name: 'Alex B.', variant: 'male-a', source: 'client' })
    // Already on the lot: nobody else to bring.
    const count = game().customers.length
    game().devReturnClient()
    expect(game().customers).toHaveLength(count)
  })
})

/** A book with Alex in it, written straight into the store. */
function withAlexInBook() {
  const alex: Client = {
    id: 'client-1-0',
    name: 'Alex B.',
    variant: 'male-a',
    companion: null,
    archetype: 'regular',
    status: 'client',
    since: 1,
    lastVisit: 1,
    visits: 1,
    bought: 1,
    car: null,
    budget: 30_000,
    preferredModels: ['sedan'],
    lastDeal: null,
    satisfaction: 75,
    reasons: [],
    dueDay: 40,
    expires: null,
    lastCall: null,
    callsThisCycle: 0,
    appointment: null,
    referredBy: null,
    referrals: 0,
    friendsSent: 0,
    thanked: false,
    serviceDue: null,
  }
  useGame.setState({ clients: [alex] })
}
