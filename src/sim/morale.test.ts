import { describe, expect, it } from 'vitest'
import { emptyTally } from './growth'
import {
  fatiguePace,
  FATIGUE_DAYS,
  isWarned,
  LOW_MORALE,
  MAX_DAILY_MORALE,
  moraleChange,
  moraleDay,
  moraleNotice,
  moralePace,
  moralePoachWeight,
  moraleXp,
  MORALE_HOME,
  newlyWarned,
  NOTICE_DAYS,
  QUIT_WARN_DAYS,
  resignsToday,
  withMorale,
  workSeconds,
  type MoraleContext,
} from './morale'
import { reduceStaff, skillSeconds, wageFor, type Employee } from './staff'

const employee = (extra: Partial<Employee> = {}): Employee => ({
  id: 'staff-1-1',
  name: 'Dana',
  variant: 'female-e',
  role: 'sales',
  skill: 3,
  wage: wageFor('sales', 3),
  status: 'atPost',
  fired: false,
  quitting: false,
  xp: 0,
  potential: 4,
  hiredDay: 1,
  raiseAsk: null,
  morale: MORALE_HOME,
  lowDays: 0,
  moraleWhy: [],
  daysOff: [],
  streak: 0,
  ...extra,
})

const quiet: MoraleContext = { tally: undefined, raiseDeclined: false, coworkersLost: 0 }
const reason = (e: Employee, ctx: MoraleContext, id: string) =>
  moraleChange(e, ctx).reasons.find((r) => r.id === id)?.delta ?? 0

describe('moraleChange', () => {
  it('leaves a fairly paid employee at home alone on a quiet day', () => {
    expect(moraleChange(employee(), quiet)).toEqual({ delta: 0, reasons: [] })
  })

  it('drifts toward home from either side', () => {
    expect(reason(employee({ morale: 85 }), quiet, 'drift')).toBe(-2)
    expect(reason(employee({ morale: 35 }), quiet, 'drift')).toBe(3)
  })

  it('lowers it for pay under the wage for their skill, and lifts it a little for more', () => {
    const under = employee({ wage: wageFor('sales', 2) })
    expect(reason(under, quiet, 'pay')).toBeLessThan(-2)
    const over = employee({ wage: wageFor('sales', 5) })
    expect(reason(over, quiet, 'pay')).toBe(1)
  })

  it('costs a declined raise', () => {
    expect(reason(employee(), { ...quiet, raiseDeclined: true }, 'raise')).toBe(-8)
  })

  it('lifts it for wins, capped', () => {
    const tally = { ...emptyTally(), came: true, sales: 2 }
    expect(reason(employee(), { ...quiet, tally }, 'wins')).toBe(1)
    const big = { ...emptyTally(), came: true, sales: 6, jobs: 2 }
    expect(reason(employee(), { ...quiet, tally: big }, 'wins')).toBe(2)
    const chase = { ...emptyTally(), came: true, chases: 1 }
    expect(reason(employee({ role: 'security' }), { ...quiet, tally: chase }, 'wins')).toBe(0.5)
  })

  it('lowers it for rough patches and coworkers leaving, capped', () => {
    const tally = { ...emptyTally(), lost: 5, comebacks: 1 }
    expect(reason(employee(), { ...quiet, tally }, 'rough')).toBe(-3)
    expect(reason(employee(), { ...quiet, coworkersLost: 1 }, 'coworkers')).toBe(-2)
    expect(reason(employee(), { ...quiet, coworkersLost: 4 }, 'coworkers')).toBe(-4)
  })

  it('caps the day either way, and adds the level shift', () => {
    const awful: MoraleContext = {
      tally: { ...emptyTally(), lost: 4 },
      raiseDeclined: true,
      coworkersLost: 3,
    }
    expect(moraleChange(employee(), awful).delta).toBe(-MAX_DAILY_MORALE)
    expect(moraleChange(employee(), { ...quiet, shift: 2 }).delta).toBe(2)
    expect(moraleChange(employee(), { ...quiet, shift: 20 }).delta).toBe(MAX_DAILY_MORALE)
  })

  it('stays within 0–100', () => {
    expect(withMorale(98, 8)).toBe(100)
    expect(withMorale(3, -8)).toBe(0)
  })
})

describe('the effects of morale', () => {
  it('works a little faster when happy and slower when low', () => {
    expect(moralePace(65)).toBe(1)
    expect(moralePace(70)).toBe(1)
    expect(moralePace(100)).toBeCloseTo(0.95)
    expect(moralePace(0)).toBeCloseTo(1.15)
    expect(workSeconds(10, { skill: 3, morale: 0, streak: 0 })).toBeCloseTo(
      skillSeconds(10, 3) * 1.15,
    )
  })

  it('learns a little quicker when happy and slower when low', () => {
    expect(moraleXp(65)).toBe(1)
    expect(moraleXp(100)).toBeCloseTo(1.1)
    expect(moraleXp(0)).toBeCloseTo(0.8)
  })

  it('draws Nazma to the unhappy, up to half again', () => {
    expect(moralePoachWeight(80)).toBe(1)
    expect(moralePoachWeight(LOW_MORALE)).toBe(1.5)
    expect(moralePoachWeight(0)).toBe(1.5)
    expect(moralePoachWeight(45)).toBeCloseTo(1.25)
  })
})

describe('moraleDay', () => {
  it('moves each on the payroll, records the reasons, and counts low days', () => {
    const roster = [
      employee({ id: 'a', morale: 20, lowDays: 1, wage: wageFor('sales', 1) }),
      employee({ id: 'b', morale: 80 }),
      employee({ id: 'c', fired: true, morale: 10 }),
    ]
    const next = moraleDay(roster, () => quiet)
    expect(next[0].morale).toBeLessThan(LOW_MORALE)
    expect(next[0].lowDays).toBe(2)
    expect(next[0].moraleWhy.map((r) => r.id)).toEqual(['pay', 'drift'])
    expect(next[1]).toMatchObject({ morale: 78.5, lowDays: 0 })
    expect(next[2]).toBe(roster[2])
  })

  it('leaves low days at 0 where the level lets nobody quit', () => {
    const next = moraleDay([employee({ morale: 10, lowDays: 4 })], () => quiet, false)
    expect(next[0].lowDays).toBe(0)
  })
})

describe('warning and notice', () => {
  it('warns after QUIT_WARN_DAYS low, and resigns NOTICE_DAYS later', () => {
    const warn = employee({ lowDays: QUIT_WARN_DAYS })
    expect(isWarned(warn)).toBe(true)
    expect(newlyWarned([warn, employee({ lowDays: QUIT_WARN_DAYS + 1 })])).toEqual([warn])
    expect(resignsToday(warn)).toBe(false)
    const done = employee({ lowDays: QUIT_WARN_DAYS + NOTICE_DAYS })
    expect(resignsToday(done)).toBe(true)
    expect(resignsToday({ ...done, quitting: true })).toBe(false)
  })

  it('hands in notice, and Keep lifts morale and clears the low days', () => {
    const e = employee({ morale: 10, lowDays: 5, status: 'off' })
    const quit = reduceStaff([e], { type: 'resign', id: e.id })
    expect(quit[0].quitting).toBe(true)
    const kept = reduceStaff(quit, { type: 'keep', id: e.id, wage: e.wage + 40 })
    expect(kept[0]).toMatchObject({ quitting: false, morale: 25, lowDays: 0 })
  })

  it('tells the morning about both', () => {
    expect(moraleNotice([], [])).toBeNull()
    expect(moraleNotice(['Dana'], [])).toContain('Dana is unhappy')
    expect(moraleNotice([], ['Lee'])).toContain('Lee handed in notice and leaves')
  })
})

describe('fatigue', () => {
  const ctx: MoraleContext = { tally: undefined, raiseDeclined: false, coworkersLost: 0 }

  it('tires them a little more each day past a week without a day off', () => {
    const reason = (streak: number) =>
      moraleChange(employee(), { ...ctx, streak }).reasons.find((r) => r.id === 'tired')
    expect(reason(FATIGUE_DAYS)).toBeUndefined()
    expect(reason(FATIGUE_DAYS + 1)?.delta).toBe(-1)
    expect(reason(FATIGUE_DAYS + 2)?.delta).toBe(-2)
    expect(reason(FATIGUE_DAYS + 10)?.delta).toBe(-3)
  })

  it('slows their work once today is past a week in a row', () => {
    expect(fatiguePace(0)).toBe(1)
    expect(fatiguePace(FATIGUE_DAYS - 1)).toBe(1)
    expect(fatiguePace(FATIGUE_DAYS)).toBeCloseTo(1.03)
    expect(fatiguePace(FATIGUE_DAYS + 20)).toBeCloseTo(1.09)
    const tired = employee({ streak: FATIGUE_DAYS + 1 })
    expect(workSeconds(10, tired)).toBeCloseTo(skillSeconds(10, 3) * 1.06)
  })
})
