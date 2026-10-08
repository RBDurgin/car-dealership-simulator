import { describe, expect, it } from 'vitest'
import { WASH_BELOW } from './cleanliness'
import { generateCustomer, PLAYER_ID, type Customer } from './customers'
import { buildInventory, type InventoryCar } from './inventory'
import type { NazmaVisit } from './nazma'
import { createRng } from './rng'
import { LOW_CASH, TIP_IDS, tipFor, tipText, TIPS, type TipId, type TipState } from './tips'

const inventory = buildInventory(createRng(42)).map((c) => ({ ...c, cleanliness: 1 }))
const customer = (id: string, patch: Partial<Customer> = {}): Customer => ({
  ...generateCustomer(id, inventory, createRng(1)),
  handlerId: PLAYER_ID,
  phase: 'talking',
  ...patch,
})
const nazma = (status: NazmaVisit['status']): NazmaVisit => ({
  scheme: 'smudge',
  status,
  targets: [],
  progress: 0,
  arrivalMinute: 600,
  chatting: false,
})

const base: TipState = {
  screen: 'playing',
  cash: 20_000,
  inventory,
  customers: [customer('c1')],
  dayStats: { missed: {} },
  owner: null,
  nazma: null,
}
const sellerCar = (parked: boolean): Partial<Customer> => ({
  phase: parked ? 'waiting' : 'arriving',
  handlerId: null,
  vehicle: {
    car: { model: 'sedan', year: 2020, miles: 70_000, condition: 0.6, acquiredDay: 1 },
    spot: 0,
    parked,
  },
  selling: { hope: 9_000, estimate: { estimate: 8_500, margin: 2_000 }, appraised: false },
})
const tradeCar = (parked: boolean): Partial<Customer> => {
  const { selling, ...rest } = sellerCar(parked)
  return { ...rest, phase: parked ? 'browsing' : 'arriving', trade: selling }
}
const withCar = (patch: Partial<InventoryCar>) =>
  inventory.map((c, i) => (i === 0 ? { ...c, ...patch } : c))

/** The tip for a change from `prev` (patched onto base) to `next`. */
const tip = (next: Partial<TipState>, prev: Partial<TipState> = {}, seen: TipId[] = []) =>
  tipFor({ ...base, ...prev }, { ...base, ...next }, seen)

const triggers: Record<TipId, [Partial<TipState>, Partial<TipState>]> = {
  wash: [{ inventory: withCar({ cleanliness: WASH_BELOW - 0.01 }) }, {}],
  haggle: [
    { customers: [customer('c1', { haggle: { round: 2, lastAsk: 30_000, counter: 28_000 } })] },
    {},
  ],
  restock: [{ inventory: withCar({ status: 'sold' }) }, {}],
  missed: [{ dayStats: { missed: { sedan: 1 } } }, {}],
  nazma: [{ nazma: nazma('onLot') }, { nazma: nazma('coming') }],
  owner: [
    { owner: { goal: { kind: 'noImpatient' }, announced: true } },
    { owner: { goal: { kind: 'noImpatient' }, announced: false } },
  ],
  lowCash: [{ cash: LOW_CASH - 1 }, { cash: LOW_CASH }],
  seller: [
    { customers: [customer('c2', sellerCar(true))] },
    { customers: [customer('c2', sellerCar(false))] },
  ],
  tradeIn: [
    { customers: [customer('c3', tradeCar(true))] },
    { customers: [customer('c3', tradeCar(false))] },
  ],
}

describe('tipFor', () => {
  it('has a text for every tip', () => {
    for (const id of TIP_IDS) expect(tipText(id)).toBe(`Tip: ${TIPS[id]}`)
  })

  it.each(TIP_IDS)('gives the %s tip when it first happens, and never once seen', (id) => {
    const [next, prev] = triggers[id]
    expect(tip(next, prev)).toBe(id)
    expect(tip(next, prev, [id])).toBeNull()
  })

  it('gives nothing when nothing changed', () => {
    expect(tip({})).toBeNull()
  })

  it('stays quiet on the title screen and as a game starts from it', () => {
    const [next, prev] = triggers.lowCash
    expect(tip({ ...next, screen: 'title' }, prev)).toBeNull()
    expect(tip(next, { ...prev, screen: 'title' })).toBeNull()
  })

  it('only counts crossings, not a car already dirty or cash already low', () => {
    const dirty = withCar({ cleanliness: 0.5 })
    expect(tip({ inventory: withCar({ cleanliness: 0.4 }) }, { inventory: dirty })).toBeNull()
    expect(tip({ cash: 1_000 }, { cash: 2_000 })).toBeNull()
  })

  it('doesn’t count a dirty car that was sold, or a salesperson’s counter', () => {
    expect(tip({ inventory: withCar({ status: 'sold', cleanliness: 0.5 }) }, {}, ['restock'])).toBe(
      null,
    )
    const staff = customer('c1', {
      handlerId: 'staff-1-1',
      haggle: { round: 2, lastAsk: 30_000, counter: 28_000 },
    })
    expect(tip({ customers: [staff] })).toBeNull()
  })

  it('gives the first unseen tip when several apply', () => {
    const next = { cash: LOW_CASH - 1, nazma: nazma('onLot') }
    expect(tip(next)).toBe('nazma')
    expect(tip(next, {}, ['nazma'])).toBe('lowCash')
  })
})
