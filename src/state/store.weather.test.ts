import { beforeEach, describe, expect, it } from 'vitest'
import { calendarOf } from '../sim/calendar'
import { NIGHTLY_DIRT } from '../sim/cleanliness'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { emptyStats } from '../sim/deal'
import { WEATHER_EFFECTS, weatherOn } from '../sim/weather'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const car = (id: string) => game().inventory.find((c) => c.id === id)!

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

/** The first day after `from` with `pred`'s weather. */
function firstDay(pred: (w: ReturnType<typeof weatherOn>) => boolean, from = 2): number {
  let day = from
  while (!pred(weatherOn(day))) day++
  return day
}

const waiter = (id: string, carId: string): Customer => ({
  id,
  name: 'Sam W.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 40_000,
  preferredModels: ['sedan'],
  patience: 120,
  patienceLeft: 120,
  browseCarIds: [carId],
  browsed: 1,
  targetCarId: carId,
  offer: null,
  expect: 0.04,
  haggle: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
})

describe('weather', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it("sets each morning's weather from the day", () => {
    expect(game().weather).toBe(weatherOn(1))
    for (let i = 0; i < 10; i++) {
      nextDay()
      expect(game().weather).toBe(weatherOn(game().clock.day))
    }
  })

  it('leaves lot cars dirtier after a rainy night', () => {
    const rainy = firstDay((w) => w === 'rain')
    useGame.setState({ clock: { day: rainy - 1, minute: game().clock.minute } })
    nextDay()
    expect(game().clock.day).toBe(rainy)
    expect(car('lot-car-1').cleanliness).toBeCloseTo(
      1 - NIGHTLY_DIRT.lot * WEATHER_EFFECTS.rain.lotDirt,
    )
    expect(car('display-1').cleanliness).toBeCloseTo(1 - NIGHTLY_DIRT.showroom)
  })

  it('plans fewer visitors on rainy days than dry ones on the same weekday', () => {
    const counts = { rain: [] as number[], dry: [] as number[] }
    for (let i = 0; i < 112; i++) {
      nextDay()
      // Mondays to Thursdays, which share about the same traffic.
      if (calendarOf(game().clock.day).weekday > 3) continue
      const regulars = game().arrivals.sources.filter((s) => s === 'regular').length
      counts[game().weather === 'rain' ? 'rain' : 'dry'].push(regulars)
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(counts.rain.length).toBeGreaterThan(5)
    expect(mean(counts.rain)).toBeLessThan(mean(counts.dry) * 0.8)
  })

  it('wears down customers waiting out on the lot faster in the rain', () => {
    useGame.setState({
      weather: 'rain',
      customers: [waiter('outside', 'lot-car-1'), waiter('inside', 'display-1')],
    })
    const { minute } = game().clock
    game().tickClock({ day: game().clock.day, minute: minute + 20 })
    const left = (id: string) => game().customers.find((c) => c.id === id)!.patienceLeft
    expect(left('inside')).toBe(100)
    expect(left('outside')).toBe(120 - 20 * WEATHER_EFFECTS.rain.lotPatience)
  })

  it("doesn't on a cloudy day", () => {
    useGame.setState({ weather: 'cloudy', customers: [waiter('outside', 'lot-car-1')] })
    const { minute } = game().clock
    game().tickClock({ day: game().clock.day, minute: minute + 20 })
    expect(game().customers[0].patienceLeft).toBe(100)
  })
})
