import { beforeEach, describe, expect, it } from 'vitest'
import { OPEN_MINUTE } from '../sim/clock'
import { CUSTOMER_PARKING } from '../sim/layout'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const drivers = () => game().customers.filter((c) => c.vehicle)

/** A day's arrivals all at once, at opening: more than there are parking spaces. */
const rush = (count: number) =>
  useGame.setState({
    arrivals: {
      minutes: Array.from({ length: count }, () => OPEN_MINUTE + 10),
      sources: Array.from({ length: count }, () => 'regular' as const),
      spawned: 0,
    },
  })

describe('visitors who drive in', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('parks some arrivals in customer parking, one car to a space', () => {
    rush(30)
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 10 })
    expect(game().customers).toHaveLength(30)
    const spots = drivers().map((c) => c.vehicle!.spot)
    expect(spots).toHaveLength(CUSTOMER_PARKING.length)
    expect(new Set(spots).size).toBe(spots.length)
    for (const c of drivers()) {
      expect(c.phase).toBe('arriving')
      expect(c.vehicle!.parked).toBe(false)
      expect(c.vehicle!.car.acquiredDay).toBe(1)
    }
  })

  it('takes a space again once its car has driven off', () => {
    rush(30)
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 10 })
    const leaver = drivers()[0]
    game().dispatchCustomer({ type: 'parked', id: leaver.id })
    expect(game().customers.find((c) => c.id === leaver.id)?.vehicle?.parked).toBe(true)
    // Not until they're leaving.
    game().dispatchCustomer({ type: 'droveOff', id: leaver.id })
    expect(game().customers.some((c) => c.id === leaver.id)).toBe(true)

    useGame.setState({
      customers: game().customers.map((c) =>
        c.id === leaver.id ? { ...c, phase: 'leaving', leaveReason: 'impatient' } : c,
      ),
    })
    game().dispatchCustomer({ type: 'droveOff', id: leaver.id })
    expect(game().customers.some((c) => c.id === leaver.id)).toBe(false)
    expect(drivers()).toHaveLength(CUSTOMER_PARKING.length - 1)

    rush(30)
    game().tickClock({ day: 1, minute: OPEN_MINUTE + 20 })
    expect(drivers().map((c) => c.vehicle!.spot)).toContain(leaver.vehicle!.spot)
    expect(drivers()).toHaveLength(CUSTOMER_PARKING.length)
  })
})
