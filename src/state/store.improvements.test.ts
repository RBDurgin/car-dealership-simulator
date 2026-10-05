import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { IMPROVEMENTS, installed } from '../sim/improvements'
import { createSave, parseSave } from '../sim/save'
import { STARTING_CASH, useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

const up = () => installed(game().improvements, game().clock.day)

describe('improvements', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('pays up front, books the spend against today and goes up overnight', () => {
    expect(game().buyImprovement('tube-man')).toBe(true)
    const { cost } = IMPROVEMENTS['tube-man']
    expect(game().cash).toBe(STARTING_CASH - cost)
    expect(game().improvements).toEqual([{ id: 'tube-man', day: 1 }])
    expect(game().dayStats.improvements).toBe(cost)
    expect(up()).toEqual([])
    endDay()
    expect(netIncome(game().dayStats)).toBe(-cost - game().dayStats.wages)
    game().startNextDay()
    expect(up()).toEqual(['tube-man'])
    expect(game().dayStats.improvements).toBe(0)
  })

  it('refuses what it can’t buy, saying why', () => {
    expect(game().buyImprovement('pylon-sign')).toBe(false)
    expect(game().notice?.text).toBe('Needs the bigger sign first.')
    useGame.setState({ cash: 100 })
    expect(game().buyImprovement('big-sign')).toBe(false)
    expect(game().notice?.text).toBe('Not enough cash for that.')
    expect(game().improvements).toEqual([])
  })

  it('keeps improvements through a save, all up on the morning it resumes', () => {
    game().buyImprovement('big-sign')
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().clock.day).toBe(2)
    expect(up()).toEqual(['big-sign'])
  })

  it('opens the upgrades tab from the computer and its key', () => {
    game().requestAction('office-monitor', 'improve')
    game().arriveAction(game().activeAction!.id)
    expect(game()).toMatchObject({ stockOpen: true, computerTab: 'upgrades' })
    game().toggleStockPanel(undefined, 'upgrades')
    expect(game().stockOpen).toBe(false)
  })
})
