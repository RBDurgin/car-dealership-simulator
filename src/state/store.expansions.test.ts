import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { EXPANSIONS, expansionsUp } from '../sim/expansions'
import { PARKING_SPACES, PLATFORMS } from '../sim/layout'
import { createSave, parseSave } from '../sim/save'
import type { Employee, Role } from '../sim/staff'
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

  describe('the showroom wing', () => {
    /** Owns the east lot (up since day 1) and has reached Regional Name, with cash to spare. */
    const regional = () =>
      useGame.setState({
        cash: 400_000,
        career: { ...game().career, rank: 'regional-name' },
        expansions: [{ id: 'east-lot', day: 0 }],
      })
    /** Puts an applicant for `role` on today's list and hires them. */
    const hire = (role: Role, n: number) => {
      const c: Employee = { ...game().candidates[0], id: `staff-x-${role}-${n}`, role }
      useGame.setState({ candidates: [...game().candidates, c] })
      game().hire(c.id)
      return game().roster.some((e) => e.id === c.id)
    }

    it('needs the east lot first', () => {
      useGame.setState({ cash: 400_000, career: { ...game().career, rank: 'regional-name' } })
      expect(game().buyExpansion('showroom-wing')).toBe(false)
      expect(game().notice?.text).toBe('Needs the east lot first.')
    })

    it('allows 4 salespeople and 2 porters once it’s up', () => {
      regional()
      expect(game().buyExpansion('showroom-wing')).toBe(true)
      expect([1, 2, 3].map((n) => hire('sales', n))).toEqual([true, true, false])
      expect(game().notice?.text).toBe('You already have 2 salespeople.')
      expect([1, 2].map((n) => hire('porter', n))).toEqual([true, false])
      endDay()
      game().startNextDay()
      expect(expansionsUp(game())).toEqual(['east-lot', 'showroom-wing'])
      expect([3, 4, 5].map((n) => hire('sales', n))).toEqual([true, true, false])
      expect(game().notice?.text).toBe('You already have 4 salespeople.')
      expect(hire('porter', 3)).toBe(true)
      expect(hire('porter', 4)).toBe(false)
    })

    it('puts new stock on its platforms first once it’s up', () => {
      regional()
      game().buyExpansion('showroom-wing')
      endDay()
      game().startNextDay()
      useGame.setState({ cash: 2_000_000 })
      game().orderCar('sedan', 'cash')
      game().orderCar('sedan', 'cash')
      const showroom = game().orders.filter((o) => o.slot.location === 'showroom')
      expect(showroom.map((o) => o.slot.index)).toEqual(
        PLATFORMS.flatMap((p, i) => (p.requires ? [i] : [])),
      )
    })
  })
})
