import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { createSave } from '../sim/save'
import { isPaused, useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

describe('how-to-play guide', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('opens on a new game and pauses until dismissed', () => {
    expect(isPaused(game())).toBe(true)
    game().newGame()
    expect(game().helpOpen).toBe(true)
    expect(isPaused(game())).toBe(true)
    game().toggleHelp(false)
    expect(isPaused(game())).toBe(false)
    game().toggleHelp()
    expect(isPaused(game())).toBe(true)
  })

  it('stays closed when a save is continued', () => {
    game().newGame()
    game().toggleHelp(false)
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    const save = createSave(game(), 0)

    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().helpOpen).toBe(false)
    expect(isPaused(game())).toBe(false)
  })

  it('is closed first by Esc, before anything else', () => {
    game().newGame()
    game().toggleStaffPanel(true)
    game().openMenu('lot-car-1', 0, 0)
    game().cancelAll()
    expect(game()).toMatchObject({ helpOpen: false, staffOpen: true })
    expect(game().menu).not.toBeNull()
  })
})
