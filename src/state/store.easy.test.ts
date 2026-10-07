import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { createSave, parseSave } from '../sim/save'
import { LOW_CASH, tipText } from '../sim/tips'
import { useGame } from './store'
import { startTips } from './tips'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('Easy’s safety net', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('tops a negative balance up to $0 once, and says so the next morning', () => {
    game().newGame('easy')
    useGame.setState({ cash: -3_400 })
    endDay()
    expect(game().cash).toBe(0)
    expect(game().bailoutUsed).toBe(true)
    expect(game().dayStats.bailout).toBe(3_400)
    // A rescue, not income.
    expect(netIncome(game().dayStats)).toBe(0)
    game().startNextDay()
    expect(game().notice?.text).toContain('the bank covered your $3,400 shortfall')

    useGame.setState({ cash: -1_000 })
    endDay()
    expect(game().cash).toBe(-1_000)
    expect(game().dayStats.bailout).toBe(0)
  })

  it('leaves a balance in the black alone', () => {
    game().newGame('easy')
    endDay()
    expect(game().bailoutUsed).toBe(false)
    expect(game().dayStats.bailout).toBe(0)
  })

  it('isn’t there on Medium', () => {
    game().newGame('medium')
    useGame.setState({ cash: -3_400 })
    endDay()
    expect(game().cash).toBe(-3_400)
    expect(game().bailoutUsed).toBe(false)
  })

  it('stays used through a save, and a new game gets it back', () => {
    game().newGame('easy')
    useGame.setState({ cash: -500 })
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    expect(save.bailoutUsed).toBe(true)
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().bailoutUsed).toBe(true)
    game().newGame('easy')
    expect(game().bailoutUsed).toBe(false)
  })
})

describe('guided tips', () => {
  let stop: () => void
  beforeEach(() => {
    useGame.setState(initial, true)
    stop = startTips()
  })
  afterEach(() => stop())

  /** Starts a game at `level` with the guide closed. */
  const play = (level: 'easy' | 'medium') => {
    game().newGame(level)
    game().toggleHelp(false)
    useGame.setState({ notice: null })
  }

  it('shows a tip the first time, marks it seen, and never repeats it', () => {
    play('easy')
    useGame.setState({ cash: LOW_CASH - 1 })
    expect(game().notice?.text).toBe(tipText('lowCash'))
    expect(game().tipsSeen).toEqual(['lowCash'])

    useGame.setState({ notice: null, cash: LOW_CASH })
    useGame.setState({ cash: LOW_CASH - 1 })
    expect(game().notice).toBeNull()
  })

  it('waits for another notice to go, and for the guide to close', () => {
    play('easy')
    game().showNotice('Something else.')
    useGame.setState({ cash: LOW_CASH - 1 })
    expect(game().notice?.text).toBe('Something else.')
    game().toggleHelp(true)
    game().clearNotice(game().notice!.id)
    expect(game().notice).toBeNull()
    game().toggleHelp(false)
    expect(game().notice?.text).toBe(tipText('lowCash'))
  })

  it('doesn’t show on Medium', () => {
    play('medium')
    useGame.setState({ cash: LOW_CASH - 1 })
    expect(game().notice).toBeNull()
    expect(game().tipsSeen).toEqual([])
  })

  it('keeps the tips seen through a save', () => {
    play('easy')
    useGame.setState({ cash: LOW_CASH - 1 })
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    expect(save.tipsSeen).toEqual(['lowCash'])
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().tipsSeen).toEqual(['lowCash'])
  })
})
