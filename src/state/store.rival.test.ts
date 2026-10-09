import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Customer } from '../sim/customers'
import { emptyStats } from '../sim/deal'
import { isTheftNight, nazmaSummary } from '../sim/nazma'
import { wageFor, type Employee } from '../sim/staff'
import { emptyCareer, RANKS } from '../sim/progression'
import { BASE_MSRP } from '../sim/inventory'
import {
  emptyRival,
  OPEN_STRENGTH,
  OPEN_UNDERCUT,
  openingDay,
  HIRE_STRENGTH,
  rivalPrice,
  type Rival,
} from '../sim/rival'
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

  it('opens stronger and cheaper on Hard, weaker and dearer on Easy', () => {
    game().newGame('hard')
    useGame.setState({ rival: { ...emptyRival(), status: 'announced', openDay: 22 } })
    startDay(22)
    expect(game().rival.strength).toBe(OPEN_STRENGTH * 1.25)
    expect(game().rival.undercut).toBeCloseTo(OPEN_UNDERCUT * 1.2)
    game().newGame('easy')
    useGame.setState({ rival: { ...emptyRival(), status: 'announced', openDay: 22 } })
    startDay(22)
    expect(game().rival.undercut).toBeCloseTo(OPEN_UNDERCUT * 0.8)
  })

  /** Plays `day` through to closing with `rival`, and returns everyone who came. */
  const shoppersWith = (rival: Rival, day = 26) => {
    useGame.setState({ rival, reputation: 30 })
    startDay(day)
    const all: Customer[] = []
    for (let minute = game().clock.minute + 1; minute < CLOSE_MINUTE; minute++) {
      game().tickClock({ day, minute })
      for (const c of game().customers) if (!all.some((x) => x.id === c.id)) all.push(c)
    }
    return all
  }

  it('sends some shoppers in with his price on a model they want', () => {
    const rival = open({ strength: 100, undercut: 0.08 })
    const all = shoppersWith(rival)
    const quoted = all.filter((c) => c.rivalQuote)
    expect(quoted.length).toBeGreaterThan(0)
    expect(quoted.length).toBeLessThan(all.length)
    for (const c of quoted) {
      const { model, price } = c.rivalQuote!
      expect(c.preferredModels).toContain(model)
      expect(price).toBe(rivalPrice(game().rival, BASE_MSRP[model]))
      expect(c.selling).toBeNull()
      expect(c.archetype).not.toBe('used-shopper')
    }
  })

  it('sends nobody in with a quote before he opens', () => {
    const all = shoppersWith(emptyRival())
    expect(all.length).toBeGreaterThan(0)
    expect(all.some((c) => c.rivalQuote)).toBe(false)
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

  it('reports last week’s share on Monday morning', () => {
    useGame.setState({ rival: open({ shares: [0.1, 0.2, 0.3], weeks: [0.25] }) })
    // Day 29 is a Monday.
    startDay(29)
    expect(game().rival.weeks).toHaveLength(2)
    expect(game().notice?.text).toContain(
      "Nazma's Motors took 20% (↓5) of the town's buyers last week.",
    )
    // Nothing more until next Monday.
    startDay(30)
    expect(game().rival.weeks).toHaveLength(2)
  })

  it('remembers the last theft night', () => {
    const night = Array.from({ length: 100 }, (_, i) => i + 1).find((d) => isTheftNight(d))!
    startDay(night)
    expect(game().rival.lastTheftDay).toBe(night)
    startDay(night + 1)
    expect(game().rival.lastTheftDay).toBe(night)
  })
})

describe('his moves and sabotage', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })
  const night = Array.from({ length: 100 }, (_, i) => i + 1).find((d) => isTheftNight(d))!

  it('picks a move on Monday, says it in the notice and keeps it through a reload', () => {
    useGame.setState({ rival: open({ shares: [0.2], weeks: [0.2] }) })
    // Day 29 is a Monday.
    startDay(29)
    const move = game().rival.move
    expect(move?.from).toBe(29)
    expect(game().notice?.text).toMatch(/This week: /)
    startDay(30)
    expect(game().rival.move).toEqual(move)
  })

  it('puts a stolen car on his lot, and says so', () => {
    useGame.setState({ rival: open() })
    startDay(night)
    const [stolen] = game().dayStats.nazma.stolen
    expect(stolen).toBeDefined()
    expect(game().rival.stolen).toEqual([stolen.model])
    expect(game().rival.lastTheftDay).toBe(night)
    expect(game().notice?.text).toMatch(/It's for sale at Nazma's Motors now\./)
    expect(nazmaSummary(game().dayStats.nazma)).toMatch(/now for sale at Nazma's Motors/)
  })

  it('never repeats a theft on reload, however desperate he gets', () => {
    useGame.setState({ rival: open() })
    startDay(night)
    const left = game().inventory.length
    // Desperate now, so the odds are doubled; the saved last night still keeps the gap.
    useGame.setState({ rival: { ...game().rival, shares: [0.01] } })
    for (let i = 0; i < 3; i++) startDay(night + 1)
    expect(game().dayStats.nazma.stolen).toEqual([])
    expect(game().inventory.length).toBeGreaterThanOrEqual(left)
  })

  it('leaves the cars alone overnight before his lot opens, as before', () => {
    startDay(night)
    expect(game().dayStats.nazma.stolen).toHaveLength(1)
    expect(game().rival.stolen).toEqual([])
    expect(nazmaSummary(game().dayStats.nazma)).not.toMatch(/for sale/)
  })

  it('visits more often while desperate', () => {
    const visits = (shares: number[]) => {
      let n = 0
      for (let day = 10; day < 90; day++) {
        useGame.setState({ rival: open({ shares }) })
        startDay(day)
        if (game().nazma) n++
      }
      return n
    }
    expect(visits([0.01])).toBeGreaterThan(visits([0.25]) * 1.4)
  })

  it('hires a poached employee who quits, and grows stronger', () => {
    const dana: Employee = {
      id: 'staff-1-2',
      name: 'Dana R.',
      variant: 'female-e',
      role: 'sales',
      skill: 4,
      wage: wageFor('sales', 4),
      status: 'atPost',
      fired: false,
      quitting: true,
    }
    useGame.setState({ rival: open({ strength: 40 }), roster: [dana] })
    endDay()
    expect(game().rival.hires).toEqual(['Dana R.'])
    // His strength also drifted with the day's share when it was settled.
    expect(game().rival.strength).toBeGreaterThan(40 + 4 * HIRE_STRENGTH - 5)
    expect(game().dayStats.nazma.joined).toEqual([{ name: 'Dana R.', role: 'sales' }])
    expect(nazmaSummary(game().dayStats.nazma)).toBe("Dana R. now sells for Nazma's Motors")
  })
})
