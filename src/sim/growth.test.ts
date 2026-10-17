import { describe, expect, it } from 'vitest'
import {
  addEotm,
  employeeOfMonth,
  eotmCount,
  MAX_EOTM,
  newMonthXp,
  ROLE_XP_SCALE,
  addWork,
  canPromote,
  MENTOR_XP,
  promoteBlocker,
  SENIOR_DAYS,
  SENIOR_PERKS,
  seniorAcceptBonus,
  seniorComebackScale,
  seniorFeeBonus,
  seniorSightBonus,
  seniorWage,
  seniorWashScale,
  titleOf,
  TRAINING_XP,
  trainingBlocker,
  trainingFee,
  emptyTally,
  grow,
  growStaff,
  hiredSkill,
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
import { DAYS_PER_WEEK } from './calendar'
import { moraleChange, withMorale } from './morale'
import { createRng } from './rng'
import {
  financeCommission,
  generateCandidates,
  MAX_SKILL,
  reduceStaff,
  wageFor,
  type Employee,
} from './staff'

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
  morale: 70,
  lowDays: 0,
  moraleWhy: [],
  daysOff: [],
  streak: 0,
  training: null,
  trained: false,
  senior: false,
  praisedDay: null,
  monthXp: 0,
  levels: [],
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

  it('keeps each level grown, a step at a time, and the skill they were hired at', () => {
    const e = employee({ xp: XP_TO_LEVEL[1] + XP_TO_LEVEL[2] - XP_PER_DAY })
    const { roster } = growStaff([e], { [e.id]: came }, 12)
    expect(roster[0].skill).toBe(3)
    expect(roster[0].levels).toEqual([
      { skill: 2, day: 12 },
      { skill: 3, day: 12 },
    ])
    expect(hiredSkill(roster[0])).toBe(1)
  })

  it('reports the experience each earned, for their lifetime totals', () => {
    const a = employee({ id: 'a' })
    const b = employee({ id: 'b' })
    const { earned } = growStaff([a, b], { a: came }, 3, 1.5)
    expect(earned).toEqual({ a: Math.round(XP_PER_DAY * 1.5) })
  })
})

/**
 * The plan's growth and morale targets on Medium, played over a steady day
 * of work (a sale and a test drive) without the store.
 */
describe('growth and morale balance', () => {
  const steady = { ...emptyTally(), came: true, sales: 1, drives: 1 }

  /** Day by day for 56 days: morale and skill at the end of each. */
  function run(opts: { daysOff: boolean; grant: boolean }) {
    let e = employee()
    const days: { morale: number; skill: number }[] = []
    for (let day = 1; day <= 56; day++) {
      const off = opts.daysOff && day % DAYS_PER_WEEK === 3
      const tally = off ? undefined : steady
      e = { ...e, streak: off ? 0 : e.streak + 1 }
      const declined = !!e.raiseAsk && !opts.grant
      if (e.raiseAsk) e = { ...e, wage: opts.grant ? e.raiseAsk.wage : e.wage, raiseAsk: null }
      const m = moraleChange(e, {
        tally,
        raiseDeclined: declined,
        coworkersLost: 0,
        streak: e.streak,
      })
      e = { ...e, morale: withMorale(e.morale, m.delta) }
      e = growStaff([e], tally ? { [e.id]: tally } : {}, day).roster[0]
      days.push({ morale: e.morale, skill: e.skill })
    }
    return days
  }

  it('takes a skill-1 hire to skill 3 in about 6–8 weeks of work', () => {
    const third = run({ daysOff: true, grant: true }).findIndex((d) => d.skill >= 3) + 1
    expect(third).toBeGreaterThanOrEqual(6 * DAYS_PER_WEEK)
    expect(third).toBeLessThanOrEqual(8 * DAYS_PER_WEEK)
  })

  it('keeps a fairly paid, rested employee at about 60–80', () => {
    for (const d of run({ daysOff: true, grant: true }).slice(DAYS_PER_WEEK)) {
      expect(d.morale).toBeGreaterThanOrEqual(60)
      expect(d.morale).toBeLessThanOrEqual(80)
    }
  })

  it('lets a neglected one sink to about 30, but not under notice', () => {
    const days = run({ daysOff: false, grant: false })
    const declined = days.findIndex((d) => d.skill >= 2)
    const fortnight = days[declined + 2 * DAYS_PER_WEEK].morale
    expect(fortnight).toBeGreaterThan(25)
    expect(fortnight).toBeLessThan(45)
    expect(days.every((d) => d.morale > 20)).toBe(true)
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

describe('training', () => {
  const came = { ...emptyTally(), came: true }

  it('grants a course’s experience on the day, up to potential', () => {
    const e = employee({ training: { day: 9, course: 'basic' } })
    const { roster, courses } = growStaff([e], {}, 9)
    expect(roster[0]).toMatchObject({ xp: TRAINING_XP, training: null })
    expect(courses).toEqual([{ id: e.id, name: 'Dana', course: 'basic' }])
    const capped = employee({
      skill: 3,
      potential: 3,
      xp: 200,
      training: { day: 9, course: 'basic' },
    })
    expect(growStaff([capped], {}, 9).roster[0]).toMatchObject({ skill: 3, xp: 280 })
  })

  it('raises potential once with the advanced course, and grows into it', () => {
    const e = employee({
      skill: 3,
      potential: 3,
      xp: 280,
      training: { day: 9, course: 'advanced' },
    })
    const { roster, levelUps } = growStaff([e], {}, 9)
    expect(roster[0]).toMatchObject({ potential: 4, trained: true, skill: 4 })
    expect(levelUps).toHaveLength(1)
    expect(trainingBlocker(roster[0], 'advanced')).toMatch(/taken the advanced/)
  })

  it('drops a booking for a day gone by, with nothing learned', () => {
    const e = employee({ training: { day: 8, course: 'basic' } })
    const { roster, courses } = growStaff([e], { [e.id]: came }, 9)
    expect(roster[0]).toMatchObject({ training: null, xp: XP_PER_DAY })
    expect(courses).toEqual([])
  })

  it('refuses a course with nothing to learn or one already booked', () => {
    expect(trainingBlocker(employee(), 'basic')).toBeNull()
    expect(trainingBlocker(employee({ skill: 3, potential: 3, xp: 280 }), 'basic')).toMatch(
      /Nothing left/,
    )
    expect(trainingBlocker(employee({ skill: 3, potential: 3, xp: 100 }), 'basic')).toBeNull()
    expect(trainingBlocker(employee({ skill: MAX_SKILL, potential: MAX_SKILL }), 'basic')).toMatch(
      /top skill/,
    )
    expect(trainingBlocker(employee({ potential: MAX_SKILL }), 'advanced')).toMatch(/already grow/)
    const booked = employee({ training: { day: 9, course: 'basic' } })
    expect(trainingBlocker(booked, 'advanced')).toMatch(/already booked/)
    expect(trainingFee('sales', 'advanced')).toBeGreaterThan(trainingFee('sales', 'basic'))
  })
})

describe('promotion', () => {
  const came = { ...emptyTally(), came: true }
  const seasoned = (extra: Partial<Employee> = {}) =>
    employee({ skill: MAX_SKILL, potential: MAX_SKILL, hiredDay: 1, ...extra })
  const day = 1 + SENIOR_DAYS

  it('needs the top skill, four weeks’ service, good morale and no other senior', () => {
    expect(canPromote(seasoned(), [], day)).toBe(true)
    expect(promoteBlocker(seasoned({ skill: 4 }), [], day)).toMatch(/skill 5/)
    expect(promoteBlocker(seasoned(), [], day - 1)).toMatch(/1 more day /)
    expect(promoteBlocker(seasoned({ morale: 40 }), [], day)).toMatch(/happier/)
    const other = seasoned({ id: 'staff-1-2', name: 'Lee', senior: true })
    expect(promoteBlocker(seasoned(), [other], day)).toMatch(/Lee is already Senior Salesperson/)
    expect(canPromote(seasoned(), [{ ...other, role: 'porter' }], day)).toBe(true)
    expect(promoteBlocker(seasoned({ senior: true }), [], day)).toMatch(/already/)
  })

  it('gives the title, a raise and a lift', () => {
    const e = seasoned({ morale: 60, raiseAsk: { wage: seniorWage(120) - 1, day: 3 } })
    const [n] = reduceStaff([e], { type: 'promote', id: e.id, wage: seniorWage(e.wage) })
    expect(n).toMatchObject({ senior: true, wage: seniorWage(e.wage), morale: 75, raiseAsk: null })
    expect(titleOf(n)).toBe('Senior Salesperson')
    expect(titleOf({ role: 'mechanic', senior: true })).toBe('Lead Mechanic')
    expect(titleOf(e)).toBe('Salesperson')
  })

  it('mentors the rest of the role on a day the senior comes in', () => {
    const senior = seasoned({ id: 's', senior: true })
    const junior = employee({ id: 'j' })
    const porter = employee({ id: 'p', role: 'porter' })
    const work = { s: came, j: came, p: came }
    const { roster } = growStaff([senior, junior, porter], work, day)
    expect(roster[1].xp).toBe(Math.round(XP_PER_DAY * MENTOR_XP))
    expect(roster[2].xp).toBe(XP_PER_DAY)
    const home = growStaff([senior, junior], { j: came }, day).roster
    expect(home[1].xp).toBe(XP_PER_DAY)
  })

  it('brings each role’s perk only to its senior', () => {
    const senior = (role: Employee['role']) => ({ role, senior: true })
    expect(seniorAcceptBonus(senior('sales'))).toBe(SENIOR_PERKS.sales.value)
    expect(seniorAcceptBonus({ role: 'sales', senior: false })).toBe(0)
    expect(seniorAcceptBonus(senior('porter'))).toBe(0)
    expect(seniorAcceptBonus(null)).toBe(0)
    expect(seniorComebackScale(senior('mechanic'))).toBe(0.7)
    expect(seniorComebackScale(undefined)).toBe(1)
    expect(seniorSightBonus(senior('security'))).toBe(2)
    expect(seniorWashScale(senior('porter'))).toBeLessThan(1)
    expect(financeCommission(0, seniorFeeBonus(senior('finance')))).toBe(financeCommission(0) + 50)
  })
})

describe('Employee of the Month', () => {
  it('adds what each earns to their month', () => {
    const e = employee({ monthXp: 10 })
    const { roster } = growStaff([e], addWork({}, e.id, 'came'), 3)
    expect(roster[0].monthXp).toBe(10 + XP_PER_DAY)
    const scaled = growStaff([e], addWork({}, e.id, 'came'), 3, 2).roster[0]
    expect(scaled.monthXp).toBe(10 + XP_PER_DAY * 2)
  })

  it('counts the month even at the top skill, where the bar stays empty', () => {
    const top = employee({ skill: MAX_SKILL, potential: MAX_SKILL })
    const grown = growStaff([top], addWork({}, top.id, 'came'), 3).roster[0]
    expect(grown).toMatchObject({ xp: 0, monthXp: XP_PER_DAY })
  })

  it('picks the most experience scaled by role, so a quiet role has a chance', () => {
    const seller = employee({ id: 'a', role: 'sales', monthXp: 300 })
    const guard = employee({ id: 'b', role: 'security', monthXp: 200 })
    expect(ROLE_XP_SCALE.security * 200).toBeGreaterThan(300)
    expect(employeeOfMonth([seller, guard])?.id).toBe('b')
  })

  it('passes over the let go and the leaving, and names nobody with nothing earned', () => {
    const fired = employee({ id: 'a', monthXp: 500, fired: true })
    const quitting = employee({ id: 'b', monthXp: 400, quitting: true })
    const other = employee({ id: 'c', monthXp: 10 })
    expect(employeeOfMonth([fired, quitting, other])?.id).toBe('c')
    expect(employeeOfMonth([employee()])).toBeNull()
  })

  it('keeps the last winners, and counts each one’s wins', () => {
    let wins = addEotm([], { id: 'a', name: 'Dana', role: 'sales', day: 28 })
    for (let i = 1; i <= MAX_EOTM; i++) {
      wins = addEotm(wins, { id: i % 2 ? 'b' : 'a', name: 'X', role: 'sales', day: 28 * (i + 1) })
    }
    expect(wins).toHaveLength(MAX_EOTM)
    expect(wins[wins.length - 1].day).toBe(28 * (MAX_EOTM + 1))
    expect(eotmCount(wins, 'b') + eotmCount(wins, 'a')).toBe(MAX_EOTM)
  })

  it('starts everyone’s month afresh', () => {
    const roster = [employee({ monthXp: 50 }), employee({ id: 'b' })]
    expect(newMonthXp(roster).map((e) => e.monthXp)).toEqual([0, 0])
    const fresh = [employee()]
    expect(newMonthXp(fresh)).toBe(fresh)
  })
})
