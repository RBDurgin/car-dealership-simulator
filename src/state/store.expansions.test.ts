import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { EXPANSIONS, expansionsUp } from '../sim/expansions'
import { PARKING_SPACES } from '../sim/layout'
import { createSave, parseSave } from '../sim/save'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

/** Orders sedans for cash until there's no room left. */
function orderUntilFull() {
  while (game().orderCar('sedan', 'cash'));
  return game().orders
}

const mainStreet = () =>
  useGame.setState({ cash: 200_000, career: { ...game().career, rank: 'main-street' } })

describe('expansions', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('needs Main Street before the east lot can be bought, saying why', () => {
    useGame.setState({ cash: 200_000 })
    expect(game().buyExpansion('east-lot')).toBe(false)
    expect(game().notice?.text).toBe('Needs the Main Street rank.')
    expect(game().expansions).toEqual([])
  })

  it('pays up front, books the spend against today and builds it overnight', () => {
    mainStreet()
    expect(game().buyExpansion('east-lot')).toBe(true)
    const { cost } = EXPANSIONS['east-lot']
    expect(game().cash).toBe(200_000 - cost)
    expect(game().expansions).toEqual([{ id: 'east-lot', day: 1 }])
    expect(game().dayStats.expansions).toBe(cost)
    expect(expansionsUp(game())).toEqual([])
    endDay()
    expect(netIncome(game().dayStats)).toBe(-cost - game().dayStats.wages)
    game().startNextDay()
    expect(expansionsUp(game())).toEqual(['east-lot'])
    expect(game().dayStats.expansions).toBe(0)
  })

  it('takes stock into its spaces once it’s up, and not before', () => {
    mainStreet()
    game().buyExpansion('east-lot')
    useGame.setState({ cash: 2_000_000 })
    const today = orderUntilFull()
    expect(game().notice?.text).toBe('No room: every space is taken or on order.')
    expect(today.some((o) => PARKING_SPACES[o.slot.index].requires)).toBe(false)
    for (const o of today) game().cancelOrder(o.id)
    endDay()
    game().startNextDay()
    useGame.setState({ cash: 2_000_000 })
    const orders = orderUntilFull()
    expect(orders.length - today.length).toBe(12)
    expect(orders.at(-1)!.slot).toEqual({
      location: 'lot',
      index: PARKING_SPACES.length - 1,
    })
  })

  it('keeps expansions through a save, built on the morning it resumes', () => {
    mainStreet()
    game().buyExpansion('east-lot')
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().clock.day).toBe(2)
    expect(expansionsUp(game())).toEqual(['east-lot'])
  })
})
