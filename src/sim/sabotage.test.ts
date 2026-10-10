import { describe, expect, it } from 'vitest'
import { emptyJaguarStats } from './jaguar'
import { addSabotageDay, emptySabotage, isSabotageRecord } from './sabotage'

describe('addSabotageDay', () => {
  it('leaves the tallies alone on a quiet day', () => {
    const record = { ...emptySabotage(), lastTheftDay: 9 }
    expect(addSabotageDay(record, emptyJaguarStats())).toEqual(record)
  })

  it('adds up a visit, run-offs, smudges, thefts, quitters and those kept', () => {
    const stats = {
      ...emptyJaguarStats(),
      visited: true,
      smudged: 2,
      runOff: 'player' as const,
      stolen: [{ model: 'sedan' as const, cost: 20_000, floored: false }],
      poached: ['Dana R.', 'Lee K.'],
      quit: ['Dana R.'],
      kept: [{ name: 'Lee K.', raise: 25 }],
    }
    const once = addSabotageDay(emptySabotage(), stats)
    expect(once).toEqual({
      lastTheftDay: 0,
      visits: 1,
      runOffByYou: 1,
      runOffByGuard: 0,
      smudged: 2,
      stolen: 1,
      poached: 1,
      kept: 1,
    })
    const guard = addSabotageDay(once, { ...emptyJaguarStats(), visited: true, runOff: 'guard' })
    expect(guard.visits).toBe(2)
    expect(guard.runOffByGuard).toBe(1)
    expect(guard.runOffByYou).toBe(1)
  })
})

describe('isSabotageRecord', () => {
  it('accepts a record and rejects a malformed one', () => {
    expect(isSabotageRecord(emptySabotage())).toBe(true)
    expect(isSabotageRecord({ ...emptySabotage(), lastTheftDay: 12, stolen: 3 })).toBe(true)
    expect(isSabotageRecord(null)).toBe(false)
    expect(isSabotageRecord({ ...emptySabotage(), visits: 'a' })).toBe(false)
    expect(isSabotageRecord({ ...emptySabotage(), smudged: -1 })).toBe(false)
    const { kept: _, ...missing } = emptySabotage()
    expect(isSabotageRecord(missing)).toBe(false)
  })
})
