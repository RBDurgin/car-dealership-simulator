import { beforeEach, describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH } from '../sim/calendar'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats, netIncome } from '../sim/deal'
import { ALL_SLOTS } from '../sim/ordering'
import { holdback, monthlyQuota } from '../sim/quota'
import { createSave, parseSave } from '../sim/save'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Ends a quiet day (nobody else turns up), settling it. */
function endDay() {
  useGame.setState({
    arrivals: { minutes: [], sources: [], spawned: 0 },
    dayStats: emptyStats(),
  })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

/** Jumps to the start of `day` (as if the day before had just ended). */
function goTo(day: number) {
  useGame.setState({ clock: { day: day - 1, minute: CLOSE_MINUTE } })
  endDay()
  game().startNextDay()
}

describe('manufacturer quota', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('starts the first month with a target and nothing sold', () => {
    expect(game().quota).toBe(monthlyQuota(0, ALL_SLOTS.length, game().reputation))
    expect(game().monthSales).toEqual({ count: 0, msrp: 0 })
  })

  it('pays no holdback before the month ends', () => {
    useGame.setState({ monthSales: { count: 30, msrp: 1_000_000 } })
    const cash = game().cash
    endDay()
    expect(game().dayStats.quota).toBeNull()
    expect(game().cash).toBe(cash)
  })

  it('pays the holdback on the last day, records it and counts it in the net', () => {
    goTo(DAYS_PER_MONTH)
    const quota = game().quota
    const monthSales = { count: quota, msrp: quota * 35_000 }
    useGame.setState({ monthSales })
    const cash = game().cash
    endDay()
    const payout = holdback(quota, quota, monthSales.msrp)
    expect(payout).toBeGreaterThan(0)
    expect(game().dayStats.quota).toEqual({
      quota,
      sold: quota,
      payout,
      tier: { from: 'bronze', to: 'silver' },
    })
    expect(game().cash).toBe(cash + payout)
    expect(netIncome(game().dayStats)).toBe(payout)
  })

  it('records a missed month with no payout', () => {
    goTo(DAYS_PER_MONTH)
    useGame.setState({ monthSales: { count: 2, msrp: 60_000 } })
    endDay()
    expect(game().dayStats.quota).toEqual({
      quota: game().quota,
      sold: 2,
      payout: 0,
      tier: { from: 'bronze', to: 'bronze' },
    })
  })

  it('moves the franchise tier at month end and says so the next morning', () => {
    goTo(DAYS_PER_MONTH)
    const quota = game().quota
    useGame.setState({ monthSales: { count: quota, msrp: quota * 35_000 } })
    endDay()
    expect(game().franchise).toBe('silver')
    game().startNextDay()
    expect(game().notice?.text).toContain('Silver dealer')
    expect(game().notice?.text).toContain('Summit Vela GT')
  })

  it('pays a bigger holdback at a higher tier', () => {
    goTo(DAYS_PER_MONTH)
    const quota = game().quota
    const monthSales = { count: quota, msrp: quota * 35_000 }
    useGame.setState({ monthSales, franchise: 'gold' })
    endDay()
    expect(game().dayStats.quota?.payout).toBe(holdback(quota, quota, monthSales.msrp, 1.5))
    expect(game().franchise).toBe('gold')
  })

  it('drops a tier for a month well short, unless Easy’s slack covers it', () => {
    goTo(DAYS_PER_MONTH)
    const sold = Math.ceil(game().quota * 0.75)
    useGame.setState({ monthSales: { count: sold, msrp: sold * 30_000 }, franchise: 'gold' })
    endDay()
    expect(game().franchise).toBe('silver')

    useGame.setState(initial, true)
    game().newGame('easy')
    goTo(DAYS_PER_MONTH)
    const easySold = Math.ceil(game().quota * 0.75)
    useGame.setState({
      monthSales: { count: easySold, msrp: easySold * 30_000 },
      franchise: 'gold',
    })
    endDay()
    expect(game().franchise).toBe('gold')
  })

  it('keeps the franchise tier through a save', () => {
    useGame.setState({ franchise: 'silver' })
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 1))))!
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().franchise).toBe('silver')
  })

  it('starts the next month afresh, with a target from reputation', () => {
    goTo(DAYS_PER_MONTH)
    useGame.setState({ monthSales: { count: 5, msrp: 150_000 }, reputation: 90 })
    endDay()
    game().startNextDay()
    expect(game().monthSales).toEqual({ count: 0, msrp: 0 })
    expect(game().quota).toBe(monthlyQuota(1, ALL_SLOTS.length, game().reputation))
    expect(game().quota).toBeGreaterThan(monthlyQuota(1, ALL_SLOTS.length, 50))
  })

  it('keeps the month going through a save mid-month', () => {
    goTo(10)
    useGame.setState({ monthSales: { count: 4, msrp: 140_000 }, quota: 17 })
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 1))))!
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().clock.day).toBe(11)
    expect(game().monthSales).toEqual({ count: 4, msrp: 140_000 })
    expect(game().quota).toBe(17)
  })
})
