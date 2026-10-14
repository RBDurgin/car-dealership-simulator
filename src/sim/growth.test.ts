import { describe, expect, it } from 'vitest'
import {
  addWork,
  emptyTally,
  grow,
  growStaff,
  levelProgress,
  levelUpNotice,
  potentialFromId,
  potentialOf,
  RAISE_ASK_DAYS,
  XP_PER_DAY,
  XP_TO_LEVEL,
  XP_VALUES,
  xpFor,
  xpToLevel,
} from './growth'
import { createRng } from './rng'
import { generateCandidates, MAX_SKILL, wageFor, type Employee } from './staff'

const employee = (extra: Partial<Employee> = {}): Employee => ({
  id: 'staff-1-1',
  name: 'Dana',
  variant: 'female-e',
  role: 'sales',
  skill: 1,
  wage: wageFor('sales', 1),
  status: 'atPost',
  fired: false,
  quitting: false,
  xp: 0,
  potential: 3,
  hiredDay: 1,
  raiseAsk: null,
  ...extra,
})

describe('the work tally', () => {
  it('counts work by employee, and coming in once', () => {
    let work = addWork({}, 'a', 'came')
    work = addWork(work, 'a', 'sales')
    work = addWork(work, 'a', 'sales', 2)
    work = addWork(work, 'b', 'washes')
    expect(work.a).toEqual({ ...emptyTally(), came: true, sales: 3 })
    expect(work.b).toEqual({ ...emptyTally(), washes: 1 })
    expect(addWork(work, 'a', 'came')).toBe(work)
  })

  it('earns a day’s experience for coming in, plus each piece of work', () => {
    expect(xpFor(undefined)).toBe(0)
    expect(xpFor(emptyTally())).toBe(0)
    expect(xpFor({ ...emptyTally(), came: true })).toBe(XP_PER_DAY)
    const busy = { ...emptyTally(), came: true, sales: 2, washes: 3 }
    expect(xpFor(busy)).toBe(XP_PER_DAY + 2 * XP_VALUES.sales + 3 * XP_VALUES.washes)
  })

  it('takes three to four weeks of steady work for a level', () => {
    // About 10 a day: in for the day, a sale and a little more.
    const steady = XP_PER_DAY + XP_VALUES.sales
    for (let skill = 1; skill < MAX_SKILL; skill++) {
      const days = XP_TO_LEVEL[skill] / steady
      expect(days).toBeGreaterThanOrEqual(19)
      expect(days).toBeLessThanOrEqual(33)
    }
    // A skill-1 hire reaches 3 in six to eight weeks.
    const toThree = (XP_TO_LEVEL[1] + XP_TO_LEVEL[2]) / steady / 7
    expect(toThree).toBeGreaterThanOrEqual(6)
    expect(toThree).toBeLessThanOrEqual(8)
  })
})

describe('grow', () => {
  it('adds experience, and levels up a step at a time', () => {
    const e = employee()
    expect(grow(e, 50)).toMatchObject({ skill: 1, xp: 50 })
    expect(grow(e, XP_TO_LEVEL[1] + 10)).toMatchObject({ skill: 2, xp: 10 })
    expect(grow(e, XP_TO_LEVEL[1] + XP_TO_LEVEL[2])).toMatchObject({ skill: 3, xp: 0 })
    expect(grow(e, 0)).toBe(e)
  })

  it('scales experience by the level’s growth', () => {
    expect(grow(employee(), 100, 1.3).xp).toBe(130)
    expect(grow(employee(), 100, 0.85).xp).toBe(85)
  })

  it('never grows past potential, and the bar waits full', () => {
    const e = employee({ skill: 3, potential: 3 })
    const full = grow(e, 10_000)
    expect(full).toMatchObject({ skill: 3, xp: xpToLevel(3) })
    expect(levelProgress(full)).toBe(1)
    // A higher potential later (a course) takes it from there.
    expect(grow({ ...full, potential: 4 }, 0)).toMatchObject({ skill: 4, xp: 0 })
  })

  it('stops at the top skill with an empty bar', () => {
    const e = employee({ skill: 4, potential: 5 })
    expect(grow(e, 10_000)).toMatchObject({ skill: MAX_SKILL, xp: 0 })
    expect(xpToLevel(MAX_SKILL)).toBe(Infinity)
    expect(levelProgress({ skill: MAX_SKILL, xp: 0 })).toBe(1)
  })
})

describe('potential', () => {
  it('is never below skill nor above the top, and usually one or two up', () => {
    const rng = createRng(4)
    const extras: number[] = []
    for (let i = 0; i < 2000; i++) {
      const skill = 1 + (i % MAX_SKILL)
      const p = potentialOf(rng, skill)
      expect(p).toBeGreaterThanOrEqual(skill)
      expect(p).toBeLessThanOrEqual(MAX_SKILL)
      if (skill === 1) extras.push(p - skill)
    }
    const oneOrTwo = extras.filter((x) => x === 1 || x === 2).length / extras.length
    expect(oneOrTwo).toBeGreaterThan(0.65)
    expect(potentialOf(createRng(1), MAX_SKILL)).toBe(MAX_SKILL)
  })

  it('comes from the id for staff hired before there was one', () => {
    expect(potentialFromId('staff-3-2', 2)).toBe(potentialFromId('staff-3-2', 2))
    expect(potentialFromId('staff-3-2', 2)).toBeGreaterThanOrEqual(2)
  })

  it('is rolled apart, so the rest of each applicant is as before', () => {
    const plain = generateCandidates(createRng(9), 4, [], createRng(1))
    const other = generateCandidates(createRng(9), 4, [], createRng(2))
    expect(plain.map((c, i) => ({ ...c, potential: other[i].potential }))).toEqual(other)
    for (const c of plain) {
      expect(c).toMatchObject({ xp: 0, hiredDay: 4, raiseAsk: null })
      expect(c.potential).toBeGreaterThanOrEqual(c.skill)
    }
  })
})

describe('growStaff', () => {
  const came = { ...emptyTally(), came: true }

  it('levels up who earned it and asks for the new wage', () => {
    const e = employee({ xp: XP_TO_LEVEL[1] - XP_PER_DAY })
    const { roster, levelUps } = growStaff([e], { [e.id]: came }, 9)
    expect(roster[0]).toMatchObject({
      skill: 2,
      xp: 0,
      raiseAsk: { wage: wageFor('sales', 2), day: 9 },
    })
    expect(roster[0].wage).toBe(e.wage)
    expect(levelUps).toEqual([
      { id: e.id, name: 'Dana', role: 'sales', skill: 2, ask: wageFor('sales', 2) },
    ])
  })

  it('asks nothing of someone already paid the new level’s wage', () => {
    const e = employee({ xp: XP_TO_LEVEL[1], wage: 500 })
    const { roster, levelUps } = growStaff([e], {}, 9)
    expect(roster[0]).toMatchObject({ skill: 2, raiseAsk: null })
    expect(levelUps[0].ask).toBeNull()
  })

  it('lets an unanswered ask lapse, and leaves the fired and idle alone', () => {
    const asked = employee({ raiseAsk: { wage: 200, day: 5 } })
    const fired = employee({ id: 'x', fired: true, xp: 199 })
    const early = growStaff([asked, fired], {}, 5 + RAISE_ASK_DAYS - 1)
    expect(early.roster[0].raiseAsk).not.toBeNull()
    expect(early.roster).toEqual([asked, fired])
    const late = growStaff([asked, fired], { x: came }, 5 + RAISE_ASK_DAYS)
    expect(late.roster[0].raiseAsk).toBeNull()
    expect(late.roster[0].wage).toBe(asked.wage)
    expect(late.lapsed).toEqual(['Dana'])
    expect(late.roster[1]).toBe(fired)
  })

  it('returns the same roster when nobody changed', () => {
    const roster = [employee()]
    expect(growStaff(roster, {}, 2).roster).toBe(roster)
  })
})

describe('levelUpNotice', () => {
  it('names who grew, what they ask and whose ask lapsed', () => {
    expect(levelUpNotice([])).toBeNull()
    const text = levelUpNotice(
      [
        { id: 'a', name: 'Dana', role: 'sales', skill: 2, ask: 150 },
        { id: 'b', name: 'Lee', role: 'porter', skill: 3, ask: null },
      ],
      ['Kim'],
    )!
    expect(text).toContain('Dana grew to skill 2 and asks for $150 a day')
    expect(text).toContain('Lee grew to skill 3.')
    expect(text).toContain('Kim gave up waiting')
  })
})
