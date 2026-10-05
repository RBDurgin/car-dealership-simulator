import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { FIRST_OWNER_DAY, isOwnerDay, OWNER_BONUS } from '../sim/owner'
import { LAST_ARRIVAL_MINUTE } from '../sim/spawner'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

/** Plays straight on to the morning of `day`. */
function playTo(day: number) {
  while (game().clock.day < day) {
    endDay()
    game().startNextDay()
  }
}

/** Sells to a fresh walk-in at MSRP through the player's own desk. */
function sellOne() {
  const id = game().walkIn('male-a')!
  const c = game().customers.find((x) => x.id === id)!
  const car = game().inventory.find((x) => x.status === 'available')!
  // Straight to signing: the deal flow itself is covered elsewhere.
  useGame.setState({
    customers: game().customers.map((x) =>
      x.id === id
        ? {
            ...c,
            phase: 'signing' as const,
            handlerId: 'player',
            sellerId: 'player',
            offer: { carId: car.id, price: car.msrp },
          }
        : x,
    ),
  })
  game().requestAction('office-chair', 'closeDeal')
  const action = game().activeAction!.id
  game().arriveAction(action)
  game().completeAction(action)
  expect(game().dayStats.sales).toHaveLength(1)
}

describe('walk-ins', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('turns a passer-by into a customer at the lot, counted as a walk-in', () => {
    const id = game().walkIn('female-c')
    const c = game().customers.find((x) => x.id === id)
    expect(c).toMatchObject({ variant: 'female-c', phase: 'arriving', companion: null })
    expect(c?.archetype).not.toBe('couple')
    expect(game().dayStats).toMatchObject({ visitors: 1, walkIns: 1 })
  })

  it('only takes visitors while new arrivals are still welcome', () => {
    game().tickClock({ day: 1, minute: LAST_ARRIVAL_MINUTE + 10 })
    expect(game().walkIn('female-c')).toBeNull()
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    expect(game().walkIn('female-c')).toBeNull()
    expect(game().dayStats.walkIns).toBe(0)
  })

  it('waits for the game to start', () => {
    useGame.setState(initial, true)
    expect(game().walkIn('female-c')).toBeNull()
  })
})

describe('the owner', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('stays away on day 1 and visits on their days', () => {
    expect(game().owner).toBeNull()
    playTo(FIRST_OWNER_DAY)
    expect(game().owner).toMatchObject({ announced: false })
    for (let day = FIRST_OWNER_DAY + 1; day <= 8; day++) {
      playTo(day)
      expect(!!game().owner).toBe(isOwnerDay(day))
    }
  })

  it('announces the goal once, on reaching the office', () => {
    playTo(FIRST_OWNER_DAY)
    game().ownerArrived()
    expect(game().owner?.announced).toBe(true)
    expect(game().notice?.text).toMatch(/^The owner wants: /)
    const notice = game().notice
    game().ownerArrived()
    expect(game().notice).toBe(notice)
  })

  it('pays a bonus at closing for a goal met', () => {
    playTo(FIRST_OWNER_DAY)
    useGame.setState({ owner: { goal: { kind: 'sales', count: 1 }, announced: true } })
    sellOne()
    const cash = game().cash
    endDay()
    expect(game().dayStats.owner).toMatchObject({ met: true, bonus: OWNER_BONUS })
    expect(game().cash).toBe(cash + OWNER_BONUS)
  })

  it('grumbles, and pays nothing, for a goal missed', () => {
    playTo(FIRST_OWNER_DAY)
    useGame.setState({ owner: { goal: { kind: 'sales', count: 1 }, announced: true } })
    const cash = game().cash
    endDay()
    expect(game().dayStats.owner).toMatchObject({ met: false, bonus: 0 })
    expect(game().dayStats.owner?.line).toBeTruthy()
    expect(game().cash).toBe(cash)
  })

  it("doesn't judge a goal the player never heard", () => {
    playTo(FIRST_OWNER_DAY)
    endDay()
    expect(game().dayStats.owner).toBeNull()
  })

  it('starts each day without a verdict', () => {
    playTo(FIRST_OWNER_DAY)
    game().ownerArrived()
    playTo(FIRST_OWNER_DAY + 1)
    expect(game().dayStats.owner).toBeNull()
    expect(game().clock).toEqual({ day: FIRST_OWNER_DAY + 1, minute: OPEN_MINUTE })
  })
})
