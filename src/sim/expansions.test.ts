import { describe, expect, it } from 'vitest'
import {
  buyExpansion,
  EXPANSIONS,
  expansionBlocker,
  expansionsUp,
  installedExpansions,
  unlockedBy,
  type ExpansionBook,
} from './expansions'
import { buildInventory } from './inventory'
import { PARKING_SPACES } from './layout'
import { FIRST_THEFT_DAY, isTheftNight, planTheft, planVisit } from './jaguar'
import { deliver, type Order } from './ordering'
import { createRng } from './rng'

const book = (extra: Partial<ExpansionBook> = {}): ExpansionBook => ({
  cash: 100_000,
  expansions: [],
  rank: 'main-street',
  ...extra,
})

describe('expansions', () => {
  it('sells the east lot from Main Street, paid now', () => {
    const r = buyExpansion(book(), 'east-lot', 20)
    expect(r).toEqual({
      ok: true,
      cash: 100_000 - EXPANSIONS['east-lot'].cost,
      expansions: [{ id: 'east-lot', day: 20 }],
    })
  })

  it('needs the rank first, then the cash, and sells each once', () => {
    expect(expansionBlocker(book({ rank: 'corner-lot' }), 'east-lot')).toBe(
      'Needs the Main Street rank.',
    )
    expect(expansionBlocker(book({ rank: 'regional-name' }), 'east-lot')).toBeNull()
    expect(expansionBlocker(book({ cash: 59_999 }), 'east-lot')).toBe('Not enough cash for that.')
    expect(expansionBlocker(book({ expansions: [{ id: 'east-lot', day: 3 }] }), 'east-lot')).toBe(
      'Already bought.',
    )
    expect(buyExpansion(book({ rank: 'corner-lot' }), 'east-lot', 20).ok).toBe(false)
  })

  it('goes up the night after it’s bought', () => {
    const owned = [{ id: 'east-lot' as const, day: 20 }]
    expect(installedExpansions(owned, 20)).toEqual([])
    expect(installedExpansions(owned, 21)).toEqual(['east-lot'])
    expect(expansionsUp({ expansions: owned, clock: { day: 21 } })).toEqual(['east-lot'])
    expect(expansionsUp({ expansions: owned })).toEqual([])
  })

  it('sells the showroom wing from Regional Name, once the east lot is bought', () => {
    const lot = [{ id: 'east-lot' as const, day: 3 }]
    const rich = book({ cash: 200_000, rank: 'regional-name', expansions: lot })
    expect(EXPANSIONS['showroom-wing'].cost).toBe(150_000)
    expect(expansionBlocker({ ...rich, rank: 'trusted-dealer' }, 'showroom-wing')).toBe(
      'Needs the Regional Name rank.',
    )
    expect(expansionBlocker({ ...rich, expansions: [] }, 'showroom-wing')).toBe(
      'Needs the east lot first.',
    )
    expect(expansionBlocker({ ...rich, cash: 149_999 }, 'showroom-wing')).toBe(
      'Not enough cash for that.',
    )
    expect(buyExpansion(rich, 'showroom-wing', 40)).toEqual({
      ok: true,
      cash: 50_000,
      expansions: [...lot, { id: 'showroom-wing', day: 40 }],
    })
  })

  it('tells which a rank-up makes available', () => {
    expect(unlockedBy('trusted-dealer', 'regional-name')).toEqual(['showroom-wing'])
    expect(unlockedBy('corner-lot', 'dealer-of-the-year')).toEqual([
      'east-lot',
      'service-bay',
      'showroom-wing',
    ])
    expect(unlockedBy('corner-lot', 'main-street')).toEqual(['east-lot'])
    expect(unlockedBy('corner-lot', 'trusted-dealer')).toEqual(['east-lot', 'service-bay'])
    expect(unlockedBy('main-street', 'trusted-dealer')).toEqual(['service-bay'])
    expect(unlockedBy('corner-lot', 'corner-lot')).toEqual([])
  })
})

describe('the east lot and Jaguar', () => {
  // Only one car on the lot, in the east lot's first space.
  const index = PARKING_SPACES.findIndex((sp) => sp.requires === 'east-lot')
  const order: Order = {
    id: 'order-20-1',
    model: 'suv-luxury',
    cost: 50_000,
    financing: 'cash',
    slot: { location: 'lot', index },
    day: 20,
  }
  const [car] = deliver([order], createRng(1), 21)
  const showroom = buildInventory(createRng(1)).filter((c) => c.location === 'showroom')
  const inventory = [...showroom, car]

  it('smudges cars parked there', () => {
    const visit = planVisit(createRng(3), inventory)!
    expect(visit.scheme).toBe('smudge')
    expect(visit.targets[0]).toBe(car.id)
  })

  it('steals cars parked there', () => {
    let day = FIRST_THEFT_DAY
    while (!isTheftNight(day)) day++
    expect(planTheft(createRng(1), day, inventory, false)).toEqual({ outcome: 'stolen', car })
  })
})
