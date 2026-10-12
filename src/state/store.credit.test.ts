import { beforeEach, describe, expect, it } from 'vitest'
import { OPEN_MINUTE } from '../sim/clock'
import { LAST_ARRIVAL_MINUTE } from '../sim/spawner'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

describe("shoppers' credit", () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame('medium')
  })

  it('gives every arriving shopper credit, and sellers none', () => {
    for (let minute = OPEN_MINUTE + 10; minute <= LAST_ARRIVAL_MINUTE; minute += 10) {
      game().tickClock({ day: 1, minute })
    }
    const all = game().customers
    expect(all.length).toBeGreaterThan(0)
    for (const c of all) {
      if (c.selling || c.service) expect(c.credit).toBeNull()
      else expect(c.credit).not.toBeNull()
    }
  })

  it('gives a walk-in credit', () => {
    const id = game().walkIn('male-a')!
    expect(game().customers.find((c) => c.id === id)?.credit).not.toBeNull()
  })
})
