import { beforeAll, describe, expect, it } from 'vitest'
import { generateCustomer, type Customer } from '../sim/customers'
import { TUNING, type Difficulty } from '../sim/difficulty'
import { buildInventory, type InventoryCar } from '../sim/inventory'
import { respondToAsk, suggestedAsk } from '../sim/negotiation'
import { createRng, type Rng } from '../sim/rng'
import {
  driveBonus,
  driveExpect,
  driveScore,
  NO_DRIVE_PENALTY,
  type TalkingPoint,
  type TopicFit,
} from '../sim/testDrive'
import { nextDay, playDay, setDriveStyle } from './bench/bot'
import { useGame } from './store'

/**
 * Test drive balance (20d), against the plan's tuning targets. The haggle is
 * played over a seeded crowd by a seller who splits the difference each
 * round, once per way the drive went; the bench bot plays a seeded month on
 * each level for how often shoppers ask and how often a car comes back
 * dinged. The bands are a little wider than the targets for the noise.
 */

/** How the drive went for the haggle below. */
type Outcome = 'noAsk' | 'refused' | 'good' | 'poor' | 'cut'

const CROWD = 4000

/** Asks and counters, splitting the difference, until a yes or a walk. */
function haggle(start: Customer, car: InventoryCar, bonus: number, rng: Rng) {
  let c = start
  for (let asks = 1; ; asks++) {
    const ask = suggestedAsk(c, car)
    const r = respondToAsk(c, car, ask, rng, bonus)
    if (r.answer === 'accept') return { bought: true, counters: asks - 1 }
    if (r.answer === 'walk' || r.counter === undefined) return { bought: false, counters: asks - 1 }
    c = { ...c, haggle: { round: (c.haggle?.round ?? 1) + 1, lastAsk: ask, counter: r.counter } }
  }
}

const twice = (fit: TopicFit): TalkingPoint[] => [
  { topic: null, fit },
  { topic: null, fit },
]

/** The crowd's close rate and counters per deal, with the drive gone `outcome` on `level`. */
function closeRate(outcome: Outcome, level: Difficulty = 'medium') {
  const inventory = buildInventory(createRng(42))
  const crowd = createRng(11)
  const answers = createRng(5)
  const scale = TUNING[level].driveBonus
  let bought = 0
  let counters = 0
  for (let i = 0; i < CROWD; i++) {
    const shopper = generateCustomer(`c${i}`, inventory, crowd)
    const target = inventory.find((x) => x.id === shopper.targetCarId) ?? inventory[0]
    const car = { ...target, cleanliness: 0.85 }
    let c = shopper
    let bonus = 0
    if (outcome === 'refused') bonus = -NO_DRIVE_PENALTY
    else if (outcome !== 'noAsk') {
      const points = outcome === 'cut' ? [] : twice(outcome)
      const score = driveScore({ points, cut: outcome === 'cut' }, c, car)
      bonus = driveBonus(score, scale)
      c = { ...c, expect: driveExpect(c, score) }
    }
    const r = haggle(c, car, bonus, answers)
    bought += r.bought ? 1 : 0
    counters += r.counters
  }
  return { close: bought / CROWD, counters: counters / CROWD }
}

describe('what a test drive does to the haggle on Medium', () => {
  const base = closeRate('noAsk')
  const lift = (outcome: Outcome) => closeRate(outcome).close - base.close

  it('lifts the close rate 10–15 points for a full drive with good talking points', () => {
    expect(lift('good')).toBeGreaterThan(0.09)
    expect(lift('good')).toBeLessThan(0.16)
  })

  it('lifts it about 5 points for a drive cut short or with poor points', () => {
    for (const outcome of ['cut', 'poor'] as const) {
      expect(lift(outcome)).toBeGreaterThan(0.03)
      expect(lift(outcome)).toBeLessThan(0.08)
    }
  })

  it('costs about 5 points to give a price without the drive they asked for', () => {
    expect(lift('refused')).toBeLessThan(-0.03)
    expect(lift('refused')).toBeGreaterThan(-0.07)
  })

  it('takes a good drive’s buyer through fewer counters', () => {
    expect(closeRate('good').counters).toBeLessThan(base.counters * 0.85)
  })

  it('counts for more on Easy and less on Hard', () => {
    const at = (level: Difficulty) => closeRate('good', level).close
    expect(at('easy')).toBeGreaterThan(at('medium'))
    expect(at('hard')).toBeLessThan(at('medium'))
  })
})

const DAYS = 28
const initial = useGame.getState()
const game = () => useGame.getState()

interface Month {
  askShare: number
  drives: number
  dings: number
}

/** A seeded month on `level` with good drives: who asked, and the drives and dings. */
function playMonth(level: Difficulty): Month {
  useGame.setState(initial, true)
  setDriveStyle('good')
  game().newGame(level)
  const seen = new Map<string, Customer>()
  const unsubscribe = useGame.subscribe((s) => {
    for (const c of s.customers) if (!c.selling && !c.service) seen.set(c.id, c)
  })
  let drives = 0
  let dings = 0
  for (let d = 0; d < DAYS; d++) {
    playDay()
    drives += game().dayStats.drives.taken
    dings += game().dayStats.drives.dings
    nextDay()
  }
  unsubscribe()
  setDriveStyle('plain')
  const shoppers = [...seen.values()]
  return { askShare: shoppers.filter((c) => c.wantsDrive).length / shoppers.length, drives, dings }
}

describe('test drives over a seeded month', { timeout: 60_000 }, () => {
  const months = {} as Record<Difficulty, Month>
  beforeAll(() => {
    for (const level of ['easy', 'medium', 'hard'] as const) months[level] = playMonth(level)
  })

  it('has about 35% of shoppers ask for a drive on every level', () => {
    for (const m of Object.values(months)) {
      expect(m.askShare).toBeGreaterThan(0.25)
      expect(m.askShare).toBeLessThan(0.45)
    }
  })

  it('brings about 1 car in 30 back dinged on Medium', () => {
    const { medium } = months
    expect(medium.drives).toBeGreaterThan(30)
    expect(medium.dings / medium.drives).toBeLessThan(0.08)
  })
})
