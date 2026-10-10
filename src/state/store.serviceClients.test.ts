import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { emptyStats } from '../sim/deal'
import type { OwnedExpansion } from '../sim/expansions'
import { reputationChange } from '../sim/reputation'
import { GARAGE_EXPANSION, quoteTotal, type JobKind } from '../sim/service'
import { wageFor, type Employee, type Role } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

const garage: OwnedExpansion[] = [
  { id: 'east-lot', day: 1 },
  { id: GARAGE_EXPANSION, day: 1 },
]

const worker = (id: string, role: Role, skill = 3): Employee => ({
  id,
  name: `${role} ${id}`,
  variant: 'male-c',
  role,
  skill,
  wage: wageFor(role, skill),
  status: 'atPost',
  fired: false,
  quitting: false,
})
const mechanic = worker('mech-1', 'mechanic')

const START = 9 * 60

/**
 * Day 2 with the garage up, `roster` at work, nobody shopping, and service
 * clients due at `visits` (minute, job).
 */
function setUp(visits: [number, JobKind][], roster: Employee[] = [mechanic]) {
  game().newGame()
  useGame.setState({
    expansions: garage,
    clock: { day: 2, minute: START },
    roster,
    cash: 50_000,
    arrivals: { minutes: [], sources: [], spawned: 0 },
    serviceVisits: { minutes: visits.map((v) => v[0]), kinds: visits.map((v) => v[1]), spawned: 0 },
    helpOpen: false,
  })
}
const tick = (minute: number) => game().tickClock({ day: 2, minute })
const client = (id = 'service-2-1'): Customer | undefined =>
  game().customers.find((c) => c.id === id)

/** The client parks and walks up to the counter. */
function park(id = 'service-2-1') {
  game().dispatchCustomer({ type: 'parked', id })
}

/** Checks the client in as the player and has them answer the quote. */
function checkIn(id = 'service-2-1') {
  park(id)
  useGame.setState({
    activeAction: { id: 99, targetId: id, action: 'checkIn', phase: 'performing', startedAt: 0 },
  })
  game().completeAction(99)
  game().answerOffer(id)
}

describe('service clients', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('drive in to a service space when they are due, not before', () => {
    setUp([[START + 20, 'oil']])
    tick(START + 10)
    expect(client()).toBeUndefined()
    tick(START + 20)
    expect(client()).toMatchObject({ phase: 'arriving', vehicle: null })
    expect(client()!.service).toMatchObject({ kind: 'oil', spot: 0, parked: false })
    // Not a shopper: not counted as a visitor.
    expect(game().dayStats.visitors).toBe(0)
  })

  it('wait for a free space once all four are taken', () => {
    setUp([
      [START + 10, 'oil'],
      [START + 10, 'oil'],
      [START + 10, 'oil'],
      [START + 10, 'oil'],
      [START + 10, 'oil'],
    ])
    tick(START + 10)
    expect(game().customers.filter((c) => c.service)).toHaveLength(4)
    expect(game().serviceVisits.spawned).toBe(4)
    // One drives off: the fifth comes in.
    const first = client()!
    useGame.setState({
      customers: game().customers.map((c) =>
        c.id === first.id
          ? { ...c, phase: 'leaving' as const, leaveReason: 'declined' as const }
          : c,
      ),
    })
    game().dispatchCustomer({ type: 'droveOff', id: first.id })
    tick(START + 20)
    expect(client('service-2-5')!.service!.spot).toBe(first.service!.spot)
  })

  it('park, are checked in, book a job and collect the car once it is done', () => {
    setUp([[START + 10, 'oil']])
    tick(START + 10)
    park()
    expect(client()!.phase).toBe('waiting')
    checkIn()
    const c = client()!
    expect(c.phase).toBe('servicing')
    expect(c.handlerId).toBeNull()
    const job = game().serviceJobs.find((j) => j.customerId === c.id)!
    expect(job).toMatchObject({ kind: 'oil', status: 'waiting', client: { name: c.name } })
    expect(c.service).toMatchObject({ jobId: job.id, dropOff: false })
    expect(c.service!.promisedMinute).toBeGreaterThan(START + 10)

    game().staffStartJob(mechanic.id, job.id, 0)
    tick(START + 10 + job.minutes + 10)
    const ready = game().serviceJobs.find((j) => j.id === job.id)!
    expect(ready.status).toBe('ready')
    expect(ready.readyMinute).toBe(START + 10 + job.minutes + 10)

    const cash = game().cash
    game().serviceCollect(c.id)
    expect(client()).toMatchObject({ phase: 'leaving', leaveReason: 'serviced' })
    expect(game().cash).toBe(cash + job.labor + job.parts - job.partsCost)
    expect(game().dayStats.service).toMatchObject({
      jobs: 1,
      labor: job.labor,
      parts: job.parts,
      partsCost: job.partsCost,
      late: 0,
    })
    expect(game().serviceJobs.find((j) => j.id === job.id)!.status).toBe('done')
  })

  it('are turned away with no mechanic to do the work', () => {
    setUp([[START + 10, 'brakes']], [])
    tick(START + 10)
    checkIn()
    expect(client()).toMatchObject({ phase: 'leaving', leaveReason: 'declined' })
    expect(game().dayStats.service.turnedAway).toBe(1)
    expect(game().serviceJobs).toEqual([])
  })

  it('are turned away when the job cannot be done before closing', () => {
    setUp([[START + 10, 'repair']])
    tick(START + 10)
    useGame.setState({ clock: { day: 2, minute: CLOSE_MINUTE - 60 } })
    checkIn()
    expect(game().dayStats.service.turnedAway).toBe(1)
  })

  it('drop a long job off, go away and come back for it when promised', () => {
    setUp([[START + 10, 'repair']])
    tick(START + 10)
    checkIn()
    const c = client()!
    expect(c.service).toMatchObject({ dropOff: true, returned: false })
    game().serviceWentAway(c.id)
    expect(client()).toBeUndefined()
    expect(game().serviceAway.map((x) => x.id)).toEqual([c.id])
    // Their space stays theirs while they're away.
    tick(c.service!.promisedMinute! - 10)
    expect(client()).toBeUndefined()
    tick(c.service!.promisedMinute!)
    expect(client()).toMatchObject({ phase: 'servicing', service: { returned: true } })
    expect(game().serviceAway).toEqual([])
  })

  it('stay past closing to collect, and drop-offs collect after hours', () => {
    setUp([
      [START + 10, 'oil'],
      [START + 10, 'repair'],
    ])
    tick(START + 10)
    checkIn('service-2-1')
    checkIn('service-2-2')
    game().serviceWentAway('service-2-2')
    const cash = game().cash
    // Nobody has started either job by closing.
    tick(CLOSE_MINUTE)
    expect(client('service-2-1')!.phase).toBe('servicing')
    expect(game().serviceJobs.every((j) => j.status !== 'waiting')).toBe(true)
    expect(game().serviceAway).toEqual([])
    const away = game().serviceJobs.find((j) => j.customerId === 'service-2-2')!
    expect(away.status).toBe('done')
    const stats = game().dayStats.service
    expect(stats.jobs).toBe(1)
    expect(stats.overtime).toBeGreaterThan(0)
    expect(game().cash).toBe(cash + away.labor + away.parts - away.partsCost - stats.overtime)
    // Finished late on both counts: promised well before closing.
    expect(stats.late).toBe(1)
    game().serviceCollect('service-2-1')
    expect(game().dayStats.service.late).toBe(2)
  })

  it('leave at closing if nobody checked them in', () => {
    setUp([[START + 10, 'oil']])
    tick(START + 10)
    park()
    useGame.setState({ clock: { day: 2, minute: CLOSE_MINUTE - 10 } })
    tick(CLOSE_MINUTE)
    expect(client()).toMatchObject({ phase: 'leaving', leaveReason: 'closing' })
  })

  it('are checked in by the service advisor, and never by salespeople', () => {
    setUp([[START + 10, 'oil']], [mechanic, worker('adv-1', 'advisor'), worker('s-1', 'sales')])
    tick(START + 10)
    park()
    expect(game().staffClaim('s-1', 'service-2-1')).toBe(false)
    game().staffCheckIn('adv-1', 'service-2-1')
    expect(client()).toMatchObject({ phase: 'considering', handlerId: 'adv-1' })
    expect(client()!.offer!.price).toBe(quoteTotal(client()!.service!.quote))
    game().answerOffer('service-2-1')
    expect(['servicing', 'leaving']).toContain(client()!.phase)
  })

  it('move reputation: a point for a happy client, one off for a late car or a turned-away one', () => {
    const stats = emptyStats()
    expect(reputationChange({ ...stats, service: { ...stats.service, jobs: 3 } })).toBe(3)
    expect(
      reputationChange({ ...stats, service: { ...stats.service, late: 1, turnedAway: 1 } }),
    ).toBe(-2)
  })
})
