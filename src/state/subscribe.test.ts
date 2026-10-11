import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './store'
import { sameFields, subscribeDiff, subscribeTo } from './subscribe'

const initial = useGame.getState()
const game = () => useGame.getState()

describe('subscribeTo', () => {
  const stops: (() => void)[] = []
  beforeEach(() => useGame.setState(initial, true))
  afterEach(() => stops.splice(0).forEach((stop) => stop()))

  it('runs only when what it selects changes, with the new and last picks', () => {
    const seen: [number, number][] = []
    stops.push(
      subscribeTo(
        (s) => s.cash,
        (next, prev) => seen.push([next, prev]),
      ),
    )
    const cash = game().cash
    useGame.setState({ timeScale: 4 })
    useGame.setState({ helpOpen: true })
    expect(seen).toEqual([])
    useGame.setState({ cash: cash + 5 })
    useGame.setState({ cash: cash + 5 })
    expect(seen).toEqual([[cash + 5, cash]])
  })

  it('takes an equality, so a fresh object with the same fields is no change', () => {
    let runs = 0
    stops.push(
      subscribeTo(
        (s) => ({ cash: s.cash, day: s.clock.day }),
        () => runs++,
        (a, b) => a.cash === b.cash && a.day === b.day,
      ),
    )
    useGame.setState({ timeScale: 2 })
    expect(runs).toBe(0)
    useGame.setState({ cash: game().cash + 1 })
    expect(runs).toBe(1)
  })

  it('stops when unsubscribed', () => {
    let runs = 0
    const stop = subscribeTo(
      (s) => s.cash,
      () => runs++,
    )
    stop()
    useGame.setState({ cash: game().cash + 1 })
    expect(runs).toBe(0)
  })

  it('skips a set that a newer one, made inside another listener, has overtaken', () => {
    const seen: number[] = []
    // Subscribed first, so it sets again before the second listener hears the first set.
    stops.push(
      subscribeTo(
        (s) => s.timeScale,
        (scale) => {
          if (scale === 2) useGame.setState({ timeScale: 4 })
        },
      ),
    )
    stops.push(
      subscribeTo(
        (s) => s.timeScale,
        (scale) => seen.push(scale),
      ),
    )
    useGame.setState({ timeScale: 2 })
    // Only the newest, once: never 4 then back to 2.
    expect(seen).toEqual([4])
    expect(game().timeScale).toBe(4)
  })
})

describe('sameFields and subscribeFields', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('compares just the listed fields, by reference', () => {
    const a = game()
    expect(sameFields(a, { ...a, timeScale: 4 }, ['cash', 'customers'])).toBe(true)
    expect(sameFields(a, { ...a, customers: [...a.customers] }, ['cash', 'customers'])).toBe(false)
  })

  it('diffs each change against the state it last saw, in order through a nested set', () => {
    const diffs: [number, number][] = []
    // Subscribed first, so it sets again before the diff hears the first set.
    const stopFirst = subscribeTo(
      (s) => s.timeScale,
      (scale) => {
        if (scale === 2) useGame.setState({ timeScale: 4 })
      },
    )
    const stop = subscribeDiff((prev, next) => diffs.push([prev.timeScale, next.timeScale]))
    const from = game().timeScale
    useGame.setState({ timeScale: 2 })
    // One diff from where it was to the newest, never back to 2.
    expect(diffs).toEqual([[from, 4]])
    stop()
    stopFirst()
  })
})
