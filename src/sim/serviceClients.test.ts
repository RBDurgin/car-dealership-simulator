import { describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from './clock'
import { moodOf, reduceCustomer, reduceCustomers, type Customer } from './customers'
import { actionBlocker, customerActions, recordMissed, emptyStats } from './deal'
import {
  bayPose,
  bayToSpot,
  serviceDoorTile,
  serviceInbound,
  serviceOutbound,
  servicePose,
  spotToBay,
} from './driving'
import { approachTilesFor } from './interactables'
import {
  buildLayout,
  createGrid,
  GRID_WIDTH,
  PARKING_SPACES,
  parkedCarRect,
  SERVICE_COUNTER_ID,
  SERVICE_GATE,
  SERVICE_SPOTS,
  type Rect,
} from './layout'
import { findPathToAny } from './pathfinding'
import { createRng } from './rng'
import {
  clientJob,
  JOBS,
  promiseMinute,
  PROMISE_SLACK,
  quote,
  reconJob,
  stampReady,
  takeDueVisits,
  wasLate,
  type ServiceJob,
} from './service'
import {
  comebackClient,
  FREE_QUOTE,
  freeServiceSpot,
  freeServiceSpots,
  quoteAcceptChance,
  serviceClient,
} from './serviceClients'
import { sfxFor, type SfxState } from './sfxEvents'
import { wageFor, type Employee } from './staff'
import { nextCheckIn, pickSalesCustomer } from './staffAi'

const client = (id = 's-1', patch: Partial<Customer> = {}): Customer => ({
  ...serviceClient(id, 'oil', 0, createRng(3), 1, 'standard'),
  ...patch,
})

const overlaps = (a: Rect, b: Rect) =>
  a.tx < b.tx + b.w && b.tx < a.tx + a.w && a.tz < b.tz + b.h && b.tz < a.tz + a.h

describe('a service client', () => {
  it('comes alone, in their own car, for the job on the quote', () => {
    for (let seed = 1; seed < 30; seed++) {
      const c = serviceClient('s', 'brakes', 2, createRng(seed), 1, 'standard')
      expect(c.companion).toBeNull()
      expect(c.archetype).not.toBe('couple')
      expect(c.vehicle).toBeNull()
      expect(c.browseCarIds).toEqual([])
      expect(c.service).toMatchObject({ kind: 'brakes', spot: 2, parked: false, jobId: null })
    }
  })

  it('takes a quote more often at a lower shop rate', () => {
    expect(quoteAcceptChance('budget', 'regular')).toBeGreaterThan(
      quoteAcceptChance('standard', 'regular'),
    )
    expect(quoteAcceptChance('premium', 'regular')).toBeLessThan(
      quoteAcceptChance('standard', 'regular'),
    )
    expect(quoteAcceptChance('premium', 'tire-kicker')).toBeGreaterThanOrEqual(0.3)
    expect(quoteAcceptChance('budget', 'decisive')).toBeLessThanOrEqual(0.97)
  })

  it('goes from parked to the counter, checked in, servicing and away serviced', () => {
    let c: Customer | null = client()
    c = reduceCustomer(c, { type: 'arrive', id: c.id })!
    expect(c.phase).toBe('arriving')
    c = reduceCustomer(c, { type: 'parked', id: c.id })!
    expect(c).toMatchObject({ phase: 'waiting', service: { parked: true } })
    expect(customerActions(c)).toEqual(['checkIn'])
    // Greeted with no car to talk about: they aren't shopping, so they stay.
    c = reduceCustomer(c, { type: 'greet', id: c.id, carId: null, by: 'player' })!
    expect(c.phase).toBe('talking')
    expect(customerActions(c)).toEqual([])
    c = reduceCustomer(c, { type: 'offer', id: c.id, carId: 'vehicle:s-1', price: 99 })!
    expect(c.phase).toBe('considering')
    const ev = {
      type: 'booked',
      id: c.id,
      jobId: 'j',
      promisedMinute: 600,
      dropOff: false,
    } as const
    c = reduceCustomer(c, ev)!
    expect(c).toMatchObject({ phase: 'servicing', handlerId: null, offer: null })
    expect(c.service).toMatchObject({ jobId: 'j', promisedMinute: 600 })
    // Closing doesn't send them off without their car.
    expect(reduceCustomer(c, { type: 'close' })).toBe(c)
    // Nor does patience run out while the car is in the shop.
    expect(reduceCustomer(c, { type: 'tick', minutes: 500 })).toBe(c)
    c = reduceCustomer(c, { type: 'collect', id: c.id })!
    expect(c).toMatchObject({ phase: 'leaving', leaveReason: 'serviced' })
    expect(moodOf(c)).toBe('happy')
    expect(reduceCustomer(c, { type: 'droveOff', id: c.id })).toBeNull()
  })

  it('can be recommended extra work only while their car is in a bay with a finding open', () => {
    const visit = { ...client().service!, jobId: 'j' }
    const c = client('s-1', { phase: 'servicing', service: visit })
    const finding = {
      label: 'Worn brake pads',
      minutes: 60,
      labor: 120,
      parts: 140,
      partsCost: 100,
      status: 'found' as const,
    }
    const job: ServiceJob = {
      ...clientJob('j', 'oil', 's-1', visit.quote, { name: 'S', model: 'sedan', condition: 1 }),
      status: 'inBay',
      bay: 0,
      finding,
    }
    expect(customerActions(c, [job])).toEqual(['recommend'])
    expect(customerActions(c)).toEqual([])
    expect(customerActions(c, [{ ...job, status: 'ready' }])).toEqual([])
    expect(customerActions(c, [{ ...job, finding: { ...finding, status: 'declined' } }])).toEqual(
      [],
    )
    expect(actionBlocker('recommend', 's-1', [c], [], [], [job])).toBeNull()
    expect(actionBlocker('recommend', 's-1', [c], [], [], [])).toMatch(/nothing more/)
  })

  it('takes a new promise for extra work only while servicing', () => {
    const visit = { ...client().service!, jobId: 'j', promisedMinute: 600 }
    const c = client('s-1', { phase: 'servicing', service: visit })
    const ev = { type: 'repromise', id: 's-1', promisedMinute: 660 } as const
    expect(reduceCustomer(c, ev)!.service!.promisedMinute).toBe(660)
    const waiting = client('s-1', { phase: 'waiting' })
    expect(reduceCustomer(waiting, ev)).toBe(waiting)
  })

  it('comes back as the same person in the same car for a free redo', () => {
    const left = client('s-1', {
      phase: 'leaving',
      leaveReason: 'serviced',
      patienceLeft: 3,
      service: { ...client().service!, jobId: 'j', promisedMinute: 600, parked: true },
    })
    const back = comebackClient(left, 'comeback-1', 2)
    expect(back).toMatchObject({
      id: 'comeback-1',
      name: left.name,
      phase: 'arriving',
      leaveReason: null,
      patienceLeft: left.patience,
    })
    expect(back.service).toMatchObject({
      kind: left.service!.kind,
      car: left.service!.car,
      spot: 2,
      parked: false,
      quote: FREE_QUOTE,
      jobId: null,
      promisedMinute: null,
      comeback: true,
    })
  })

  it('leaves declined when they turn the quote down', () => {
    const c = client('s-1', { phase: 'considering', offer: { carId: 'vehicle:s-1', price: 99 } })
    const next = reduceCustomer(c, { type: 'respond', id: c.id, answer: 'walk' })!
    expect(next).toMatchObject({ phase: 'leaving', leaveReason: 'declined' })
    expect(moodOf(next)).toBe('neutral')
  })

  it('goes away only when dropping the car off, and only once', () => {
    const visit = client().service!
    const waits = client('s-1', { phase: 'servicing', service: { ...visit, dropOff: false } })
    expect(reduceCustomers([waits], { type: 'wentAway', id: 's-1' })).toEqual([waits])
    const drops = client('s-1', { phase: 'servicing', service: { ...visit, dropOff: true } })
    expect(reduceCustomers([drops], { type: 'wentAway', id: 's-1' })).toEqual([])
    const back = { ...drops, service: { ...drops.service!, returned: true } }
    expect(reduceCustomers([back], { type: 'wentAway', id: 's-1' })).toEqual([back])
  })

  it('is no shopper: never missed, nor picked by a salesperson', () => {
    const c = client('s-1', { phase: 'waiting', preferredModels: ['van'] })
    expect(recordMissed(emptyStats(), [c], [])).toEqual(emptyStats())
    expect(pickSalesCustomer([c])).toBeNull()
  })
})

describe('service spaces', () => {
  it('are handed out first-free, and held by clients away', () => {
    const a = client('a', { service: { ...client().service!, spot: 0 } })
    const b = client('b', { service: { ...client().service!, spot: 1 } })
    expect(freeServiceSpot([a], [b])).toBe(2)
    expect(freeServiceSpots([a], [b])).toBe(SERVICE_SPOTS.length - 2)
    const all = SERVICE_SPOTS.map((_, n) =>
      client(`c${n}`, { service: { ...a.service!, spot: n } }),
    )
    expect(freeServiceSpot(all)).toBeNull()
  })

  it('stand clear of the lot, the garage and each other, with the gate open and paths to the counter', () => {
    const layout = buildLayout(['east-lot', 'service-bay'])
    const grid = createGrid(layout)
    const rects = SERVICE_SPOTS.map((s) => s.rect)
    for (const [i, r] of rects.entries()) {
      for (const p of PARKING_SPACES) expect(overlaps(r, p.rect)).toBe(false)
      for (const other of rects.slice(i + 1)) expect(overlaps(r, other)).toBe(false)
      for (const b of layout.blocked) expect(overlaps(r, b)).toBe(false)
      expect(r.tx + r.w).toBeLessThan(GRID_WIDTH)
    }
    for (let tx = SERVICE_GATE.tx; tx < SERVICE_GATE.tx + SERVICE_GATE.w; tx++) {
      expect(grid.isWalkable(tx, SERVICE_GATE.tz)).toBe(true)
    }
    // The fence is shut there without the garage.
    expect(createGrid(buildLayout(['east-lot'])).isWalkable(SERVICE_GATE.tx, SERVICE_GATE.tz)).toBe(
      false,
    )
    const counter = layout.props.find((p) => p.id === SERVICE_COUNTER_ID)!
    const front = approachTilesFor(grid, counter.rect).filter((t) => t.tz > counter.rect.tz)
    expect(front.length).toBeGreaterThan(0)
    for (let spot = 0; spot < SERVICE_SPOTS.length; spot++) {
      // With every car parked, each driver can still get out and to the counter.
      for (const s of SERVICE_SPOTS) grid.setRectBlocked(parkedCarRect(s), true)
      const door = serviceDoorTile(spot)
      expect(grid.isWalkable(door.tx, door.tz)).toBe(true)
      expect(findPathToAny(grid, door, front)).not.toBeNull()
    }
  })

  it('are driven to and from by routes that join up end to end', () => {
    const close = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6)
    const ends = (legs: { points: { x: number; z: number }[] }[]) => ({
      start: legs[0].points[0],
      end: legs[legs.length - 1].points.at(-1)!,
    })
    for (let spot = 0; spot < SERVICE_SPOTS.length; spot++) {
      const home = servicePose(spot).pos
      close(ends(serviceInbound(spot, 'west')).end, home)
      close(ends(serviceOutbound(spot, 'east')).start, home)
      for (const bay of [0, 1]) {
        const lift = bayPose(bay).pos
        close(ends(spotToBay(spot, bay)).start, home)
        close(ends(spotToBay(spot, bay)).end, lift)
        close(ends(bayToSpot(bay, spot)).start, lift)
        close(ends(bayToSpot(bay, spot)).end, home)
      }
    }
  })
})

describe('booking a job', () => {
  const waiting = (kind: ServiceJob['kind'], id: string = kind): ServiceJob =>
    clientJob(id, kind, `c-${id}`, quote(kind, 'standard', createRng(1)), {
      name: 'A',
      model: 'sedan',
      condition: 0.5,
    })

  it('promises the job after the work ahead of it, shared between the mechanics', () => {
    const now = 600
    const alone = promiseMinute(now, [], 'oil', 1)!
    expect(alone).toBe(Math.ceil((now + JOBS.oil.minutes + PROMISE_SLACK) / 10) * 10)
    const queue = [waiting('brakes', 'a'), waiting('repair', 'b')]
    const one = promiseMinute(now, queue, 'oil', 1)!
    const two = promiseMinute(now, queue, 'oil', 2)!
    expect(one).toBeGreaterThan(two)
    expect(two).toBeGreaterThan(alone)
    // Our own reconditioning waits behind clients, unless it's already in a bay.
    const recon = reconJob('r', 'car', 300)
    expect(promiseMinute(now, [recon], 'oil', 1)).toBe(alone)
    expect(promiseMinute(now, [{ ...recon, status: 'inBay', bay: 0 }], 'oil', 1)).toBeGreaterThan(
      alone,
    )
    expect(promiseMinute(now, [], 'oil', 0)).toBeNull()
    expect(promiseMinute(CLOSE_MINUTE - 20, [], 'repair', 1)).toBeGreaterThan(CLOSE_MINUTE)
  })

  it('stamps when a client’s car came ready, and whether that was late', () => {
    const jobs = [{ ...waiting('oil'), status: 'ready' as const }, waiting('tires')]
    const stamped = stampReady(jobs, 640)
    expect(stamped[0].readyMinute).toBe(640)
    expect(stampReady(stamped, 700)).toBe(stamped)
    expect(wasLate(stamped[0], 630)).toBe(true)
    expect(wasLate(stamped[0], 640)).toBe(false)
  })

  it('lets visits in only as far as there are spaces for them', () => {
    const schedule = {
      minutes: [540, 550, 560],
      kinds: ['oil', 'tires', 'brakes'] as const,
      spawned: 0,
    }
    const { schedule: next, due } = takeDueVisits(
      { ...schedule, kinds: [...schedule.kinds] },
      600,
      2,
    )
    expect(due).toEqual(['oil', 'tires'])
    expect(next.spawned).toBe(2)
    expect(takeDueVisits(next, 600, 0).due).toEqual([])
  })
})

describe('the service advisor', () => {
  const advisor: Employee = {
    id: 'adv',
    name: 'Kim P.',
    variant: 'male-c',
    role: 'advisor',
    skill: 3,
    wage: wageFor('advisor', 3),
    status: 'atPost',
    fired: false,
    quitting: false,
  }

  it('checks in whoever has waited longest at the counter, leaving the player theirs', () => {
    const a = client('a', { phase: 'waiting', patienceLeft: 40 })
    const b = client('b', { phase: 'waiting', patienceLeft: 20 })
    const away = client('c', { phase: 'waiting', patienceLeft: 5 })
    const atCounter = new Set(['a', 'b'])
    expect(nextCheckIn(advisor, [a, b, away], atCounter, null)?.id).toBe('b')
    expect(nextCheckIn(advisor, [a, b, away], atCounter, 'b')?.id).toBe('a')
    expect(nextCheckIn({ ...advisor, status: 'arriving' }, [a], atCounter, null)).toBeNull()
  })
})

describe('the garage’s sounds', () => {
  const base = {
    screen: 'playing',
    clock: { day: 2, minute: 600 },
    customers: [],
    inventory: [],
    roster: [],
    orders: [],
    campaigns: [],
    improvements: [],
    career: { rivalsBeaten: 0, rank: 'corner-lot' },
    nazma: null,
    notice: null,
    staffOpen: false,
    stockOpen: false,
    helpOpen: false,
    audioOpen: false,
    inspectedId: null,
    serviceJobs: [],
  } as unknown as SfxState
  const job = reconJob('r', 'car', 300)

  it('raises the lift and gets the wrenches out as a job starts, and lowers it when done', () => {
    const inBay = { ...job, status: 'inBay' as const, bay: 1 }
    const started = sfxFor({ ...base, serviceJobs: [job] }, { ...base, serviceJobs: [inBay] })
    expect(started.map((e) => e.cue)).toEqual(['lift', 'wrench'])
    expect(started[0].subject).toEqual({ kind: 'bay', bay: 1 })
    const done = sfxFor(
      { ...base, serviceJobs: [inBay] },
      { ...base, serviceJobs: [{ ...inBay, status: 'done' }] },
    )
    expect(done.map((e) => e.cue)).toEqual(['lift'])
  })

  it('hears a client’s car drive in, but not a drop-off walking back for it', () => {
    const c = client('s-1')
    const arrived = sfxFor(base, { ...base, customers: [c] }).map((e) => e.cue)
    expect(arrived).toEqual(['chime', 'engine'])
    const back = { ...c, phase: 'servicing' as const, service: { ...c.service!, returned: true } }
    expect(sfxFor(base, { ...base, customers: [back] })).toEqual([])
  })
})
