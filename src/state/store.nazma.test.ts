import { beforeEach, describe, expect, it } from 'vitest'
import { PLAYER_ID } from '../sim/customers'
import { isJaguarDay } from '../sim/jaguar'
import { COFFEE_STOP, FIRST_NAZMA_DAY, isNazmaVisitDay, type NazmaVisit } from '../sim/nazma'
import { createSave } from '../sim/save'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Resumes the game on the morning of `day`. */
function startDay(day: number) {
  game().loadGame({ ...createSave(game(), 0), day: day - 1 })
}

describe('Nazma from the cupcake shop', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('pops over on day 2, and on his visit days only, never with Jaguar', () => {
    startDay(1)
    expect(game().nazma).toBeNull()
    startDay(FIRST_NAZMA_DAY)
    expect(game().nazma?.status).toBe('coming')
    for (let day = 3; day < 40; day++) {
      startDay(day)
      const jaguar = isJaguarDay(day, false)
      expect(!!game().nazma).toBe(isNazmaVisitDay(day, jaguar))
      if (game().jaguar) expect(game().nazma).toBeNull()
    }
  })

  it('moves only his own visit along: no money, stats or customers change', () => {
    startDay(FIRST_NAZMA_DAY)
    const visit: NazmaVisit = {
      stops: [PLAYER_ID, COFFEE_STOP],
      arrivalMinute: 600,
      status: 'coming',
      progress: 0,
      chatting: false,
    }
    useGame.setState({ nazma: visit })
    const before = game()
    game().nazmaArrived()
    expect(game().notice?.text).toMatch(/Nazma from the cupcake shop/)
    game().nazmaStop(COFFEE_STOP) // not his next stop: ignored
    expect(game().nazma?.progress).toBe(0)
    game().nazmaChat()
    expect(game().nazma?.chatting).toBe(true)
    game().nazmaStop(PLAYER_ID)
    expect(game().nazma).toMatchObject({ progress: 1, chatting: false })
    game().nazmaStop(COFFEE_STOP)
    game().nazmaLeft()
    expect(game().nazma?.status).toBe('done')
    const after = game()
    expect(after.cash).toBe(before.cash)
    expect(after.dayStats).toBe(before.dayStats)
    expect(after.customers).toBe(before.customers)
    expect(after.reputation).toBe(before.reputation)
  })
})
