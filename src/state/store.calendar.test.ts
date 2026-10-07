import { beforeEach, describe, expect, it } from 'vitest'
import { calendarOf } from '../sim/calendar'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats } from '../sim/deal'
import { VISITORS_PER_DAY } from '../sim/spawner'
import { useGame } from './store'

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

const regulars = () => game().arrivals.sources.filter((s) => s === 'regular').length

describe('weekly rhythm', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('plans more visitors on Saturday and fewer on Sunday', () => {
    const byWeekday: number[][] = Array.from({ length: 7 }, () => [])
    for (let i = 0; i < 28; i++) {
      nextDay()
      byWeekday[calendarOf(game().clock.day).weekday].push(regulars())
    }
    const [sat, sun] = [byWeekday[5], byWeekday[6]]
    // Even the quietest Saturday beats the busiest Sunday.
    expect(Math.min(...sat)).toBeGreaterThan(Math.max(...sun))
    expect(Math.min(...sat)).toBeGreaterThan(VISITORS_PER_DAY.min)
    expect(Math.max(...sun)).toBeLessThan(VISITORS_PER_DAY.max)
  })

  it('plans the first day as a Monday', () => {
    expect(regulars()).toBeLessThanOrEqual(Math.round(VISITORS_PER_DAY.max * 0.8))
  })
})
