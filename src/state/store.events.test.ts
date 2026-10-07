import { beforeEach, describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH, MONTHS_PER_YEAR } from '../sim/calendar'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats } from '../sim/deal'
import { EVENT_DAYS, eventOn, nextEvent } from '../sim/events'
import { WEATHER_EFFECTS } from '../sim/weather'
import { useGame } from './store'

const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR
const initial = useGame.getState()
const game = () => useGame.getState()

/** Ends a quiet day (nobody else turns up) and opens the next. */
function nextDay() {
  useGame.setState({
    arrivals: { minutes: [], sources: [], spawned: 0 },
    dayStats: emptyStats(),
  })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
  game().startNextDay()
}

/** Jumps to the evening before `day` and opens it. */
function skipTo(day: number) {
  useGame.setState({ clock: { day: day - 1, minute: 0 } })
  nextDay()
}

/** The morning's planned regular visitors, with the weather's pull undone. */
const regulars = () =>
  game().arrivals.sources.filter((s) => s === 'regular').length /
  WEATHER_EFFECTS[game().weather].traffic

describe('sale weekends', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('plans more visitors on sale weekends than the weekends before', () => {
    let sale = 0
    let plain = 0
    for (let from = 1; from < DAYS_PER_YEAR;) {
      const { day, event } = nextEvent(from)
      if (day > DAYS_PER_YEAR) break
      for (let i = 0; i < EVENT_DAYS; i++) {
        skipTo(day + i)
        expect(eventOn(game().clock.day)).toBe(event)
        sale += regulars()
        skipTo(day + i - 7)
        plain += regulars()
      }
      from = day
    }
    expect(sale).toBeGreaterThan(plain * 1.4)
  })

  it('warns a week ahead and announces the opening morning', () => {
    const { day, event } = nextEvent(1)
    skipTo(day - 7)
    expect(game().notice?.text).toContain(`${event.label} sale starts next Friday`)
    skipTo(day)
    expect(game().notice?.text).toContain(`${event.label} sale starts today`)
  })

  it('brings customers who hope for a bigger discount', () => {
    const { day } = nextEvent(1)
    const average = () => {
      game().devSpawnCustomers(30)
      const all = game().customers
      return all.reduce((sum, c) => sum + c.expect, 0) / all.length
    }
    skipTo(day - 7)
    const plain = average()
    skipTo(day)
    expect(average()).toBeGreaterThan(plain + 0.02)
  })
})
