import { beforeEach, describe, expect, it } from 'vitest'
import { SMUDGE_DIRT } from '../sim/cleanliness'
import { FIRST_NAZMA_DAY, isNazmaDay, isTheftNight, NAZMA_ID, type NazmaVisit } from '../sim/nazma'
import { theftLoss, netIncome } from '../sim/deal'
import { createSave } from '../sim/save'
import { wageFor, type Employee } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const car = (id: string) => game().inventory.find((c) => c.id === id)!

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

describe('overnight theft', () => {
  beforeEach(() => useGame.setState(initial, true))
  const night = Array.from({ length: 100 }, (_, i) => i + 1).find((d) => isTheftNight(d))!

  /** Floors every car, so a theft calls in a loan. */
  const floorAll = () =>
    useGame.setState({ inventory: game().inventory.map((c) => ({ ...c, floored: true })) })

  it('takes a lot car, writes it off and calls in its loan', () => {
    floorAll()
    const before = game().inventory
    const cash = game().cash
    startDay(night)
    const gone = before.filter((c) => !game().inventory.some((x) => x.id === c.id))
    expect(gone).toHaveLength(1)
    expect(gone[0].location).toBe('lot')
    expect(game().dayStats.nazma.stolen).toEqual([
      { model: gone[0].model, cost: gone[0].cost, floored: true },
    ])
    expect(game().cash).toBe(cash - gone[0].cost)
    expect(theftLoss(game().dayStats)).toBe(gone[0].cost)
    expect(netIncome(game().dayStats)).toBe(-gone[0].cost)
    expect(game().notice?.text).toMatch(
      /Nazma stole the .+ off the lot overnight\. The bank called/,
    )
  })

  it("costs no cash for a car that was paid for, but it's still written off", () => {
    const cash = game().cash
    startDay(night)
    const [stolen] = game().dayStats.nazma.stolen
    expect(stolen.floored).toBe(false)
    expect(game().cash).toBe(cash)
    expect(theftLoss(game().dayStats)).toBe(stolen.cost)
  })

  it('is stopped by a guard on the payroll', () => {
    useGame.setState({ roster: [guard] })
    const count = game().inventory.length
    startDay(night)
    expect(game().inventory).toHaveLength(count)
    expect(game().dayStats.nazma).toMatchObject({ stolen: [], foiled: true })
    expect(game().notice?.text).toMatch(/Your guard ran someone off the lot last night/)
  })

  it('takes the same car when the morning is replayed from the save', () => {
    startDay(night)
    const first = game().inventory.map((c) => c.id)
    useGame.setState(initial, true)
    startDay(night)
    expect(game().inventory.map((c) => c.id)).toEqual(first)
  })

  it('leaves the lot alone on other nights', () => {
    const count = game().inventory.length
    startDay(night + 1)
    expect(game().inventory).toHaveLength(count)
    expect(game().dayStats.nazma.stolen).toEqual([])
  })
})
