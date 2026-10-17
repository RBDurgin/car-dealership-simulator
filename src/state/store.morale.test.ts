import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { LOW_MORALE, MORALE_HOME, NOTICE_DAYS, QUIT_WARN_DAYS } from '../sim/morale'
import { wageFor, type Employee, type Role } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const employee = (id: string) => game().roster.find((e) => e.id === id)

/** Hires today's applicant for `role` at skill 3, at their post. */
function hire(role: Role, extra: Partial<Employee> = {}): string {
  const c = game().candidates.find((x) => x.role === role)!
  const hand = { ...c, skill: 3, wage: wageFor(role, 3), potential: 3, ...extra }
  useGame.setState({ candidates: game().candidates.map((x) => (x === c ? hand : x)) })
  game().hire(c.id)
  game().dispatchStaff({ type: 'atPost', id: c.id })
  return c.id
}

/** Closes the doors, sends the staff home and settles the day. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

/** Ends today and opens the next, everyone back at their post. */
function nextDay() {
  endDay()
  game().startNextDay()
  for (const e of game().roster) game().dispatchStaff({ type: 'atPost', id: e.id })
}

describe('staff morale', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('settles the day’s morale with its reasons', () => {
    const id = hire('porter', { wage: wageFor('porter', 1) })
    const start = employee(id)!.morale
    endDay()
    const e = employee(id)!
    expect(e.morale).toBeLessThan(start)
    expect(e.moraleWhy.map((r) => r.id)).toContain('pay')
  })

  it('costs morale to turn down a raise, and to lose a coworker', () => {
    const a = hire('porter', { morale: MORALE_HOME, raiseAsk: { wage: 200, day: 1 } })
    const b = hire('receptionist', { morale: MORALE_HOME })
    game().answerRaise(a, false)
    game().fire(b)
    endDay()
    const why = employee(a)!.moraleWhy.map((r) => r.id)
    expect(why).toEqual(expect.arrayContaining(['raise', 'coworkers']))
  })

  it('warns, then hands in notice, and Keep saves them on Medium', () => {
    const id = hire('porter', { wage: 30, morale: 5 })
    for (let d = 0; d < QUIT_WARN_DAYS; d++) nextDay()
    expect(employee(id)!.lowDays).toBe(QUIT_WARN_DAYS)
    expect(game().notice?.text).toMatch(/unhappy and thinking of leaving/)
    for (let d = 0; d < NOTICE_DAYS; d++) nextDay()
    expect(employee(id)!.quitting).toBe(true)
    expect(game().dayStats.resigned).toEqual([id])
    expect(game().notice?.text).toMatch(/handed in notice/)
    game().keepEmployee(id)
    expect(employee(id)).toMatchObject({ quitting: false, lowDays: 0 })
    expect(game().dayStats.nazma.kept).toEqual([])
  })

  it('lets a resigner go at closing, over morale', () => {
    const id = hire('porter', { wage: 30, morale: 5 })
    const name = employee(id)!.name
    for (let d = 0; d < QUIT_WARN_DAYS + NOTICE_DAYS; d++) nextDay()
    expect(employee(id)!.quitting).toBe(true)
    endDay()
    expect(employee(id)).toBeUndefined()
    expect(game().dayStats.moraleQuits).toEqual([name])
    expect(game().dayStats.nazma.quit).toEqual([name])
  })

  it('never resigns anyone on Easy', () => {
    useGame.setState({ difficulty: 'easy' })
    const id = hire('porter', { wage: wageFor('porter', 1), morale: 0 })
    for (let d = 0; d < QUIT_WARN_DAYS + NOTICE_DAYS + 2; d++) nextDay()
    const e = employee(id)!
    expect(e.quitting).toBe(false)
    expect(e.lowDays).toBe(0)
    expect(e.morale).toBeGreaterThanOrEqual(0)
    expect(e.morale).toBeLessThan(LOW_MORALE + 30)
  })
})
