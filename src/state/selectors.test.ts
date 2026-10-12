import { beforeEach, describe, expect, it } from 'vitest'
import { PLAYER_ID } from '../sim/customers'
import {
  buyBlockerFor,
  customerById,
  groundUp,
  lotRoom,
  memoLast,
  sellerBonusOf,
  upNow,
} from './selectors'
import { sellerBonusFor, useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

describe('memoLast', () => {
  it('gives the last result back for the same arguments, and computes afresh for new ones', () => {
    let calls = 0
    const f = memoLast((xs: readonly number[], n: number) => {
      calls++
      return xs.map((x) => x * n)
    })
    const xs = [1, 2]
    const a = f(xs, 2)
    expect(f(xs, 2)).toBe(a)
    expect(calls).toBe(1)
    expect(f([1, 2], 2)).not.toBe(a)
    expect(f(xs, 3)).toEqual([3, 6])
    expect(calls).toBe(3)
  })
})

describe('memoised selectors', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame('medium')
  })

  it('upNow and groundUp keep their reference until improvements, expansions or the day change', () => {
    const up = upNow(game())
    const ground = groundUp(game())
    useGame.setState({ cash: game().cash + 1, timeScale: 4 })
    expect(upNow(game())).toBe(up)
    expect(groundUp(game())).toBe(ground)
    useGame.setState({ improvements: [...game().improvements] })
    expect(upNow(game())).not.toBe(up)
    expect(upNow(game())).toEqual(up)
  })

  it('customerById finds each customer, with the index kept while customers are the same', () => {
    game().devSpawnCustomers(3)
    const s = game()
    for (const c of s.customers) expect(customerById(s, c.id)).toBe(c)
    expect(customerById(s, 'nobody')).toBeNull()
    useGame.setState({ timeScale: 4 })
    expect(customerById(game(), s.customers[0].id)).toBe(s.customers[0])
  })

  it('sellerBonusOf agrees with sellerBonusFor and is kept while its inputs are', () => {
    game().devSpawnCustomers(1)
    const c = { ...game().customers[0], handlerId: PLAYER_ID }
    const bonus = sellerBonusOf(game(), c)
    expect(bonus).toBe(sellerBonusFor(game(), c))
    useGame.setState({ timeScale: 4 })
    expect(sellerBonusOf(game(), c)).toBe(bonus)
  })

  it('lotRoom and buyBlockerFor agree with the rules they cache', () => {
    expect(lotRoom(game())).toBe(true)
    expect(buyBlockerFor(game(), 0)).toBeNull()
    expect(buyBlockerFor(game(), game().cash + 1)).toBe('Not enough cash.')
    expect(buyBlockerFor(game(), game().cash + 1)).toBe('Not enough cash.')
  })
})
