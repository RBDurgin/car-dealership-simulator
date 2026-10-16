import { beforeEach, describe, expect, it } from 'vitest'
import { calendarOf } from '../sim/calendar'
import { CLOSE_MINUTE } from '../sim/clock'
import { FATIGUE_DAYS } from '../sim/morale'
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

/** Ends today and opens the next, everyone who came in at their post. */
function nextDay() {
  endDay()
  game().startNextDay()
  for (const e of game().roster) game().dispatchStaff({ type: 'atPost', id: e.id })
}

/** Plays on to the next `weekday` (0 = Monday). */
function nextWeekday(weekday: number) {
  do nextDay()
  while (calendarOf(game().clock.day).weekday !== weekday)
}

describe('days off', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('gives a new hire a day off, spread from everyone else’s', () => {
    const a = hire('receptionist')
    const b = hire('porter')
    expect(employee(a)!.daysOff).toHaveLength(1)
    expect(employee(b)!.daysOff).toHaveLength(1)
    expect(employee(b)!.daysOff).not.toEqual(employee(a)!.daysOff)
  })

  it('leaves someone home on their day off, unpaid, and resets their streak', () => {
    const id = hire('porter')
    const other = hire('receptionist')
    for (const w of employee(id)!.daysOff) game().toggleDayOff(id, w)
    game().toggleDayOff(id, 2)
    expect(employee(id)!.daysOff).toEqual([2])
    nextDay()
    expect(employee(id)!.streak).toBe(1)
    nextWeekday(2)
    expect(employee(id)!.status).toBe('off')
    expect(game().dayStats.off).toContain(id)
    expect(game().notice?.text).toMatch(new RegExp(`${employee(id)!.name} has the day off`))
    endDay()
    expect(game().dayStats.wages).toBe(employee(other)!.wage)
    expect(employee(id)!.streak).toBe(0)
  })

  it('tires someone with no days off past a week in a row', () => {
    const id = hire('porter')
    for (const w of employee(id)!.daysOff) game().toggleDayOff(id, w)
    expect(employee(id)!.daysOff).toEqual([])
    for (let d = 0; d < FATIGUE_DAYS; d++) nextDay()
    expect(employee(id)!.moraleWhy.map((r) => r.id)).not.toContain('tired')
    nextDay()
    expect(employee(id)!.streak).toBe(FATIGUE_DAYS + 1)
    expect(employee(id)!.moraleWhy.map((r) => r.id)).toContain('tired')
    game().autoSchedule()
    expect(employee(id)!.daysOff).toHaveLength(1)
  })

  it('pays a quitter for their last day, though they walked off before the day was settled', () => {
    const q = hire('porter')
    const stay = hire('receptionist')
    useGame.setState({
      roster: game().roster.map((e) => (e.id === q ? { ...e, quitting: true } : e)),
    })
    const wages = employee(q)!.wage + employee(stay)!.wage
    endDay()
    expect(employee(q)).toBeUndefined()
    expect(game().dayStats.wages).toBe(wages)
  })
})
