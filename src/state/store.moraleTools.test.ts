import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { EOTM_BONUS } from '../sim/growth'
import { MANAGER_DESK } from '../sim/layout'
import {
  EOTM_MORALE,
  EOTM_TEAM_MORALE,
  HUDDLE_LATEST,
  HUDDLE_MORALE,
  PRAISE_MORALE,
} from '../sim/morale'
import { wageFor, type Employee, type Role } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const employee = (id: string) => game().roster.find((e) => e.id === id)!

/** Hires today's applicant for `role`, fairly paid at skill 3, at their post, working every day. */
function hire(role: Role, extra: Partial<Employee> = {}): string {
  const c = game().candidates.find((x) => x.role === role)!
  const hand = { ...c, skill: 3, wage: wageFor(role, 3), potential: 3, morale: 60, ...extra }
  useGame.setState({ candidates: game().candidates.map((x) => (x === c ? hand : x)) })
  game().hire(c.id)
  game().dispatchStaff({ type: 'atPost', id: c.id })
  for (const w of employee(c.id).daysOff) game().toggleDayOff(c.id, w)
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

/** Runs the player's `action` on `targetId` through to the end, as the world would. */
function perform(targetId: string, action: 'praise' | 'huddle') {
  game().requestAction(targetId, action)
  const a = game().activeAction
  if (!a) return
  game().arriveAction(a.id)
  if (game().activeAction) game().completeAction(a.id)
}

const at = (minute: number) => useGame.setState({ clock: { ...game().clock, minute } })

describe('praise', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('lifts morale once a day, and by half when it comes again soon', () => {
    const id = hire('porter')
    perform(id, 'praise')
    expect(employee(id)).toMatchObject({ morale: 60 + PRAISE_MORALE, praisedDay: 1 })
    perform(id, 'praise')
    expect(employee(id).morale).toBe(60 + PRAISE_MORALE)
    expect(game().notice?.text).toMatch(/already praised/)
    nextDay()
    const before = employee(id).morale
    perform(id, 'praise')
    expect(employee(id).morale).toBe(before + PRAISE_MORALE / 2)
  })
})

describe('the morning huddle', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('lifts everyone at their post, once a day, at the player’s desk', () => {
    const a = hire('porter')
    const b = hire('receptionist')
    game().dispatchStaff({ type: 'fire', id: b })
    at(OPEN_MINUTE + 30)
    perform(MANAGER_DESK.chairId, 'huddle')
    expect(game().dayStats.huddle).toBe(true)
    expect(employee(a).morale).toBe(60 + HUDDLE_MORALE)
    perform(MANAGER_DESK.chairId, 'huddle')
    expect(employee(a).morale).toBe(60 + HUDDLE_MORALE)
    expect(game().notice?.text).toMatch(/held today/)
  })

  it('is too late after 10:30', () => {
    const a = hire('porter')
    at(HUDDLE_LATEST + 10)
    perform(MANAGER_DESK.chairId, 'huddle')
    expect(game().dayStats.huddle).toBe(false)
    expect(employee(a).morale).toBe(60)
  })
})

describe('the break room', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('lets staff at their post go on a break once it’s up, until the next morning', () => {
    const id = hire('porter')
    game().staffBreak(id, true)
    expect(game().onBreak).toEqual([])
    useGame.setState({ improvements: [{ id: 'break-room', day: 0 }] })
    game().staffBreak(id, true)
    game().staffBreak(id, true)
    expect(game().onBreak).toEqual([id])
    game().staffBreak(id, false)
    expect(game().onBreak).toEqual([])
    game().staffBreak(id, true)
    nextDay()
    expect(game().onBreak).toEqual([])
  })

  it('adds to the morale of those who came in', () => {
    const id = hire('porter')
    useGame.setState({ improvements: [{ id: 'break-room', day: 0 }] })
    endDay()
    expect(employee(id).moraleWhy).toContainEqual({ id: 'breakRoom', delta: 1 })
  })
})

describe('Employee of the Month', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('is named on the month’s last day, with a bonus, a morale lift and a plaque', () => {
    const a = hire('porter')
    const b = hire('receptionist')
    useGame.setState({ clock: { day: 28, minute: OPEN_MINUTE + 60 }, cash: 50_000 })
    patch(a, { monthXp: 100 })
    patch(b, { monthXp: 300 })
    const moraleA = employee(a).morale
    endDay()
    const stats = game().dayStats
    expect(stats.eotm).toMatchObject({ id: b, day: 28 })
    expect(stats.staffBonus).toBe(EOTM_BONUS)
    expect(netIncome({ ...stats, staffBonus: 0 }) - netIncome(stats)).toBe(EOTM_BONUS)
    expect(game().eotm).toEqual([{ id: b, name: employee(b).name, role: 'receptionist', day: 28 }])
    expect(employee(b).moraleWhy).toContainEqual({ id: 'eotm', delta: EOTM_MORALE })
    expect(employee(a).moraleWhy).toContainEqual({ id: 'eotm', delta: EOTM_TEAM_MORALE })
    expect(employee(a).morale).toBeGreaterThan(moraleA)
    game().startNextDay()
    expect(game().clock.day).toBe(29)
    expect(game().roster.every((e) => e.monthXp === 0)).toBe(true)
    expect(game().notice?.text).toMatch(/Employee of the Month/)
  })

  it('isn’t named on any other day', () => {
    const a = hire('porter')
    patch(a, { monthXp: 300 })
    endDay()
    expect(game().dayStats.eotm).toBeNull()
    expect(game().eotm).toEqual([])
    expect(employee(a).monthXp).toBeGreaterThan(300)
  })
})
