import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { OwnedExpansion } from '../sim/expansions'
import { createSave } from '../sim/save'
import { defaultService, emptySchedule, GARAGE_EXPANSION } from '../sim/service'
import { availableCars, type InventoryCar } from '../sim/inventory'
import { freeSlots } from '../sim/ordering'
import { wageFor, type Employee } from '../sim/staff'
import { usedStockCar } from '../sim/usedCars'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

const garage: OwnedExpansion[] = [
  { id: 'east-lot', day: 1 },
  { id: GARAGE_EXPANSION, day: 1 },
]

describe('the service department', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('starts a new game with no jobs, no visits and the default settings', () => {
    game().newGame()
    expect(game().serviceJobs).toEqual([])
    expect(game().serviceVisits).toEqual(emptySchedule())
    expect(game().service).toEqual(defaultService())
  })

  it('plans no service visits without a garage', () => {
    game().newGame()
    useGame.setState({ career: { ...game().career, sales: 400 } })
    endDay()
    game().startNextDay()
    expect(game().serviceVisits).toEqual(emptySchedule())
  })

  it('plans visits once the garage is up, without changing the day’s arrivals', () => {
    game().newGame()
    useGame.setState({ career: { ...game().career, sales: 200 } })
    endDay()
    const before = useGame.getState()
    game().startNextDay()
    const without = { arrivals: game().arrivals, candidates: game().candidates }

    useGame.setState(before, true)
    useGame.setState({ expansions: garage })
    game().startNextDay()
    expect(game().serviceVisits.minutes.length).toBeGreaterThan(0)
    expect(game().arrivals).toEqual(without.arrivals)
    // Mechanics apply once there's a garage to work in.
    expect(game().candidates.some((c) => c.role === 'mechanic')).toBe(true)
    expect(without.candidates.some((c) => c.role === 'mechanic')).toBe(false)
  })

  it('keeps its settings through a save', () => {
    game().newGame()
    useGame.setState({ service: { rate: 'premium', autoRecon: true } })
    endDay()
    const save = JSON.parse(JSON.stringify(createSave(game(), 0)))
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().service).toEqual({ rate: 'premium', autoRecon: true })
    expect(game().serviceJobs).toEqual([])
  })
})

describe('reconditioning in the garage', () => {
  beforeEach(() => useGame.setState(initial, true))

  const mechanic: Employee = {
    id: 'mech-1',
    name: 'Riley G.',
    variant: 'male-c',
    role: 'mechanic',
    skill: 3,
    wage: wageFor('mechanic', 3),
    status: 'atPost',
    fired: false,
    quitting: false,
  }
  const usedCar = (): InventoryCar =>
    usedStockCar(
      'used-1-1',
      { model: 'sedan', year: 2020, miles: 70_000, condition: 0.3, acquiredDay: 1 },
      { location: 'lot', index: 20 },
      7_000,
      1,
      0.2,
    )

  /** Day 2 with the garage up, a mechanic at work and a worn used car in stock. */
  function setUp(roster: Employee[] = [mechanic]) {
    game().newGame()
    useGame.setState({
      expansions: garage,
      clock: { day: 2, minute: 9 * 60 },
      inventory: [...game().inventory, usedCar()],
      roster,
      cash: 100_000,
    })
  }
  const car = () => game().inventory.find((c) => c.id === 'used-1-1')!
  const tick = (minute: number) => game().tickClock({ day: 2, minute })

  it('sends a car to the shop, out of stock but keeping its space', () => {
    setUp()
    expect(game().recondition('used-1-1')).toBe(true)
    const job = game().serviceJobs[0]
    expect(job).toMatchObject({ kind: 'recon', carId: 'used-1-1', status: 'waiting' })
    expect(game().cash).toBe(100_000 - job.partsCost)
    expect(car().status).toBe('recon')
    expect(availableCars(game().inventory).some((c) => c.id === 'used-1-1')).toBe(false)
    const free = freeSlots(game().inventory, [], [], ['east-lot', 'service-bay'])
    expect(free.some((s) => s.location === 'lot' && s.index === 20)).toBe(false)
    // And it can't go twice.
    expect(game().recondition('used-1-1')).toBe(false)
  })

  it('refuses without a garage or a mechanic', () => {
    setUp([])
    expect(game().recondition('used-1-1')).toBe(false)
    useGame.setState({ expansions: [] })
    expect(game().recondition('used-1-1')).toBe(false)
    expect(car().status).toBe('available')
  })

  it('works the job on the clock only while the mechanic is at work, then re-lists the car', () => {
    setUp()
    game().recondition('used-1-1')
    const before = car()
    const partsCost = game().serviceJobs[0].partsCost
    game().staffStartJob('mech-1', game().serviceJobs[0].id, 0)
    expect(game().serviceJobs[0]).toMatchObject({ status: 'inBay', bay: 0, mechanicId: 'mech-1' })
    const minutes = game().serviceJobs[0].minutes
    tick(9 * 60 + 30)
    expect(game().serviceJobs[0].worked).toBe(30)
    // Gone off sulking: the job stalls.
    useGame.setState({ roster: [{ ...mechanic, quitting: true }] })
    tick(10 * 60)
    expect(game().serviceJobs[0].worked).toBe(30)
    useGame.setState({ roster: [mechanic] })
    tick(9 * 60 + 30 + minutes)
    expect(game().serviceJobs[0].status).toBe('done')
    const after = car()
    expect(after.status).toBe('available')
    expect(after.used!.condition).toBeCloseTo(0.6)
    expect(after.cleanliness).toBe(1)
    expect(after.msrp).toBeGreaterThan(before.msrp)
    expect(after.cost).toBe(before.cost + partsCost)
    expect(game().dayStats.service.recon).toBe(1)
  })

  it('finishes a started job at closing in overtime, and returns cars still waiting', () => {
    setUp()
    useGame.setState({ inventory: [...game().inventory, { ...usedCar(), id: 'used-1-2' }] })
    game().recondition('used-1-1')
    game().recondition('used-1-2')
    const [started, waiting] = game().serviceJobs
    // Started late in the day: it can't be done by closing.
    useGame.setState({ clock: { day: 2, minute: 17 * 60 + 30 } })
    game().staffStartJob('mech-1', started.id, 0)
    const cash = game().cash
    game().tickClock({ day: 2, minute: CLOSE_MINUTE })
    const overtime = game().dayStats.service.overtime
    expect(overtime).toBeGreaterThan(0)
    expect(car().used!.condition).toBeCloseTo(0.6)
    expect(game().inventory.find((c) => c.id === 'used-1-2')).toMatchObject({
      status: 'available',
      used: { condition: 0.3 },
    })
    expect(game().cash).toBe(cash - overtime + waiting.partsCost)
    expect(game().serviceJobs.some((j) => j.status === 'waiting' || j.status === 'inBay')).toBe(
      false,
    )
  })

  it('keeps a car in the shop through the night if one were left there', () => {
    setUp()
    game().recondition('used-1-1')
    endDay()
    useGame.setState({
      inventory: game().inventory.map((c) => ({
        ...c,
        status: c.id === 'used-1-1' ? 'recon' : c.status,
      })),
    })
    expect(createSave(game(), 0).inventory.find((c) => c.id === 'used-1-1')!.status).toBe(
      'available',
    )
    game().startNextDay()
    expect(car().status).toBe('available')
  })

  it('sends yesterday’s used cars to the shop on its own when asked to', () => {
    setUp()
    useGame.setState({ service: { ...defaultService(), autoRecon: true } })
    endDay()
    game().startNextDay()
    useGame.setState({ roster: [mechanic] })
    // Taken in on day 2, so it goes on the morning of day 4's run below.
    useGame.setState({
      inventory: game().inventory.map((c) =>
        c.id === 'used-1-1' ? { ...c, used: { ...c.used!, acquiredDay: 3 } } : c,
      ),
    })
    endDay()
    useGame.setState({ roster: [{ ...mechanic, status: 'off' }] })
    game().startNextDay()
    expect(game().clock.day).toBe(4)
    expect(car().status).toBe('recon')
    expect(game().serviceJobs).toHaveLength(1)
  })
})
