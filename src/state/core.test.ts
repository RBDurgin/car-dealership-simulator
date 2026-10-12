import { describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { transactional } from './core'
import { useGame } from './store'
import type { GameState } from './types'

const initial = useGame.getState()
const game = () => useGame.getState()

/** A kit over a plain object, counting the sets that reach it. */
function kit() {
  let state = { cash: 1, reputation: 50 } as GameState
  let sets = 0
  const k = transactional(
    (p) => {
      state = { ...state, ...p }
      sets++
    },
    () => state,
  )
  return { k, sets: () => sets, state: () => state }
}

describe('transactional', () => {
  it('passes sets straight through outside a batch', () => {
    const { k, sets, state } = kit()
    k.set({ cash: 2 })
    k.set((s) => ({ cash: s.cash + 1 }))
    expect(state().cash).toBe(3)
    expect(sets()).toBe(2)
  })

  it('stores a batch with one set, reading its own writes as it goes', () => {
    const { k, sets, state } = kit()
    const seen = k.batch(() => {
      k.set({ cash: 2 })
      k.set((s) => ({ cash: s.cash * 10 }))
      // A batch inside a batch joins it.
      k.batch(() => k.set({ reputation: 60 }))
      return k.get().cash
    })
    expect(seen).toBe(20)
    expect(state()).toMatchObject({ cash: 20, reputation: 60 })
    expect(sets()).toBe(1)
  })

  it('makes no set for a batch that changed nothing', () => {
    const { k, sets } = kit()
    expect(k.batch(() => k.get().cash)).toBe(1)
    expect(sets()).toBe(0)
  })

  it('keeps what a batch stored before it threw', () => {
    const { k, sets, state } = kit()
    expect(() =>
      k.batch(() => {
        k.set({ cash: 5 })
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(state().cash).toBe(5)
    expect(sets()).toBe(1)
    k.set({ cash: 6 })
    expect(sets()).toBe(2)
  })
})

describe('one set per clock step', () => {
  it('runs the listeners once per tick and once per morning', () => {
    useGame.setState(initial, true)
    game().newGame('medium')
    let sets = 0
    const unsubscribe = useGame.subscribe(() => {
      sets++
    })
    for (let minute = OPEN_MINUTE + 10; minute <= CLOSE_MINUTE; minute += 10) {
      const before = sets
      game().tickClock({ day: 1, minute })
      expect(sets - before).toBe(1)
    }
    for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
    expect(game().dayStats.settled).toBe(true)
    const before = sets
    game().startNextDay()
    expect(sets - before).toBe(1)
    expect(game().clock.day).toBe(2)
    unsubscribe()
  })
})
