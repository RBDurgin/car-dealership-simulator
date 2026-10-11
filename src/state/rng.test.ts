import { describe, expect, it } from 'vitest'
import { OPEN_MINUTE } from '../sim/clock'
import { LAST_ARRIVAL_MINUTE } from '../sim/spawner'
import { rng, resetRng, seedDay } from './rng'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Plays day 1's arrivals of a new game and gives who came. */
function dayOneCustomers() {
  useGame.setState(initial, true)
  game().newGame('medium')
  for (let minute = OPEN_MINUTE + 10; minute <= LAST_ARRIVAL_MINUTE; minute += 10) {
    game().tickClock({ day: 1, minute })
  }
  return game().customers.map((c) => ({ id: c.id, name: c.name, archetype: c.archetype }))
}

describe('resettable runtime', () => {
  it('gives the same day-one customers however much was played before', () => {
    const first = dayOneCustomers()
    expect(first.length).toBeGreaterThan(0)
    expect(first[0].id).toBe('customer-1')
    // Use up some randomness and customer ids, as an earlier game would.
    game().devSpawnCustomers(5)
    rng.customer.next()
    rng.deal.next()
    expect(dayOneCustomers()).toEqual(first)
  })

  it('seeds every stream by the day', () => {
    seedDay(3)
    const a = [rng.customer.next(), rng.client.next(), rng.service.next()]
    seedDay(4)
    const b = [rng.customer.next(), rng.client.next(), rng.service.next()]
    seedDay(3)
    expect([rng.customer.next(), rng.client.next(), rng.service.next()]).toEqual(a)
    expect(b).not.toEqual(a)
    resetRng()
    const day1 = rng.customer.next()
    seedDay(1)
    expect(rng.customer.next()).toBe(day1)
  })
})
