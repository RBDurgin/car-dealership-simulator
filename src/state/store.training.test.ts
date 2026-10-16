import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import {
  MENTOR_XP,
  SENIOR_DAYS,
  seniorWage,
  TRAINING_XP,
  trainingFee,
  XP_PER_DAY,
} from '../sim/growth'
import { PROMOTE_MORALE } from '../sim/morale'
import { MAX_SKILL, wageFor, type Employee, type Role } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const employee = (id: string) => game().roster.find((e) => e.id === id)

/** Hires today's applicant for `role` at skill 1 (unless told otherwise), at their post, working every day. */
function hire(role: Role, extra: Partial<Employee> = {}): string {
  // Another applicant for the role, if today's has been taken.
  const seen =
    game().candidates.find((x) => x.role === role) ?? game().roster.find((x) => x.role === role)!
  const c = game().candidates.find((x) => x.role === role) ?? {
    ...seen,
    id: `${seen.id}-b`,
    name: 'Robin',
  }
  if (!game().candidates.includes(c)) useGame.setState({ candidates: [...game().candidates, c] })
  const hand = { ...c, skill: 1, wage: wageFor(role, 1), potential: 4, senior: false, ...extra }
  useGame.setState({ candidates: game().candidates.map((x) => (x === c ? hand : x)) })
  game().hire(c.id)
  game().dispatchStaff({ type: 'atPost', id: c.id })
  for (const w of employee(c.id)!.daysOff) game().toggleDayOff(c.id, w)
  return c.id
}

function patch(id: string, extra: Partial<Employee>) {
  useGame.setState({ roster: game().roster.map((e) => (e.id === id ? { ...e, ...extra } : e)) })
}

function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

function nextDay() {
  endDay()
  game().startNextDay()
  for (const e of game().roster) game().dispatchStaff({ type: 'atPost', id: e.id })
}

describe('training', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('books a course for their next working day, paid and taken away from the floor that day', () => {
    const id = hire('porter')
    useGame.setState({ cash: 50_000 })
    game().bookTraining(id, 'basic')
    const booked = employee(id)!.training
    expect(booked).toEqual({ day: game().clock.day + 1, course: 'basic' })
    nextDay()
    expect(employee(id)!.status).toBe('off')
    expect(game().dayStats.off).not.toContain(id)
    expect(game().dayStats.training).toBe(trainingFee('porter', 'basic'))
    expect(game().notice?.text).toMatch(/away on a training course/)
    const xp = employee(id)!.xp
    endDay()
    // Paid for the day, and the course's experience instead of the floor's.
    expect(game().dayStats.wages).toBe(employee(id)!.wage)
    expect(employee(id)!.training).toBeNull()
    expect(employee(id)!.xp).toBe(xp + TRAINING_XP)
    expect(game().dayStats.courses).toEqual([{ id, name: employee(id)!.name, course: 'basic' }])
  })

  it('calls a course off before the day, and refuses a second booking', () => {
    const id = hire('porter')
    useGame.setState({ cash: 50_000 })
    game().bookTraining(id, 'basic')
    game().bookTraining(id, 'advanced')
    expect(employee(id)!.training?.course).toBe('basic')
    expect(game().notice?.text).toMatch(/already booked/)
    game().cancelTraining(id)
    expect(employee(id)!.training).toBeNull()
  })

  it('raises potential once with the advanced course', () => {
    const id = hire('porter', { potential: 2 })
    useGame.setState({ cash: 50_000 })
    game().bookTraining(id, 'advanced')
    nextDay()
    endDay()
    expect(employee(id)).toMatchObject({ potential: 3, trained: true })
    game().startNextDay()
    game().bookTraining(id, 'advanced')
    expect(employee(id)!.training).toBeNull()
  })
})

describe('promotion', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('promotes someone seasoned to Senior, with a raise and a lift', () => {
    const id = hire('sales', { skill: MAX_SKILL, potential: MAX_SKILL, wage: wageFor('sales', 5) })
    game().promote(id)
    expect(employee(id)!.senior).toBe(false)
    expect(game().notice?.text).toMatch(/more days on the team/)
    patch(id, { hiredDay: game().clock.day - SENIOR_DAYS, morale: 60 })
    game().promote(id)
    expect(employee(id)).toMatchObject({
      senior: true,
      wage: seniorWage(wageFor('sales', 5)),
      morale: 60 + PROMOTE_MORALE,
    })
    expect(game().notice?.text).toMatch(/Senior Salesperson/)
  })

  it('mentors the rest of the role on a day the senior is in', () => {
    const senior = hire('sales', { skill: MAX_SKILL, potential: MAX_SKILL, senior: true })
    const junior = hire('sales')
    patch(junior, { morale: 65 })
    endDay()
    expect(employee(senior)!.xp).toBe(0)
    expect(employee(junior)!.xp).toBe(Math.round(XP_PER_DAY * MENTOR_XP))
  })
})
