import { describe, expect, it } from 'vitest'
import { WASH_BELOW } from './cleanliness'
import { PLAYER_ID, type Customer } from './customers'
import { buildInventory, sellCar, type InventoryCar } from './inventory'
import { GUARD_PATROL_TILES, GUEST_CHAIR_ID, patrolTiles, SALES_DESKS } from './layout'
import { createRng } from './rng'
import { wageFor, type Employee, type Role } from './staff'
import {
  EARLY_GREET_SKILL,
  guardSight,
  leadChoice,
  nextGuardTask,
  nextPorterTask,
  nextSalesTask,
  mechanicWorking,
  nextMechanicTask,
  pickSalesCustomer,
  salesChairFor,
} from './staffAi'
import { reconJob, type ServiceJob } from './service'

const shopper = (id: string, extra: Partial<Customer> = {}): Customer => ({
  id,
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 40_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
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
  ...extra,
})

const staff = (id: string, role: Role, over: Partial<Employee> = {}): Employee => ({
  id,
  name: `${id} K.`,
  variant: 'male-c',
  role,
  skill: 3,
  wage: wageFor(role, 3),
  status: 'atPost',
  fired: false,
  quitting: false,
  ...over,
})

const sam = staff('sam', 'sales')
const kim = staff('kim', 'sales')
const fm = staff('fm', 'finance')
const ctx = (roster: Employee[] = [sam], playerTargetId: string | null = null) => ({
  roster,
  playerTargetId,
})

describe('pickSalesCustomer', () => {
  it('goes to whoever has the least patience left, waiting before browsing', () => {
    const list = [
      shopper('a', { phase: 'browsing' }),
      shopper('b', { patienceLeft: 40 }),
      shopper('c', { patienceLeft: 20 }),
      shopper('d', { patienceLeft: 20 }),
    ]
    expect(pickSalesCustomer(list)?.id).toBe('c')
    expect(pickSalesCustomer(list, new Set(['c']))?.id).toBe('d')
    expect(pickSalesCustomer([shopper('a', { phase: 'browsing' })])?.id).toBe('a')
  })

  it('skips anyone being helped, mid-deal, arriving or leaving', () => {
    const list = [
      shopper('a', { handlerId: 'kim' }),
      shopper('b', { phase: 'talking', handlerId: PLAYER_ID }),
      shopper('c', { phase: 'arriving' }),
      shopper('d', { phase: 'leaving', leaveReason: 'impatient' }),
    ]
    expect(pickSalesCustomer(list)).toBeNull()
  })

  it('takes sellers like anyone else, unless there is no room or cash to buy', () => {
    const selling = { hope: 9_000, estimate: { estimate: 9_000, margin: 2_000 }, appraised: false }
    const list = [shopper('a', { patienceLeft: 5, selling })]
    expect(pickSalesCustomer(list)?.id).toBe('a')
    expect(pickSalesCustomer(list, new Set(), () => true, false)).toBeNull()
  })
})

describe('leadChoice', () => {
  const buyer = shopper('a', { phase: 'following', handlerId: 'sam' })

  it('hands off to finance when they are free, otherwise uses their own desk', () => {
    expect(leadChoice(sam, [buyer], [sam, fm])).toEqual({ kind: 'handOff' })
    const signing = shopper('b', { phase: 'signing', handlerId: 'fm', chairId: GUEST_CHAIR_ID })
    expect(leadChoice(sam, [buyer, signing], [sam, fm])).toEqual({
      kind: 'desk',
      chairId: SALES_DESKS[0].guestChairId,
    })
    expect(leadChoice(kim, [buyer], [sam, kim])).toEqual({
      kind: 'desk',
      chairId: SALES_DESKS[1].guestChairId,
    })
  })

  it('falls back on a busy finance desk, or nothing, without a desk of their own', () => {
    const extra = staff('extra', 'sales')
    const roster = [sam, kim, extra]
    const queued = shopper('b', { phase: 'queued', handlerId: 'fm' })
    expect(leadChoice(extra, [buyer, queued], [...roster, fm])).toEqual({ kind: 'handOff' })
    expect(leadChoice(extra, [buyer], roster)).toBeNull()
  })

  it('sends a third and fourth salesperson to the wing’s desks once it’s up', () => {
    const lee = staff('lee', 'sales')
    const max = staff('max', 'sales')
    const roster = [sam, kim, lee, max]
    const wing = ['east-lot', 'showroom-wing'] as const
    expect(leadChoice(lee, [buyer], roster, wing)).toEqual({
      kind: 'desk',
      chairId: SALES_DESKS[2].guestChairId,
    })
    expect(leadChoice(max, [buyer], roster, wing)).toEqual({
      kind: 'desk',
      chairId: SALES_DESKS[3].guestChairId,
    })
    expect(leadChoice(lee, [buyer], roster, ['east-lot'])).toBeNull()
    expect(salesChairFor(SALES_DESKS[3].guestChairId)).toBe('sales-chair-4')
    // With somewhere to close, they go after customers too.
    expect(nextSalesTask(max, [shopper('c')], { ...ctx(roster), expansions: wing })).toEqual({
      kind: 'greet',
      customerId: 'c',
    })
    expect(nextSalesTask(max, [shopper('c')], ctx(roster))).toEqual({ kind: 'idle' })
  })
})

describe('nextSalesTask', () => {
  it('picks a customer to greet when free and at work', () => {
    const list = [shopper('a'), shopper('b', { patienceLeft: 10 })]
    expect(nextSalesTask(sam, list, ctx())).toEqual({ kind: 'greet', customerId: 'b' })
    expect(nextSalesTask(sam, [], ctx())).toEqual({ kind: 'idle' })
  })

  it('lets newer salespeople wait until a browsing customer is at a car', () => {
    const browsing = [shopper('a', { phase: 'browsing' })]
    const novice = { ...sam, skill: EARLY_GREET_SKILL - 1 }
    const pro = { ...sam, skill: EARLY_GREET_SKILL }
    expect(nextSalesTask(novice, browsing, ctx([novice]))).toEqual({ kind: 'idle' })
    expect(nextSalesTask(novice, browsing, { ...ctx([novice]), atCar: new Set(['a']) })).toEqual({
      kind: 'greet',
      customerId: 'a',
    })
    expect(nextSalesTask(pro, browsing, ctx([pro]))).toEqual({ kind: 'greet', customerId: 'a' })
    // Anyone waiting is fair game, whatever the skill.
    expect(nextSalesTask(novice, [shopper('b')], ctx([novice])).kind).toBe('greet')
  })

  it("leaves alone the customer the player is heading to, and ones they've given up on", () => {
    const list = [shopper('a', { patienceLeft: 10 }), shopper('b')]
    expect(nextSalesTask(sam, list, ctx([sam], 'a'))).toEqual({ kind: 'greet', customerId: 'b' })
    const exclude = new Set(['a', 'b'])
    expect(nextSalesTask(sam, list, { ...ctx(), exclude })).toEqual({ kind: 'idle' })
  })

  it("doesn't start a deal on the way in, going home, let go, or with nowhere to close it", () => {
    const list = [shopper('a')]
    for (const e of [
      { ...sam, status: 'arriving' as const },
      { ...sam, status: 'leaving' as const },
      { ...sam, fired: true },
    ]) {
      expect(nextSalesTask(e, list, ctx([e]))).toEqual({ kind: 'idle' })
    }
    const extra = staff('extra', 'sales')
    expect(nextSalesTask(extra, list, ctx([sam, kim, extra]))).toEqual({ kind: 'idle' })
    expect(nextSalesTask(extra, list, ctx([sam, kim, extra, fm])).kind).toBe('greet')
  })

  it('follows the deal through from greeting to signing', () => {
    const task = (extra: Partial<Customer>) =>
      nextSalesTask(sam, [shopper('a', { handlerId: 'sam', ...extra })], ctx())
    expect(task({})).toEqual({ kind: 'greet', customerId: 'a' })
    expect(task({ phase: 'talking' })).toEqual({ kind: 'offer', customerId: 'a' })
    expect(task({ phase: 'considering' })).toEqual({ kind: 'offer', customerId: 'a' })
    expect(task({ phase: 'following' })).toEqual({ kind: 'lead', customerId: 'a' })
    const desk = SALES_DESKS[1]
    const sign = { kind: 'sign', customerId: 'a', chairId: desk.chairId }
    expect(task({ phase: 'following', chairId: desk.guestChairId })).toEqual(sign)
    expect(task({ phase: 'signing', chairId: desk.guestChairId })).toEqual(sign)
  })

  it('finishes a buyer in hand even when going home', () => {
    const leaving = { ...sam, status: 'leaving' as const }
    const buyer = shopper('a', { phase: 'following', handlerId: 'sam' })
    expect(nextSalesTask(leaving, [buyer], ctx([leaving]))).toEqual({
      kind: 'lead',
      customerId: 'a',
    })
  })

  it('is done with a buyer once finance has them', () => {
    const handedOff = shopper('a', { phase: 'queued', handlerId: 'fm', sellerId: 'sam' })
    expect(nextSalesTask(sam, [handedOff], ctx([sam, fm]))).toEqual({ kind: 'idle' })
  })
})

describe('salesChairFor', () => {
  it("finds the salesperson's chair across the desk from a guest chair", () => {
    for (const d of SALES_DESKS) expect(salesChairFor(d.guestChairId)).toBe(d.chairId)
    expect(salesChairFor(GUEST_CHAIR_ID)).toBeNull()
  })
})

describe('nextPorterTask', () => {
  const porter = staff('pat', 'porter')
  const stock = buildInventory(createRng(42))
  const withDirt = (dirt: Record<string, number>): InventoryCar[] =>
    stock.map((c) => (c.id in dirt ? { ...c, cleanliness: dirt[c.id] } : c))
  const dirty = withDirt({ 'lot-car-1': 0.5, 'lot-car-2': 0.2 })
  const none = { playerTargetId: null }

  it('washes the dirtiest car that needs it', () => {
    expect(nextPorterTask(porter, dirty, none)).toEqual({ kind: 'wash', carId: 'lot-car-2' })
  })

  it('waits when every car is clean enough', () => {
    expect(nextPorterTask(porter, stock, none)).toEqual({ kind: 'idle' })
    const fine = withDirt({ 'lot-car-1': WASH_BELOW })
    expect(nextPorterTask(porter, fine, none)).toEqual({ kind: 'idle' })
  })

  it('only works while at work', () => {
    for (const status of ['arriving', 'leaving', 'off'] as const) {
      expect(nextPorterTask({ ...porter, status }, dirty, none)).toEqual({ kind: 'idle' })
    }
    expect(nextPorterTask({ ...porter, fired: true }, dirty, none)).toEqual({ kind: 'idle' })
  })

  it("leaves the car the player is going to, and cars they couldn't reach", () => {
    const wash = (carId: string) => ({ kind: 'wash', carId })
    expect(nextPorterTask(porter, dirty, { playerTargetId: 'lot-car-2' })).toEqual(
      wash('lot-car-1'),
    )
    const exclude = new Set(['lot-car-2'])
    expect(nextPorterTask(porter, dirty, { ...none, exclude })).toEqual(wash('lot-car-1'))
  })

  it('leaves a car another porter is washing to them', () => {
    const taken = new Set(['lot-car-2'])
    expect(nextPorterTask(porter, dirty, { ...none, taken })).toEqual({
      kind: 'wash',
      carId: 'lot-car-1',
    })
    // Every car that needs it is someone else's: wait.
    const both = new Set(['lot-car-1', 'lot-car-2'])
    expect(nextPorterTask(porter, dirty, { ...none, taken: both })).toEqual({ kind: 'idle' })
  })

  it('finishes the car they started on, even if another gets dirtier', () => {
    const current = 'lot-car-1'
    expect(nextPorterTask(porter, dirty, { ...none, current })).toEqual({
      kind: 'wash',
      carId: 'lot-car-1',
    })
    // Done (washed), or sold: on to the next.
    const washed = withDirt({ 'lot-car-2': 0.2 })
    expect(nextPorterTask(porter, washed, { ...none, current })).toEqual({
      kind: 'wash',
      carId: 'lot-car-2',
    })
    expect(nextPorterTask(porter, sellCar(dirty, current), { ...none, current })).toEqual({
      kind: 'wash',
      carId: 'lot-car-2',
    })
  })
})

describe('nextGuardTask', () => {
  const guard = staff('gus', 'security')
  const at = { tx: 20, tz: 18 }
  const patrol = (leg: number) => ({ kind: 'patrol', tile: GUARD_PATROL_TILES[leg] })

  it('walks the patrol stop by stop, and round again', () => {
    expect(nextGuardTask(guard, { jaguar: null, at, leg: 0 })).toEqual(patrol(0))
    expect(nextGuardTask(guard, { jaguar: null, at, leg: 2 })).toEqual(patrol(2))
    const n = GUARD_PATROL_TILES.length
    expect(nextGuardTask(guard, { jaguar: null, at, leg: n + 1 })).toEqual(patrol(1))
  })

  it('adds the east lot to the rounds once it’s up', () => {
    const stops = patrolTiles(['east-lot'])
    expect(stops).toHaveLength(GUARD_PATROL_TILES.length + 1)
    const last = stops.length - 1
    expect(nextGuardTask(guard, { jaguar: null, at, leg: last, patrol: stops })).toEqual({
      kind: 'patrol',
      tile: stops[last],
    })
    expect(patrolTiles([])).toEqual(GUARD_PATROL_TILES)
  })

  it('chases Jaguar once he comes within sight', () => {
    const sight = guardSight(guard.skill)
    const near = { tx: at.tx + sight, tz: at.tz }
    const far = { tx: at.tx + sight + 1, tz: at.tz }
    expect(nextGuardTask(guard, { jaguar: near, at, leg: 0 })).toEqual({ kind: 'chase' })
    expect(nextGuardTask(guard, { jaguar: far, at, leg: 0 })).toEqual(patrol(0))
  })

  it('sees further with more skill', () => {
    expect(guardSight(5)).toBeGreaterThan(guardSight(1))
    const jaguar = { tx: at.tx + guardSight(1) + 1, tz: at.tz }
    expect(nextGuardTask({ ...guard, skill: 1 }, { jaguar, at, leg: 0 }).kind).toBe('patrol')
    expect(nextGuardTask({ ...guard, skill: 5 }, { jaguar, at, leg: 0 }).kind).toBe('chase')
  })

  it("keeps after him once chasing, until he's off the lot", () => {
    const jaguar = { tx: 0, tz: 0 }
    expect(nextGuardTask(guard, { jaguar, at, leg: 0, chasing: true })).toEqual({ kind: 'chase' })
    expect(nextGuardTask(guard, { jaguar: null, at, leg: 0, chasing: true })).toEqual(patrol(0))
  })

  it('only works while at work', () => {
    const ctx = { jaguar: at, at, leg: 0 }
    for (const status of ['arriving', 'leaving', 'off'] as const) {
      expect(nextGuardTask({ ...guard, status }, ctx)).toEqual({ kind: 'idle' })
    }
    expect(nextGuardTask({ ...guard, fired: true }, ctx)).toEqual({ kind: 'idle' })
  })
})

describe('nextMechanicTask', () => {
  const job = (id: string, kind: ServiceJob['kind'], over: Partial<ServiceJob> = {}) => ({
    ...reconJob(id, `car-${id}`, 400),
    kind,
    customerId: kind === 'recon' ? null : `client-${id}`,
    carId: kind === 'recon' ? `car-${id}` : null,
    ...over,
  })
  const mech = staff('m1', 'mechanic')
  const other = staff('m2', 'mechanic')
  const ctx = { roster: [mech, other], bays: 2 }

  it('takes client jobs first, then recalls, then reconditioning, into a free bay', () => {
    const jobs = [job('r', 'recon'), job('c', 'recall'), job('o', 'oil')]
    expect(nextMechanicTask(mech, jobs, ctx)).toEqual({ kind: 'job', jobId: 'o', bay: 0 })
    expect(nextMechanicTask(mech, jobs.slice(0, 2), ctx)).toEqual({
      kind: 'job',
      jobId: 'c',
      bay: 0,
    })
    expect(nextMechanicTask(mech, jobs.slice(0, 1), ctx)).toEqual({
      kind: 'job',
      jobId: 'r',
      bay: 0,
    })
  })

  it('keeps the job they are on', () => {
    const jobs = [job('o', 'oil'), job('r', 'recon', { status: 'inBay', bay: 1, mechanicId: 'm1' })]
    expect(nextMechanicTask(mech, jobs, ctx)).toEqual({ kind: 'job', jobId: 'r', bay: 1 })
  })

  it('leaves jobs and bays other mechanics have taken', () => {
    const jobs = [job('a', 'recon'), job('b', 'recon')]
    const taken = new Map([['a', 0]])
    expect(nextMechanicTask(mech, jobs, { ...ctx, taken })).toEqual({
      kind: 'job',
      jobId: 'b',
      bay: 1,
    })
    // One bay in use and the other spoken for: nothing to start.
    const busy = [job('x', 'recon', { status: 'inBay', bay: 0, mechanicId: 'm2' }), ...jobs]
    expect(nextMechanicTask(mech, busy, { ...ctx, taken: new Map([['a', 1]]) })).toEqual({
      kind: 'idle',
    })
  })

  it('takes over a job left stalled in a bay', () => {
    const gone = staff('m3', 'mechanic', { fired: true, status: 'leaving' })
    const jobs = [job('s', 'recon', { status: 'inBay', bay: 0, mechanicId: 'm3' })]
    expect(nextMechanicTask(mech, jobs, { ...ctx, roster: [mech, gone] })).toEqual({
      kind: 'job',
      jobId: 's',
      bay: 0,
    })
    // Not one someone is still working.
    const working = [job('s', 'recon', { status: 'inBay', bay: 0, mechanicId: 'm2' })]
    expect(nextMechanicTask(mech, working, { ...ctx, bays: 1 })).toEqual({ kind: 'idle' })
  })

  it('does nothing off the clock, let go, quitting, or with nothing to do', () => {
    const jobs = [job('r', 'recon')]
    for (const e of [
      staff('m', 'mechanic', { status: 'arriving' }),
      staff('m', 'mechanic', { fired: true }),
      staff('m', 'mechanic', { quitting: true }),
    ]) {
      expect(nextMechanicTask(e, jobs, ctx)).toEqual({ kind: 'idle' })
    }
    expect(nextMechanicTask(mech, [], ctx)).toEqual({ kind: 'idle' })
    expect(nextMechanicTask(mech, jobs, { ...ctx, bays: 0 })).toEqual({ kind: 'idle' })
    expect(nextMechanicTask(mech, [job('d', 'recon', { status: 'done' })], ctx)).toEqual({
      kind: 'idle',
    })
  })

  it('counts only a mechanic at their post as working', () => {
    expect(mechanicWorking([mech], 'm1')).toBe(true)
    expect(mechanicWorking([mech], null)).toBe(false)
    expect(mechanicWorking([], 'm1')).toBe(false)
    expect(mechanicWorking([{ ...mech, quitting: true }], 'm1')).toBe(false)
    expect(mechanicWorking([{ ...mech, status: 'leaving' }], 'm1')).toBe(false)
  })
})
