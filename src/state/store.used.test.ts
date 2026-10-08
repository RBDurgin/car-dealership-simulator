import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Share of `n` new arrivals who are used-car shoppers. */
function usedShoppers(n = 400): number {
  game().devSpawnCustomers(n)
  const cs = game().customers
  return cs.filter((c) => c.archetype === 'used-shopper').length / cs.length
}

describe('used-car shoppers', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
    useGame.setState({ customers: [] })
  })

  it('mostly stay away while there is no used car for sale', () => {
    expect(game().inventory.some((c) => c.used)).toBe(false)
    expect(usedShoppers()).toBeLessThan(0.08)
  })

  it('come in their usual numbers once there is one', () => {
    const used = { year: 2021, miles: 60_000, condition: 0.6, acquiredDay: 1 }
    useGame.setState({
      inventory: game().inventory.map((c) => (c.id === 'lot-car-1' ? { ...c, used } : c)),
    })
    expect(usedShoppers()).toBeGreaterThan(0.14)
  })

  it('count the ones who find no used car as missed, apart from body types', () => {
    usedShoppers()
    const shoppers = game().customers.filter((c) => c.archetype === 'used-shopper').length
    expect(shoppers).toBeGreaterThan(0)
    expect(game().dayStats.missedUsed).toBe(shoppers)
  })
})
