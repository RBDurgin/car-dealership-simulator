import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import type { OwnedExpansion } from '../sim/expansions'
import {
  GARAGE_EXPANSION,
  jobMinutes,
  JOBS,
  RATE_LEVELS,
  type Finding,
  type JobKind,
  type ServiceJob,
} from '../sim/service'
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

const finding: Finding = {
  label: 'Worn brake pads',
  minutes: 60,
  labor: 120,
  parts: 140,
  partsCost: 100,
  status: 'found',
}

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
const jobOf = (id = 'service-2-1'): ServiceJob | undefined =>
  game().serviceJobs.find((j) => j.customerId === id)

function checkIn(id = 'service-2-1') {
  game().dispatchCustomer({ type: 'parked', id })
  useGame.setState({
    activeAction: { id: 99, targetId: id, action: 'checkIn', phase: 'performing', startedAt: 0 },
  })
  game().completeAction(99)
  game().answerOffer(id)
}

/** A booked client whose job is in bay 0 with `finding` on it. */
function withFinding(kind: JobKind = 'oil') {
  setUp([[START + 10, kind]])
  tick(START + 10)
  checkIn()
  const job = jobOf()!
  game().staffStartJob(mechanic.id, job.id, 0)
  useGame.setState({
    serviceJobs: game().serviceJobs.map((j) => (j.id === job.id ? { ...j, finding } : j)),
  })
  return jobOf()!
}

function recommend(id = 'service-2-1') {
  useGame.setState({
    activeAction: { id: 98, targetId: id, action: 'recommend', phase: 'performing', startedAt: 0 },
  })
  game().completeAction(98)
}

describe('findings', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('are offered by the player: taken, the job and the bill grow and the car is promised later', () => {
    const job = withFinding()
    const promised = client()!.service!.promisedMinute!
    recommend()
    const after = jobOf()!
    expect(game().dayStats.service.offered).toBe(1)
    if (after.finding!.status === 'accepted') {
      expect(game().dayStats.service.upsold).toBe(1)
      expect(after.labor).toBe(job.labor + finding.labor)
      expect(after.parts).toBe(job.parts + finding.parts)
      expect(after.partsCost).toBe(job.partsCost + finding.partsCost)
      expect(after.minutes).toBeGreaterThan(job.minutes)
      expect(client()!.service!.promisedMinute).toBeGreaterThan(promised)
    } else {
      expect(after.finding!.status).toBe('declined')
      expect(game().dayStats.service.upsold).toBe(0)
      expect(after.labor).toBe(job.labor)
      expect(client()!.service!.promisedMinute).toBe(promised)
    }
    // Once offered, there's nothing more to offer.
    recommend()
    expect(game().dayStats.service.offered).toBe(1)
  })

  it('are lost once the car is ready', () => {
    const job = withFinding()
    tick(START + 10 + job.minutes + 10)
    expect(jobOf()!.status).toBe('ready')
    recommend()
    expect(game().dayStats.service.offered).toBe(0)
    expect(jobOf()!.finding!.status).toBe('found')
  })

  it('cannot be fitted in when the car would only be ready after closing', () => {
    withFinding()
    useGame.setState({ clock: { day: 2, minute: CLOSE_MINUTE - 30 } })
    recommend()
    expect(game().dayStats.service.offered).toBe(0)
  })

  it('are phoned through to clients who are away, and only to them', () => {
    withFinding('repair')
    const job = jobOf()!
    game().callClient(job.id)
    expect(game().dayStats.service.offered).toBe(0)
    game().serviceWentAway('service-2-1')
    const promised = game().serviceAway[0].service!.promisedMinute!
    game().callClient(job.id)
    expect(game().dayStats.service.offered).toBe(1)
    const now = game().serviceAway[0].service!.promisedMinute!
    if (jobOf()!.finding!.status === 'accepted') expect(now).toBeGreaterThan(promised)
    else expect(now).toBe(promised)
  })

  it('are offered by the service advisor at their post', () => {
    setUp([[START + 10, 'oil']], [mechanic, worker('adv-1', 'advisor'), worker('s-1', 'sales')])
    tick(START + 10)
    checkIn()
    const job = jobOf()!
    game().staffStartJob(mechanic.id, job.id, 0)
    useGame.setState({
      serviceJobs: game().serviceJobs.map((j) => (j.id === job.id ? { ...j, finding } : j)),
    })
    game().staffRecommend('s-1', job.id)
    expect(game().dayStats.service.offered).toBe(0)
    game().staffRecommend('adv-1', job.id)
    expect(game().dayStats.service.offered).toBe(1)
  })
})

describe('comebacks', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('drive back in at their time for a free redo, which takes half the time', () => {
    setUp([[START + 10, 'brakes']])
    tick(START + 10)
    checkIn()
    const first = client()!
    game().dispatchCustomer({ type: 'collect', id: first.id })
    game().dispatchCustomer({ type: 'droveOff', id: first.id })
    useGame.setState({ serviceComebacks: [{ minute: START + 100, client: first }] })
    tick(START + 90)
    expect(game().customers.filter((c) => c.service)).toHaveLength(0)
    tick(START + 100)
    const back = game().customers.find((c) => c.service?.comeback)!
    expect(back).toMatchObject({ name: first.name, phase: 'arriving' })
    expect(back.service!.quote).toEqual({ labor: 0, parts: 0, partsCost: 0 })
    expect(game().serviceComebacks).toEqual([])

    // Nobody turns down a free redo.
    checkIn(back.id)
    expect(client(back.id)!.phase).toBe('servicing')
    const redo = jobOf(back.id)!
    expect(redo.redo).toBe(true)
    game().staffStartJob(mechanic.id, redo.id, 0)
    const started = jobOf(back.id)!
    expect(started.minutes).toBe(Math.round(jobMinutes('brakes', mechanic.skill) / 2))
    expect(started.finding).toBeNull()

    tick(START + 110 + started.minutes)
    const cash = game().cash
    game().serviceCollect(back.id)
    expect(game().cash).toBe(cash)
    // A redo isn't another job done.
    expect(game().dayStats.service.jobs).toBe(0)
  })
})

describe('the shop rate', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('prices the quotes of clients who drive in after it changes', () => {
    setUp([[START + 10, 'oil']])
    game().setServiceRate('premium')
    expect(game().service.rate).toBe('premium')
    tick(START + 10)
    expect(client()!.service!.quote.labor).toBe(
      Math.round((JOBS.oil.minutes / 60) * RATE_LEVELS.premium.hourly),
    )
  })
})
