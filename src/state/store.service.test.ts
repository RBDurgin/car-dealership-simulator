import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { OwnedExpansion } from '../sim/expansions'
import { createSave } from '../sim/save'
import { defaultService, emptySchedule, GARAGE_EXPANSION } from '../sim/service'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

// The garage arrives in 15b; until then it's an id the store doesn't know.
const garage = [{ id: GARAGE_EXPANSION, day: 1 }] as unknown as OwnedExpansion[]

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
    expect(game().candidates).toEqual(without.candidates)
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
