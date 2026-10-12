import { describe, expect, it } from 'vitest'
import { generateCustomer, type Customer, type CustomerPhase } from './customers'
import { buildInventory } from './inventory'
import { createRng } from './rng'
import { departingOnFire } from './staff'

const inventory = buildInventory(createRng(2026))
const customer = (id: string, phase: CustomerPhase, handlerId: string | null): Customer => ({
  ...generateCustomer(id, inventory, createRng(id.length)),
  phase,
  handlerId,
})

describe('departingOnFire', () => {
  it('sends back to waiting whoever the salesperson let go was still talking round', () => {
    const customers = [
      customer('a', 'talking', 'e1'),
      customer('b', 'considering', 'e1'),
      customer('c', 'talking', 'e2'),
    ]
    const after = departingOnFire(customers, 'e1')
    expect(after.find((c) => c.id === 'a')).toMatchObject({ phase: 'waiting', handlerId: null })
    expect(after.find((c) => c.id === 'b')).toMatchObject({ phase: 'waiting', handlerId: null })
    expect(after.find((c) => c.id === 'c')).toBe(customers[2])
  })

  it('leaves buyers in hand with them, and returns the same list when nobody changes', () => {
    const customers = [customer('a', 'signing', 'e1'), customer('b', 'talking', 'e2')]
    expect(departingOnFire(customers, 'e1')).toBe(customers)
    expect(departingOnFire(customers, 'nobody')).toBe(customers)
  })
})
