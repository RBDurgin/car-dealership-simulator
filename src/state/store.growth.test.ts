import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { RAISE_ASK_DAYS, XP_PER_DAY, XP_TO_LEVEL, XP_VALUES } from '../sim/growth'
import { wageFor, type Employee, type Role } from '../sim/staff'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const employee = (id: string) => game().roster.find((e) => e.id === id)!

/** Hires today's applicant for `role` at skill 1 with room to grow, at their post. */
function hire(role: Role, extra: Partial<Employee> = {}): string {
  const c = game().candidates.find((x) => x.role === role)!
  const green = { ...c, skill: 1, wage: wageFor(role, 1), potential: 4, ...extra }
  useGame.setState({ candidates: game().candidates.map((x) => (x === c ? green : x)) })
  game().hire(c.id)
  game().dispatchStaff({ type: 'atPost', id: c.id })
  return c.id
}

/** Closes the doors, sends the staff home and settles the day. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
}

describe('staff growth', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('tallies coming in and the work staff do', () => {
    const porter = hire('porter')
    const car = game().inventory[0]
    useGame.setState({
      inventory: game().inventory.map((c) => (c === car ? { ...c, cleanliness: 0.3 } : c)),
    })
    game().staffWash(porter, car.id)
    expect(game().inventory.find((c) => c.id === car.id)?.cleanliness).toBe(1)
    expect(game().dayStats.staffWork[porter]).toMatchObject({ came: true, washes: 1 })
    // Washing a clean car is no work.
    game().staffWash(porter, car.id)
    expect(game().dayStats.staffWork[porter].washes).toBe(1)
  })

  it('credits a guard who runs Nazma off', () => {
    const guard = hire('security')
    useGame.setState({
      nazma: {
        status: 'onLot',
        scheme: 'smudge',
        targets: [],
        progress: 0,
        arrivalMinute: 0,
        chatting: false,
      },
    })
    game().nazmaRunOff('guard')
    expect(game().dayStats.staffWork[guard].chases).toBe(1)
  })

  it('settles the day’s experience, and a level-up asks for a raise', () => {
    const porter = hire('porter')
    const need = XP_TO_LEVEL[1] - XP_PER_DAY - XP_VALUES.washes
    useGame.setState({ roster: game().roster.map((e) => ({ ...e, xp: need })) })
    const dirty = game().inventory[0]
    useGame.setState({
      inventory: game().inventory.map((c) => (c === dirty ? { ...c, cleanliness: 0.2 } : c)),
    })
    game().staffWash(porter, dirty.id)
    endDay()
    expect(game().dayStats.settled).toBe(true)
    expect(employee(porter)).toMatchObject({
      skill: 2,
      xp: 0,
      wage: wageFor('porter', 1),
      raiseAsk: { wage: wageFor('porter', 2), day: 1 },
    })
    expect(game().dayStats.levelUps).toEqual([
      {
        id: porter,
        name: employee(porter).name,
        role: 'porter',
        skill: 2,
        ask: wageFor('porter', 2),
      },
    ])
    game().dispatchStaff({ type: 'left', id: porter })
    game().startNextDay()
    expect(game().notice?.text).toMatch(/grew to skill 2 and asks for/)
  })

  it('grants or declines a raise from the staff panel', () => {
    const a = hire('porter', { raiseAsk: { wage: 200, day: 1 } })
    const b = hire('receptionist', { raiseAsk: { wage: 210, day: 1 } })
    game().answerRaise(a, true)
    expect(employee(a)).toMatchObject({ wage: 200, raiseAsk: null })
    const wage = employee(b).wage
    game().answerRaise(b, false)
    expect(employee(b)).toMatchObject({ wage, raiseAsk: null })
    expect(game().notice?.text).toMatch(/stays on/)
  })

  it('lets an unanswered ask lapse after a few days', () => {
    const id = hire('porter', { raiseAsk: { wage: 200, day: 1 } })
    for (let day = 1; day < 1 + RAISE_ASK_DAYS; day++) {
      endDay()
      game().dispatchStaff({ type: 'left', id })
      expect(employee(id).raiseAsk).not.toBeNull()
      game().startNextDay()
      game().dispatchStaff({ type: 'atPost', id })
    }
    endDay()
    expect(employee(id).raiseAsk).toBeNull()
    expect(game().dayStats.raisesLapsed).toEqual([employee(id).name])
    expect(employee(id).wage).toBe(wageFor('porter', 1))
  })

  it('grows faster on Easy and slower on Hard', () => {
    const xpOn = (difficulty: 'easy' | 'medium' | 'hard') => {
      useGame.setState(initial, true)
      useGame.setState({ difficulty })
      const id = hire('porter')
      endDay()
      return employee(id).xp
    }
    expect(xpOn('medium')).toBe(XP_PER_DAY)
    expect(xpOn('easy')).toBeGreaterThan(XP_PER_DAY)
    expect(xpOn('hard')).toBeLessThan(XP_PER_DAY)
  })

  it('Shift+G levels up everyone on the lot', () => {
    const id = hire('porter')
    game().devGrowStaff()
    expect(employee(id)).toMatchObject({ skill: 2, raiseAsk: { wage: wageFor('porter', 2) } })
    expect(game().dayStats.levelUps).toHaveLength(1)
  })
})
