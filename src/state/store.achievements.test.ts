import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats, type Sale } from '../sim/deal'
import { createSave, parseSave } from '../sim/save'
import { startAchievements } from './achievements'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const ids = () => game().achievements.map((a) => a.id)
/** Lets the achievements' notice show (it waits for the change that earned them). */
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve))

const sale = (price: number, msrp = price): Sale => ({
  customerName: 'Alex B.',
  carId: 'gone',
  model: 'van',
  price,
  msrp,
  cost: price - 3_000,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
})

const signed = (s: Sale) =>
  useGame.setState({ dayStats: { ...game().dayStats, sales: [...game().dayStats.sales, s] } })

/** Ends the day with `sales` made and nobody else turning up, settling it. */
function endDay(...sales: Sale[]) {
  useGame.setState({
    arrivals: { minutes: [], sources: [], spawned: 0 },
    dayStats: { ...emptyStats(), sales, visitors: sales.length + 2 },
  })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('achievements in the store', () => {
  let stop: () => void
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame('hard')
    useGame.setState({ helpOpen: false, notice: null })
    stop = startAchievements()
  })
  afterEach(() => stop())

  it('starts a new game with none', () => {
    signed(sale(30_000))
    expect(ids()).not.toHaveLength(0)
    game().newGame()
    expect(game().achievements).toEqual([])
  })

  it('earns Full Sticker once, on the day and level it was earned, with a notice', async () => {
    signed(sale(30_000))
    expect(ids()).toEqual(['first-sale', 'full-sticker'])
    expect(game().achievements[1]).toEqual({ id: 'full-sticker', day: 1, level: 'hard' })
    await settle()
    expect(game().notice?.text).toBe('🏆 2 achievements: First Sale and Full Sticker')
    signed(sale(31_000))
    expect(ids().filter((id) => id === 'full-sticker')).toHaveLength(1)
  })

  it('waits for a notice already up', async () => {
    game().showNotice('Sold the van!')
    signed(sale(29_000, 30_000))
    await settle()
    expect(game().notice?.text).toBe('Sold the van!')
    game().clearNotice(game().notice!.id)
    await settle()
    expect(game().notice?.text).toBe('🏆 First Sale: sold your first car')
  })

  it('puts the day-end ones in the summary, not in a notice', async () => {
    endDay(sale(30_000, 31_000))
    await settle()
    expect(game().achievements).toContainEqual({ id: 'in-the-black', day: 1, level: 'hard' })
    expect(game().notice?.text ?? '').not.toContain('In the Black')
    // Settling again earns nothing twice.
    game().tickClock({ day: 1, minute: CLOSE_MINUTE + 1 })
    expect(ids().filter((id) => id === 'in-the-black')).toHaveLength(1)
  })

  it('earns nothing new loading a save and replaying the morning', () => {
    endDay(sale(30_000))
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 1))))!
    const earned = game().achievements
    expect(save.achievements).toEqual(earned)
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().clock.day).toBe(2)
    expect(game().achievements).toEqual(earned)
  })
})
