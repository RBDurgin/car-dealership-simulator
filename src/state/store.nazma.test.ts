import { beforeEach, describe, expect, it } from 'vitest'
import { SMUDGE_DIRT } from '../sim/cleanliness'
import { FIRST_NAZMA_DAY, isNazmaDay, NAZMA_ID, type NazmaVisit } from '../sim/nazma'
import { createSave } from '../sim/save'
import { wageFor, type Employee } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const car = (id: string) => game().inventory.find((c) => c.id === id)!

/** Resumes the game on the morning of `day`. */
function startDay(day: number) {
  game().loadGame({ ...createSave(game(), 0), day: day - 1 })
}

/** Puts Nazma on the lot today, heading for `targets`. */
function onLot(targets: string[]): NazmaVisit {
  const visit: NazmaVisit = {
    scheme: 'smudge',
    targets,
    arrivalMinute: 600,
    status: 'coming',
    progress: 0,
  }
  useGame.setState({ nazma: visit })
  game().nazmaArrived()
  return game().nazma!
}

describe('Nazma', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('stays away for the first days and plans a smudging visit on day 4', () => {
    for (let day = 2; day < FIRST_NAZMA_DAY; day++) {
      startDay(day)
      expect(game().nazma).toBeNull()
    }
    startDay(FIRST_NAZMA_DAY)
    const v = game().nazma!
    expect(v.scheme).toBe('smudge')
    expect(v.status).toBe('coming')
    for (const id of v.targets) expect(car(id).status).toBe('available')
  })

  it('plans the same visit for the same day', () => {
    startDay(FIRST_NAZMA_DAY)
    const first = game().nazma
    useGame.setState(initial, true)
    startDay(FIRST_NAZMA_DAY)
    expect(game().nazma).toEqual(first)
  })

  it('comes only on his days', () => {
    const quiet = [5, 6, 7, 8, 9, 10, 11, 12].find((d) => !isNazmaDay(d, false))!
    startDay(quiet)
    expect(game().nazma).toBeNull()
  })

  it('comes less often with a security guard on the payroll', () => {
    const guard: Employee = {
      id: 'staff-1-1',
      name: 'Gus K.',
      variant: 'male-c',
      role: 'security',
      skill: 3,
      wage: wageFor('security', 3),
      status: 'off',
      fired: false,
    }
    const deterred = Array.from({ length: 60 }, (_, i) => FIRST_NAZMA_DAY + 1 + i).find(
      (d) => isNazmaDay(d, false) && !isNazmaDay(d, true),
    )!
    startDay(deterred)
    expect(game().nazma).not.toBeNull()
    useGame.setState(initial, true)
    useGame.setState({ roster: [guard] })
    startDay(deterred)
    expect(game().nazma).toBeNull()
  })

  it('is run off by the guard', () => {
    onLot(['lot-car-1'])
    game().nazmaRunOff('guard')
    expect(game().nazma?.status).toBe('runOff')
    expect(game().dayStats.nazma.runOff).toBe('guard')
    expect(game().notice?.text).toMatch(/Your guard ran Nazma off/)
  })

  it('introduces himself on his first visit', () => {
    startDay(FIRST_NAZMA_DAY)
    game().nazmaArrived()
    expect(game().nazma?.status).toBe('onLot')
    expect(game().dayStats.nazma.visited).toBe(true)
    expect(game().notice?.text).toMatch(/used to work here/)
  })

  it('smudges his targets in order', () => {
    onLot(['lot-car-1', 'lot-car-2'])
    // Not the car he's after.
    game().nazmaSmudge('lot-car-2')
    expect(car('lot-car-2').cleanliness).toBe(1)
    game().nazmaSmudge('lot-car-1')
    expect(car('lot-car-1').cleanliness).toBeCloseTo(1 - SMUDGE_DIRT)
    expect(game().nazma?.progress).toBe(1)
    expect(game().dayStats.nazma.smudged).toBe(1)
    expect(game().notice?.text).toMatch(/Nazma smeared/)
  })

  it('moves on from a car that sold without counting it', () => {
    onLot(['lot-car-1', 'lot-car-2'])
    game().sellCar('lot-car-1')
    game().nazmaSmudge('lot-car-1')
    expect(game().nazma?.progress).toBe(1)
    expect(game().dayStats.nazma.smudged).toBe(0)
  })

  it('is run off when the player confronts him, and smudges no more', () => {
    onLot(['lot-car-1', 'lot-car-2'])
    game().requestAction(NAZMA_ID, 'confront')
    const a = game().activeAction!
    expect(a.action).toBe('confront')
    game().arriveAction(a.id)
    expect(game().nazma?.status).toBe('runOff')
    expect(game().dayStats.nazma.runOff).toBe('player')
    expect(game().notice?.text).toMatch(/ran Nazma off/)
    game().nazmaSmudge('lot-car-1')
    expect(car('lot-car-1').cleanliness).toBe(1)
    // Running off and leaving don't change who did it.
    game().nazmaLeft()
    expect(game().nazma?.status).toBe('runOff')
  })

  it("can't be confronted when he isn't on the lot", () => {
    startDay(FIRST_NAZMA_DAY)
    game().requestAction(NAZMA_ID, 'confront')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/isn't here/)
  })

  it('drops a chase when he leaves first', () => {
    onLot(['lot-car-1'])
    game().requestAction(NAZMA_ID, 'confront')
    expect(game().activeAction).not.toBeNull()
    game().nazmaLeft()
    expect(game().nazma?.status).toBe('done')
    expect(game().activeAction).toBeNull()
    expect(game().dayStats.nazma.runOff).toBeNull()
  })

  it("starts each day's tally afresh", () => {
    onLot(['lot-car-1'])
    game().nazmaSmudge('lot-car-1')
    startDay(FIRST_NAZMA_DAY + 1)
    expect(game().dayStats.nazma.smudged).toBe(0)
  })
})
