import { beforeEach, describe, expect, it } from 'vitest'
import { SERVICE_BOOST } from '../sim/clientService'
import { clientCarInfo, LAPSE_DAYS, SERVICE_INTERVAL, type Client } from '../sim/clients'
import { CLOSE_MINUTE } from '../sim/clock'
import type { OwnedExpansion } from '../sim/expansions'
import { emptyRival, OPEN_STRENGTH, type Rival } from '../sim/rival'
import { createSave } from '../sim/save'
import { clientJob, GARAGE_EXPANSION, type JobKind } from '../sim/service'
import { wageFor, type Employee } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

const garage: OwnedExpansion[] = [
  { id: 'east-lot', day: 1 },
  { id: GARAGE_EXPANSION, day: 1 },
]

const mechanic: Employee = {
  id: 'mech-1',
  name: 'Mo',
  variant: 'male-c',
  role: 'mechanic',
  skill: 5,
  wage: wageFor('mechanic', 5),
  status: 'atPost',
  fired: false,
  quitting: false,
  xp: 0,
  potential: 5,
  hiredDay: 1,
  raiseAsk: null,
  morale: 70,
  lowDays: 0,
  moraleWhy: [],
  daysOff: [],
  streak: 0,
}

const DAY = 20
const START = 9 * 60

const client = (id: string, extra: Partial<Client> = {}): Client => ({
  id,
  name: 'Alex B.',
  variant: 'female-b',
  companion: null,
  archetype: 'regular',
  status: 'client',
  since: 3,
  lastVisit: 3,
  visits: 1,
  bought: 1,
  car: {
    model: 'truck',
    used: false,
    price: 40_000,
    boughtDay: 3,
    year: 2026,
    miles: 0,
    condition: 0.9,
  },
  budget: 45_000,
  preferredModels: ['truck'],
  lastDeal: null,
  satisfaction: 70,
  reasons: [],
  dueDay: DAY + 3,
  expires: null,
  lastCall: null,
  callsThisCycle: 0,
  appointment: null,
  referredBy: null,
  referrals: 0,
  friendsSent: 0,
  thanked: false,
  serviceDue: DAY,
  chargedBack: false,
  ...extra,
})

/** A garage open on `DAY` with the book's `clients`, and `visits` due in. */
function setUp(clients: Client[], visits: [number, JobKind, string | null][]) {
  game().newGame()
  useGame.setState({
    expansions: garage,
    clock: { day: DAY, minute: START },
    roster: [mechanic],
    clients,
    arrivals: { minutes: [], sources: [], spawned: 0 },
    clientVisits: [],
    serviceVisits: {
      minutes: visits.map((v) => v[0]),
      kinds: visits.map((v) => v[1]),
      clientIds: visits.map((v) => v[2]),
      contractIds: visits.map(() => null),
      spawned: 0,
    },
    helpOpen: false,
  })
}
const tick = (minute: number) => game().tickClock({ day: DAY, minute })
const visitor = () => game().customers.find((c) => c.service)

/** Puts the visitor in the waiting chairs with their job ready to collect. */
function readyToCollect() {
  const c = visitor()!
  const job = {
    ...clientJob('job-1', 'oil', c.id, c.service!.quote, {
      name: c.name,
      model: c.service!.car.model,
      condition: c.service!.car.condition,
    }),
    status: 'ready' as const,
    mechanicId: mechanic.id,
    readyMinute: START + 30,
  }
  useGame.setState({
    serviceJobs: [job],
    customers: game().customers.map((x) =>
      x.id === c.id
        ? {
            ...x,
            phase: 'servicing' as const,
            service: { ...x.service!, parked: true, jobId: job.id, promisedMinute: START + 60 },
          }
        : x,
    ),
  })
  return c.id
}

function pitch(id: string) {
  useGame.setState({
    activeAction: { id: 97, targetId: id, action: 'pitch', phase: 'performing', startedAt: 0 },
  })
  game().completeAction(97)
}

describe('service from the client book', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('brings a client in by name, in the car we sold them', () => {
    const alex = client('client-3-0')
    setUp([alex], [[START + 10, 'oil', alex.id]])
    tick(START + 10)
    const c = visitor()!
    expect(c).toMatchObject({ name: 'Alex B.', clientId: alex.id, variant: 'female-b' })
    expect(c.service!.car).toEqual({ model: 'truck', ...clientCarInfo(alex.car!, DAY) })
  })

  it('skips a client already on the lot, and lets a stranger come for the rest', () => {
    const alex = client('client-3-0')
    setUp(
      [alex],
      [
        [START + 10, 'oil', alex.id],
        [START + 10, 'tires', null],
      ],
    )
    useGame.setState({ customers: [visitorLike(alex.id)] })
    tick(START + 10)
    const served = game().customers.filter((c) => c.service)
    expect(served).toHaveLength(1)
    expect(served[0].clientId).toBeNull()
  })

  it('pleases a client whose car is ready on time, and books their next service', () => {
    const alex = client('client-3-0')
    setUp([alex], [[START + 10, 'oil', alex.id]])
    tick(START + 10)
    const id = readyToCollect()
    game().serviceCollect(id)
    const after = game().clients[0]
    const comeback = game().dayStats.service.comebacks > 0
    expect(after.serviceDue).toBe(DAY + SERVICE_INTERVAL)
    expect(after.satisfaction).toBe(comeback ? 70 + SERVICE_BOOST - 8 : 70 + SERVICE_BOOST)
    expect(after.car!.condition).toBeGreaterThan(alex.car!.condition)
  })

  it('lets the player pitch a trade-up once to a client due soon', () => {
    const alex = client('client-3-0')
    setUp([alex], [[START + 10, 'oil', alex.id]])
    tick(START + 10)
    const id = readyToCollect()
    expect(visitor()!.service!.pitch).toBe(true)
    pitch(id)
    expect(visitor()!.service!.pitch).toBe(false)
    const after = game().clients[0]
    if (after.appointment) {
      expect(after.appointment).toMatchObject({ day: DAY + 1, reason: 'tradeUp' })
      expect(after.dueDay).toBe(DAY + 1)
      expect(game().dayStats.clients.booked).toBe(1)
      expect(game().notice?.text).toContain('come back tomorrow')
    } else {
      expect(after.dueDay).toBe(alex.dueDay)
      expect(game().notice?.text).toContain('for now')
    }
    // Once a visit.
    const clients = game().clients
    pitch(id)
    expect(game().clients).toBe(clients)
  })
})

const open = (extra: Partial<Rival> = {}): Rival => ({
  ...emptyRival(),
  status: 'open',
  generation: 1,
  openDay: 1,
  strength: OPEN_STRENGTH,
  undercut: 0.04,
  ...extra,
})

/** Starts `day`'s morning from a save of the day before, as a resumed game does. */
function startDay(day: number) {
  game().loadGame({ ...createSave(game(), 0), day: day - 1 })
}

describe('clients who go to Nazma’s', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('leave the book for his lot while he’s open, counted and named the next morning', () => {
    const day = 40
    const lapsing = Array.from({ length: 30 }, (_, i) =>
      client(`client-1-${i}`, {
        name: `Person ${i}`,
        dueDay: day - LAPSE_DAYS - 1,
        satisfaction: 40,
      }),
    )
    useGame.setState({
      clients: lapsing,
      rival: open(),
      clock: { day: day - 1, minute: CLOSE_MINUTE },
    })
    startDay(day)
    const gone = game().clients.filter((c) => c.status === 'defected')
    expect(gone.length).toBeGreaterThan(0)
    expect(game().clients.filter((c) => c.status === 'lapsed')).toHaveLength(30 - gone.length)
    expect(game().dayStats.clients.defected).toBe(gone.length)
    expect(game().notice?.text).toContain('took their business to')
  })

  it('lapse quietly while he isn’t open', () => {
    const day = 40
    const lapsing = Array.from({ length: 30 }, (_, i) =>
      client(`client-1-${i}`, { dueDay: day - LAPSE_DAYS - 1, satisfaction: 40 }),
    )
    useGame.setState({ clients: lapsing })
    startDay(day)
    expect(game().clients.every((c) => c.status === 'lapsed')).toBe(true)
    expect(game().dayStats.clients.defected).toBe(0)
  })
})

/** Just enough of a customer to be someone from the book on the lot. */
function visitorLike(clientId: string) {
  return {
    id: 'customer-x',
    name: 'Alex B.',
    variant: 'female-b' as const,
    archetype: 'regular' as const,
    source: 'client' as const,
    companion: null,
    budget: 40_000,
    preferredModels: ['truck' as const],
    patience: 120,
    patienceLeft: 120,
    browseCarIds: [],
    browsed: 0,
    targetCarId: null,
    offer: null,
    expect: 0.04,
    haggle: null,
    phase: 'browsing' as const,
    leaveReason: null,
    handlerId: null,
    chairId: null,
    sellerId: null,
    vehicle: null,
    selling: null,
    trade: null,
    rivalQuote: null,
    clientId,
    loyaltyCut: 0,
    referredBy: null,
    guest: false,
    credit: null,
    fi: null,
    wantsDrive: false,
    drive: null,
    service: null,
  }
}
