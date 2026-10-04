import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { createSave } from '../sim/save'
import { STARTING_CASH, useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('saving and loading', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('starts on the title screen and a new game plays day 1', () => {
    expect(game().screen).toBe('title')
    game().newGame()
    expect(game()).toMatchObject({ screen: 'playing', cash: STARTING_CASH })
    expect(game().clock).toEqual({ day: 1, minute: OPEN_MINUTE })
  })

  it('resumes a save on the next morning with the same cash, cars and staff', () => {
    game().newGame()
    game().sellCar('lot-car-1')
    const hired = game().candidates.find((c) => c.role === 'receptionist')!
    game().hire(hired.id)
    endDay()
    const save = JSON.parse(JSON.stringify(createSave(game(), 0)))

    // What day 2 looks like when played straight through.
    game().startNextDay()
    const straight = game()

    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().screen).toBe('playing')
    expect(game().clock).toEqual({ day: 2, minute: OPEN_MINUTE })
    expect(game().cash).toBe(straight.cash)
    expect(game().inventory.find((c) => c.id === 'lot-car-1')?.status).toBe('sold')
    expect(game().roster).toEqual(straight.roster)
    expect(game().roster).toMatchObject([{ id: hired.id, status: 'arriving' }])
    expect(game().candidates).toEqual(straight.candidates)
    expect(game().arrivals).toEqual(straight.arrivals)
    expect(game().dayStats.settled).toBe(false)
  })
})
