import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats } from '../sim/deal'
import { isTheftNight } from '../sim/nazma'
import { emptyCareer, RANKS } from '../sim/progression'
import { emptyRival, OPEN_STRENGTH, openingDay, type Rival } from '../sim/rival'
import { createSave, parseSave } from '../sim/save'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Starts `day`'s morning from a save of the day before, as a resumed game does. */
function startDay(day: number) {
  game().loadGame({ ...createSave(game(), 0), day: day - 1 })
}

/** Ends the day with nobody else turning up, settling it. */
function endDay() {
  useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

const open = (extra: Partial<Rival> = {}): Rival => ({
  ...emptyRival(),
  status: 'open',
  generation: 1,
  openDay: 1,
  strength: OPEN_STRENGTH,
  undercut: 0.04,
  ...extra,
})

describe("Nazma's rival lot", () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('starts unopened, and stays so at Corner Lot', () => {
    expect(game().rival).toEqual(emptyRival())
    startDay(10)
    expect(game().rival.status).toBe('unopened')
    expect(game().dayStats.rival).toBeNull()
  })

  it('is announced the morning after reaching Main Street', () => {
    useGame.setState({
      clock: { day: 15, minute: 600 },
      career: { ...emptyCareer(), gross: RANKS[1].gross - 1_000 },
      reputation: 60,
      arrivals: { minutes: [], sources: [], spawned: 0 },
      dayStats: {
        ...emptyStats(),
        sales: [
          {
            customerName: 'Alex B.',
            carId: 'gone',
            model: 'van',
            price: 30_000,
            msrp: 30_000,
            cost: 28_000,
            minute: 600,
            soldBy: null,
            signedBy: null,
            commission: 0,
            source: 'regular',
          },
        ],
      },
    })
    game().tickClock({ day: 15, minute: CLOSE_MINUTE })
    for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
    expect(game().career.rank).toBe('main-street')
    game().startNextDay()
    expect(game().rival).toMatchObject({ status: 'announced', openDay: openingDay(16) })
    expect(game().notice?.text).toContain("Nazma's Motors opens there on Monday")
    expect(game().dayStats.rival).toBeNull()
  })

  it('opens on his day and takes a share of the day', () => {
    useGame.setState({ rival: { ...emptyRival(), status: 'announced', openDay: 22 } })
    startDay(21)
    expect(game().rival.status).toBe('announced')
    startDay(22)
    expect(game().rival).toMatchObject({ status: 'open', generation: 1, strength: OPEN_STRENGTH })
    expect(game().notice?.text).toContain('opened across the road')
    const share = game().dayStats.rival?.share ?? 0
    expect(share).toBeGreaterThan(0.1)
    expect(game().dayStats.rival).toEqual({ share, lost: 0, matched: 0 })
  })

  it('opens stronger on Hard', () => {
    game().newGame('hard')
    useGame.setState({ rival: { ...emptyRival(), status: 'announced', openDay: 22 } })
    startDay(22)
    expect(game().rival.strength).toBe(OPEN_STRENGTH * 1.25)
  })

  it('scales the day’s planned visitors by what he takes', () => {
    const visitors = (rival: Rival) => {
      useGame.setState(initial, true)
      game().newGame()
      useGame.setState({ rival, reputation: 30 })
      startDay(26)
      return game().arrivals.minutes.length
    }
    expect(visitors(open({ strength: 100, undercut: 0.1 }))).toBeLessThan(visitors(emptyRival()))
  })

  it('records the day’s share and moves his strength when the day is settled', () => {
    useGame.setState({ rival: open({ strength: 90, undercut: 0.1 }), reputation: 30 })
    startDay(26)
    const share = game().dayStats.rival!.share
    endDay()
    expect(game().rival.shares).toEqual([share])
    expect(game().rival.strength).toBeGreaterThan(90)
  })

  it('is saved and resumed', () => {
    useGame.setState({ rival: open({ shares: [0.12, 0.14] }) })
    startDay(26)
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    expect(save.rival).toEqual(game().rival)
    const rival = game().rival
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().rival.shares).toEqual(rival.shares)
    expect(game().rival.strength).toBe(rival.strength)
  })

  it('remembers the last theft night', () => {
    const night = Array.from({ length: 100 }, (_, i) => i + 1).find((d) => isTheftNight(d))!
    startDay(night)
    expect(game().rival.lastTheftDay).toBe(night)
    startDay(night + 1)
    expect(game().rival.lastTheftDay).toBe(night)
  })
})
