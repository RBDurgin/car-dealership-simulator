import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { OwnedExpansion } from '../sim/expansions'
import { DAYS_PER_MONTH } from '../sim/calendar'
import { RECALL_FIRST, recallOfMonth } from '../sim/recalls'
import { GARAGE_BAYS, GARAGE_EXPANSION, JOBS_PER_BAY, warrantyPay } from '../sim/service'
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
  skill: 3,
  wage: wageFor('mechanic', 3),
  status: 'atPost',
  fired: false,
  quitting: false,
}

/** The 8th of the first month (from the second) with a recall. */
const START_DAY = (() => {
  for (let first = 1 + DAYS_PER_MONTH; ; first += DAYS_PER_MONTH) {
    if (recallOfMonth(first)) return first + RECALL_FIRST - 1
  }
})()
const recall = recallOfMonth(START_DAY)!

/**
 * Closes the day before `day` with `expansions` up and opens `day`, having
 * sold `sales` cars, `sold` of them the recalled model.
 */
function openOn(day: number, expansions: OwnedExpansion[], sold = 200, sales = 20) {
  game().newGame()
  useGame.setState({
    expansions,
    clock: { day: day - 1, minute: CLOSE_MINUTE },
    customers: [],
    roster: [],
    career: { ...game().career, sales, soldByModel: { [recall.model]: sold } },
  })
  game().startNextDay()
}

describe('manufacturer recalls', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('are announced the morning they start, and bring the model’s buyers in', () => {
    openOn(START_DAY, garage)
    expect(game().clock.day).toBe(START_DAY)
    expect(game().notice?.text).toContain('Recall:')
    expect(game().serviceVisits.kinds).toContain('recall')
  })

  it('only fill what the bays have left', () => {
    openOn(START_DAY, garage, 200, 400)
    expect(game().serviceVisits.kinds.length).toBeLessThanOrEqual(GARAGE_BAYS * JOBS_PER_BAY + 1)
  })

  it('don’t run without a garage', () => {
    openOn(START_DAY, [])
    expect(game().notice?.text ?? '').not.toContain('Recall:')
    expect(game().serviceVisits.kinds).not.toContain('recall')
  })

  it('are booked without a no, and the manufacturer pays for the work', () => {
    openOn(START_DAY, garage)
    const minute = 9 * 60 + 10
    useGame.setState({
      roster: [mechanic],
      cash: 50_000,
      clock: { day: START_DAY, minute: 9 * 60 },
      arrivals: { minutes: [], sources: [], spawned: 0 },
      // Premium rates put no one off recall work.
      service: { ...game().service, rate: 'premium' },
      serviceVisits: { minutes: [minute], kinds: ['recall'], spawned: 0 },
      helpOpen: false,
    })
    game().tickClock({ day: START_DAY, minute })
    const c = game().customers.find((x) => x.service?.kind === 'recall')!
    expect(c.service!.car.model).toBe(recall.model)
    game().dispatchCustomer({ type: 'parked', id: c.id })
    useGame.setState({
      activeAction: {
        id: 99,
        targetId: c.id,
        action: 'checkIn',
        phase: 'performing',
        startedAt: 0,
      },
    })
    game().completeAction(99)
    game().answerOffer(c.id)
    const job = game().serviceJobs.find((j) => j.customerId === c.id)!
    expect(job).toMatchObject({ kind: 'recall', labor: 0, parts: 0 })
    expect(job.warranty).toBe(warrantyPay(job.partsCost))

    game().staffStartJob(mechanic.id, job.id, 0)
    // No extra work found, to keep the sums plain.
    useGame.setState({
      serviceJobs: game().serviceJobs.map((j) => (j.id === job.id ? { ...j, finding: null } : j)),
    })
    game().tickClock({ day: START_DAY, minute: minute + 120 })
    const cash = game().cash
    game().serviceCollect(c.id)
    expect(game().cash).toBe(cash + job.warranty - job.partsCost)
    expect(game().dayStats.service).toMatchObject({ jobs: 1, recalls: 1, warranty: job.warranty })
    expect(game().notice?.text).toContain('The manufacturer pays')
  })
})
