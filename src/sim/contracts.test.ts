import { describe, expect, it } from 'vitest'
import { calendarOf } from './calendar'
import type { Client, ClientCar } from './clients'
import {
  addContracts,
  CLAIM_EVERY,
  claimChance,
  claimQuote,
  contractCar,
  contractSummary,
  contractVisits,
  holderOf,
  inForce,
  liveContracts,
  MAX_CONTRACTS,
  newContract,
  WARRANTY_DAYS,
  type Contract,
} from './contracts'
import { createRng } from './rng'
import { clientJob, JOBS, warrantyPay, WARRANTY_HOURLY } from './service'

const car: ClientCar = {
  model: 'sedan',
  used: false,
  price: 30_000,
  boughtDay: 10,
  year: 2026,
  miles: 0,
  condition: 1,
}

const contract = (id: string, day = 10): Contract =>
  newContract(id, 'Ann K.', { ...car, boughtDay: day }, day, 1800)

describe('warranty contracts', () => {
  it('run from the day after the sale for WARRANTY_DAYS', () => {
    const c = contract('c-1')
    expect(c.endDay).toBe(10 + WARRANTY_DAYS)
    expect(inForce(c, 10)).toBe(false)
    expect(inForce(c, 11)).toBe(true)
    expect(inForce(c, c.endDay)).toBe(true)
    expect(inForce(c, c.endDay + 1)).toBe(false)
  })

  it('are dropped once they run out, and kept to the newest MAX_CONTRACTS', () => {
    const list = [contract('old', 1), contract('new', 50)]
    expect(liveContracts(list, 20)).toBe(list)
    expect(liveContracts(list, 2 + WARRANTY_DAYS).map((c) => c.id)).toEqual(['new'])

    const many = Array.from({ length: MAX_CONTRACTS + 5 }, (_, i) => contract(`c-${i}`, 10))
    const kept = liveContracts(many, 20)
    expect(kept).toHaveLength(MAX_CONTRACTS)
    expect(kept[0].id).toBe('c-5')
    expect(addContracts(kept, [contract('more')]).at(-1)!.id).toBe('more')
    expect(addContracts(kept, [contract('more')])).toHaveLength(MAX_CONTRACTS)
    expect(addContracts(kept, [])).toBe(kept)
  })

  it('bring a claim about once every CLAIM_EVERY days, never on a Sunday', () => {
    const sunday = Array.from({ length: 7 }, (_, i) => 100 + i).find(
      (d) => calendarOf(d).weekday === 6,
    )!
    expect(claimChance(sunday)).toBe(0)
    let week = 0
    for (let d = 100; d < 107; d++) week += claimChance(d)
    expect(week / 7).toBeCloseTo(1 / CLAIM_EVERY, 6)

    const list = Array.from({ length: 100 }, (_, i) => contract(`c-${i}`, 1))
    let claims = 0
    const days = 280
    for (let day = 2; day < 2 + days; day++) {
      const visits = contractVisits(list, day, createRng(day))
      if (calendarOf(day).weekday === 6) expect(visits).toEqual([])
      claims += visits.length
    }
    const expected = (100 * days) / CLAIM_EVERY
    expect(claims).toBeGreaterThan(expected * 0.85)
    expect(claims).toBeLessThan(expected * 1.15)
  })

  it('only claim while in force, within what the bays can take, in minute order', () => {
    const list = [contract('a', 1), contract('b', 1), contract('later', 300)]
    let seen = 0
    for (let day = 2; day < 290; day++) {
      const visits = contractVisits(list, day, createRng(day), 1)
      expect(visits.length).toBeLessThanOrEqual(1)
      expect(visits.map((v) => v.contractId)).not.toContain('later')
      seen += visits.length
    }
    expect(seen).toBeGreaterThan(0)
    const visits = contractVisits(list, 20, createRng(5), Infinity)
    expect([...visits].sort((a, b) => a.minute - b.minute)).toEqual(visits)
    expect(contractVisits(list, 20, createRng(5), 0)).toEqual([])
  })

  it('are paid by the warranty company: book time at WARRANTY_HOURLY, parts at cost', () => {
    const q = claimQuote(createRng(3))
    expect(q.labor).toBe(0)
    expect(q.parts).toBe(0)
    expect(q.partsCost).toBeGreaterThanOrEqual(JOBS.repair.parts.min)
    expect(q.partsCost).toBeLessThanOrEqual(JOBS.repair.parts.max)
    const pay = warrantyPay(q.partsCost, 'repair')
    expect(pay).toBe(Math.round((JOBS.repair.minutes / 60) * WARRANTY_HOURLY) + q.partsCost)

    const client = { name: 'Ann K.', model: 'sedan' as const, condition: 0.9 }
    const job = clientJob('j-1', 'repair', 'cust', q, client, false, 'c-1')
    expect(job).toMatchObject({ contractId: 'c-1', warranty: pay, labor: 0, parts: 0 })
    // A redo is on us.
    expect(clientJob('j-2', 'repair', 'cust', q, client, true, 'c-1').warranty).toBe(0)
    // Without a contract, a repair is the client's to pay.
    expect(clientJob('j-3', 'repair', 'cust', q, client).warranty).toBe(0)
  })

  it('know their holder in the book, and age the car they cover', () => {
    const c = contract('c-1', 10)
    const holder = { id: 'client-1', name: 'Ann K.', car: { ...car } } as Client
    const other = { id: 'client-2', name: 'Ann K.', car: { ...car, boughtDay: 11 } } as Client
    expect(holderOf([other, holder], c)).toBe(holder)
    expect(holderOf([other], c)).toBeNull()

    const aged = contractCar(c, 10 + 400)
    expect(aged.model).toBe('sedan')
    expect(aged.miles).toBeGreaterThan(0)
    expect(aged.condition).toBeLessThan(1)
  })

  it('count those in force and those running out soon', () => {
    const list = [contract('a', 1), contract('b', 100)]
    expect(contractSummary(list, 50)).toEqual({ live: 2, ending: 0 })
    expect(contractSummary(list, WARRANTY_DAYS - 5)).toEqual({ live: 2, ending: 1 })
    expect(contractSummary(list, WARRANTY_DAYS + 2)).toEqual({ live: 1, ending: 0 })
  })
})
