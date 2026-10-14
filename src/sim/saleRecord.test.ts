import { describe, expect, it } from 'vitest'
import { generateCustomer, PLAYER_ID, type Customer } from './customers'
import { saleRecord, type SaleTerms } from './deal'
import { buildInventory } from './inventory'
import { createRng } from './rng'
import { FINANCE_FEE, salesCommission, wageFor, type Employee, type Role } from './staff'
import type { Client } from './clients'

const inventory = buildInventory(createRng(2026))
const car = inventory[0]
const buyer: Customer = {
  ...generateCustomer('c1', inventory, createRng(3)),
  handlerId: PLAYER_ID,
  sellerId: PLAYER_ID,
}

const employee = (id: string, role: Role, name: string): Employee => ({
  id,
  name,
  variant: 'male-c',
  role,
  skill: 3,
  wage: wageFor(role, 3),
  status: 'atPost',
  fired: false,
  quitting: false,
  xp: 0,
  potential: 5,
  hiredDay: 1,
  raiseAsk: null,
})
const sam = employee('e1', 'sales', 'Sam R.')
const fran = employee('e2', 'finance', 'Fran T.')

const terms = (over: Partial<SaleTerms> = {}): SaleTerms => ({
  price: car.msrp - 500,
  day: 4,
  minute: 600,
  roster: [sam, fran],
  signer: null,
  book: [],
  tradePrice: null,
  ...over,
})

describe('saleRecord', () => {
  it('records a sale the player made and signed, with no commission', () => {
    const sale = saleRecord(buyer, car, terms())
    expect(sale).toEqual({
      customerName: buyer.name,
      carId: car.id,
      model: car.model,
      price: car.msrp - 500,
      msrp: car.msrp,
      cost: car.cost,
      minute: 600,
      soldBy: null,
      signedBy: null,
      commission: 0,
      source: buyer.source,
    })
  })

  it('names the salesperson and the finance manager, and pays each their share', () => {
    const c = { ...buyer, sellerId: sam.id }
    const sale = saleRecord(c, car, terms({ signer: fran }))
    expect(sale).toMatchObject({ soldBy: 'Sam R.', sellerId: sam.id, signedBy: 'Fran T.' })
    expect(sale.commission).toBe(salesCommission(sale.price, car.cost) + FINANCE_FEE)
  })

  it('says "Former staff" for a salesperson let go since', () => {
    const c = { ...buyer, sellerId: 'gone' }
    expect(saleRecord(c, car, terms({ roster: [] })).soldBy).toBe('Former staff')
  })

  it("marks a used car, a returning client and the buyer's last round", () => {
    const client = { id: 'client-1', status: 'client' } as Client
    const c: Customer = {
      ...buyer,
      clientId: client.id,
      haggle: { round: 99, lastAsk: car.msrp, counter: car.msrp - 1000 },
    }
    const used = { ...car, used: { year: 2020, miles: 40_000, condition: 0.7, acquiredDay: 1 } }
    const sale = saleRecord(c, used, terms({ book: [client] }))
    expect(sale).toMatchObject({ used: true, returning: true, lastRound: true })
    // A prospect isn't a returning client.
    const prospect = { ...client, status: 'prospect' } as Client
    expect(saleRecord(c, used, terms({ book: [prospect] })).returning).toBeUndefined()
  })

  it('records the trade-in only when the buyer drove one in', () => {
    expect(saleRecord(buyer, car, terms({ tradePrice: 5000 })).trade).toBeUndefined()
    const trader: Customer = {
      ...buyer,
      vehicle: {
        car: { model: 'sedan', year: 2019, miles: 50_000, condition: 0.8, acquiredDay: 1 },
        spot: 0,
        parked: true,
      },
    }
    expect(saleRecord(trader, car, terms({ tradePrice: 5000 })).trade).toMatchObject({
      model: 'sedan',
      allowance: 5000,
    })
  })
})
