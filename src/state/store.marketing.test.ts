import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { CHANNELS } from '../sim/marketing'
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

const count = (source: string) => game().arrivals.sources.filter((s) => s === source).length

describe('marketing campaigns', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('pays up front, books the spend against today and starts tomorrow', () => {
    expect(game().launchCampaign('tv')).toBe(true)
    expect(game().cash).toBe(STARTING_CASH - CHANNELS.tv.cost)
    expect(game().campaigns).toMatchObject([{ channel: 'tv', startDay: 2, endDay: 6 }])
    expect(game().dayStats.marketing).toBe(CHANNELS.tv.cost)
    // Today's arrivals were already planned.
    expect(count('tv')).toBe(0)
    endDay()
    expect(netIncome(game().dayStats)).toBe(-CHANNELS.tv.cost - game().dayStats.wages)
  })

  it('refuses a campaign it can’t pay for', () => {
    useGame.setState({ cash: 100 })
    expect(game().launchCampaign('newspaper')).toBe(false)
    expect(game().campaigns).toEqual([])
    expect(game().notice?.text).toBe('Not enough cash for that campaign.')
  })

  it('brings extra visitors while it runs, tagged with the channel, then stops', () => {
    game().launchCampaign('tv')
    for (let day = 2; day <= 6; day++) {
      endDay()
      game().startNextDay()
      expect(game().clock.day).toBe(day)
      expect(count('tv')).toBe(CHANNELS.tv.visitors)
      expect(game().dayStats.marketing).toBe(0)
    }
    endDay()
    game().startNextDay()
    expect(count('tv')).toBe(0)
    expect(game().campaigns).toEqual([])
  })

  it('counts campaign visitors by source as they arrive', () => {
    game().launchCampaign('tv')
    endDay()
    game().startNextDay()
    game().tickClock({ day: 2, minute: CLOSE_MINUTE - 10 })
    expect(game().dayStats.bySource.tv).toBe(CHANNELS.tv.visitors)
    expect(game().customers.filter((c) => c.source === 'tv')).toHaveLength(CHANNELS.tv.visitors)
  })

  it('keeps a running campaign through a save', () => {
    game().launchCampaign('radio')
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    expect(save.campaigns).toEqual(game().campaigns)
    game().startNextDay()
    const straight = game()
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().campaigns).toEqual(straight.campaigns)
    expect(game().arrivals).toEqual(straight.arrivals)
  })
})

describe('the office computer panel', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('opens on the marketing tab from the computer', () => {
    game().requestAction('office-monitor', 'advertise')
    game().arriveAction(game().activeAction!.id)
    expect(game()).toMatchObject({ stockOpen: true, computerTab: 'marketing' })
    game().requestAction('office-monitor', 'orderStock')
    game().arriveAction(game().activeAction!.id)
    expect(game()).toMatchObject({ stockOpen: true, computerTab: 'stock' })
  })

  it('switches tabs from a key instead of closing, and closes on the same tab', () => {
    game().toggleStockPanel(undefined, 'stock')
    expect(game()).toMatchObject({ stockOpen: true, computerTab: 'stock' })
    game().toggleStockPanel(undefined, 'marketing')
    expect(game()).toMatchObject({ stockOpen: true, computerTab: 'marketing' })
    game().toggleStockPanel(undefined, 'marketing')
    expect(game().stockOpen).toBe(false)
  })
})
