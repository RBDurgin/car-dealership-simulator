import { describe, expect, it } from 'vitest'
import { PLAYER_ID } from './customers'
import { isJaguarDay } from './jaguar'
import {
  chattingWith,
  COFFEE_STOP,
  CUPCAKE_FLAVOURS,
  FIRST_NAZMA_DAY,
  isNazmaVisitDay,
  NAZMA_STOPS,
  NAZMA_WINDOW,
  nazmaSeed,
  nextStop,
  planNazmaVisit,
  specialOf,
  type NazmaVisit,
} from './nazma'
import { createRng } from './rng'
import { wageFor, type Employee } from './staff'

const days = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const employee = (id: string, fired = false): Employee => ({
  id,
  name: id,
  role: 'sales',
  skill: 3,
  wage: wageFor('sales', 3),
  variant: 'female-b',
  status: 'atPost',
  fired,
  quitting: false,
})

describe('isNazmaVisitDay', () => {
  it('first visits on day 2, never before', () => {
    const visits = days(100).filter((d) => isNazmaVisitDay(d))
    expect(visits[0]).toBe(FIRST_NAZMA_DAY)
  })

  it('comes now and then, about 30% of days', () => {
    const share = days(1000).filter((d) => isNazmaVisitDay(d)).length / 1000
    expect(share).toBeGreaterThan(0.22)
    expect(share).toBeLessThan(0.38)
  })

  it('never on a Jaguar day', () => {
    for (const d of days(300)) {
      const jaguar = isJaguarDay(d, false)
      if (jaguar) expect(isNazmaVisitDay(d, jaguar)).toBe(false)
    }
    expect(isNazmaVisitDay(FIRST_NAZMA_DAY, true)).toBe(false)
  })
})

describe('planNazmaVisit', () => {
  const roster = [employee('e1'), employee('e2'), employee('gone', true)]

  it('is the same for the same day', () => {
    for (const d of days(30)) {
      expect(planNazmaVisit(createRng(nazmaSeed(d)), roster)).toEqual(
        planNazmaVisit(createRng(nazmaSeed(d)), roster),
      )
    }
  })

  it('makes 1–2 distinct stops at the player, the staff or the coffee machine', () => {
    const allowed = [PLAYER_ID, COFFEE_STOP, 'e1', 'e2']
    for (const d of days(200)) {
      const v = planNazmaVisit(createRng(nazmaSeed(d)), roster)
      expect(v.stops.length).toBeGreaterThanOrEqual(NAZMA_STOPS.min)
      expect(v.stops.length).toBeLessThanOrEqual(NAZMA_STOPS.max)
      expect(new Set(v.stops).size).toBe(v.stops.length)
      for (const s of v.stops) expect(allowed).toContain(s)
      expect(v.arrivalMinute).toBeGreaterThanOrEqual(NAZMA_WINDOW.from)
      expect(v.arrivalMinute).toBeLessThanOrEqual(NAZMA_WINDOW.to)
      expect(v.status).toBe('coming')
    }
  })

  it('stops at the player or the coffee with nobody on staff', () => {
    for (const d of days(50)) {
      for (const s of planNazmaVisit(createRng(nazmaSeed(d)), []).stops) {
        expect([PLAYER_ID, COFFEE_STOP]).toContain(s)
      }
    }
  })
})

describe('chattingWith', () => {
  const visit: NazmaVisit = {
    stops: [COFFEE_STOP, PLAYER_ID],
    arrivalMinute: 600,
    status: 'onLot',
    progress: 0,
    chatting: true,
  }

  it('is nobody over the coffee, and the person at a person stop', () => {
    expect(nextStop(visit)).toBe(COFFEE_STOP)
    expect(chattingWith(visit)).toBeNull()
    expect(chattingWith({ ...visit, progress: 1 })).toBe(PLAYER_ID)
    expect(chattingWith({ ...visit, progress: 1, chatting: false })).toBeNull()
    expect(chattingWith({ ...visit, progress: 2 })).toBeNull()
    expect(chattingWith(null)).toBeNull()
  })
})

describe('specialOf', () => {
  it('is one of the flavours, the same every time for a day', () => {
    for (const day of days(60)) {
      expect(CUPCAKE_FLAVOURS).toContain(specialOf(day))
      expect(specialOf(day)).toBe(specialOf(day))
    }
  })

  it('never repeats two days running, and works through the menu', () => {
    const run = days(120).map(specialOf)
    run.slice(1).forEach((f, i) => expect(f).not.toBe(run[i]))
    expect(new Set(run).size).toBe(CUPCAKE_FLAVOURS.length)
  })

  it('reads the same however far ahead it was asked first', () => {
    const far = specialOf(300)
    expect(specialOf(299)).not.toBe(far)
    expect(specialOf(300)).toBe(far)
  })
})
