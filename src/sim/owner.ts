import { revenue, totalGross, type DayStats } from './deal'
import { carName } from './interactables'
import { availableCars, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import { MAX_DAILY_CHANGE, reputationChange, type RepScale } from './reputation'
import { createRng, type Rng } from './rng'

/**
 * The dealership's owner. Every two or three days they drop in at opening,
 * walk to the office and set a goal for the day. At closing the day is judged
 * against it: a cash bonus if it was met, a grumble in the summary if not.
 */
export type OwnerGoal =
  | { kind: 'sales'; count: number }
  | { kind: 'model'; model: CarModel }
  | { kind: 'noImpatient' }
  | { kind: 'revenue'; amount: number }
  | { kind: 'profit'; amount: number }
  /** Raise reputation by at least `points` today (see `reputationChange`). */
  | { kind: 'reputation'; points: number }
  /** Finish `count` clients' service jobs today. */
  | { kind: 'serviced'; count: number }

/** The owner's id in the world (crowd, chatter). */
export const OWNER_ID = 'owner'

/** Today's visit: the goal, and whether the owner has reached the office and said it yet. */
export interface OwnerVisit {
  goal: OwnerGoal
  announced: boolean
}

/** How the day measured up, for the summary. */
export interface OwnerVerdict {
  goal: OwnerGoal
  met: boolean
  /** Cash paid for meeting it (0 if not). */
  bonus: number
  /** What the owner has to say about it. */
  line: string
}

/** The first visit, once the player has had a day to find their feet. */
export const FIRST_OWNER_DAY = 2
export const OWNER_GAP_DAYS = { min: 2, max: 3 }
export const OWNER_BONUS = 1_500
const OWNER_SEED = 13_000

/** Whether the owner visits on `day`: day 2, then every two or three days. */
export function isOwnerDay(day: number): boolean {
  let visit = FIRST_OWNER_DAY
  while (visit < day) {
    visit += createRng(OWNER_SEED + visit).int(OWNER_GAP_DAYS.min, OWNER_GAP_DAYS.max)
  }
  return visit === day
}

/** On a sale weekend the owner is likelier to set a sales goal, and this many cars bigger. */
export const EVENT_SALES_EXTRA = 2

/**
 * A goal the day's team can reasonably meet: more sales, revenue and profit with more
 * salespeople on the payroll, and a body type only if one is for sale. On a
 * sale weekend (`onSale`) a sales goal is likelier, and bigger. A service
 * goal only with `bays` up and the garage open today.
 */
export function generateGoal(
  rng: Rng,
  inventory: readonly InventoryCar[],
  salesStaff: number,
  onSale = false,
  bays = 0,
): OwnerGoal {
  const models = [...new Set(availableCars(inventory).map((c) => c.model))]
  const kinds: OwnerGoal['kind'][] = ['sales', 'revenue', 'profit', 'noImpatient', 'reputation']
  if (models.length > 0) kinds.push('model')
  if (onSale) kinds.push('sales', 'sales')
  if (bays > 0) kinds.push('serviced')
  switch (rng.pick(kinds)) {
    case 'sales':
      return {
        kind: 'sales',
        count: rng.int(2, 3) + salesStaff + (onSale ? EVENT_SALES_EXTRA : 0),
      }
    case 'revenue':
      return { kind: 'revenue', amount: (rng.int(6, 9) + 3 * salesStaff) * 10_000 }
    case 'profit':
      return { kind: 'profit', amount: (rng.int(6, 9) + 3 * salesStaff) * 1_000 }
    case 'noImpatient':
      return { kind: 'noImpatient' }
    case 'reputation':
      // Never more than a day can earn.
      return { kind: 'reputation', points: Math.min(MAX_DAILY_CHANGE, rng.int(3, 5) + salesStaff) }
    case 'model':
      return { kind: 'model', model: rng.pick(models) }
    case 'serviced':
      return { kind: 'serviced', count: rng.int(1, 2) + bays }
  }
}

/**
 * "Sell 2 cars", "Sell a Summit Ridge", "No impatient walk-outs", "$80,000 revenue",
 * "$8,000 gross profit", "Gain 4 reputation", "Finish 4 service jobs".
 */
export function goalLabel(goal: OwnerGoal, money: (n: number) => string): string {
  switch (goal.kind) {
    case 'sales':
      return `Sell ${goal.count} cars`
    case 'model':
      return `Sell a ${carName(goal.model)}`
    case 'noImpatient':
      return 'No impatient walk-outs'
    case 'revenue':
      return `${money(goal.amount)} revenue`
    case 'profit':
      return `${money(goal.amount)} gross profit`
    case 'reputation':
      return `Gain ${goal.points} reputation`
    case 'serviced':
      return `Finish ${goal.count} service jobs`
  }
}

/**
 * How far along the day is: `current` toward `target` (for no walk-outs, the
 * walk-outs so far against none allowed), and whether it's met as things stand.
 * A reputation goal counts the change at the level's `rep` scale.
 */
export function goalProgress(
  goal: OwnerGoal,
  stats: DayStats,
  rep?: RepScale,
): { current: number; target: number; met: boolean } {
  switch (goal.kind) {
    case 'sales': {
      const current = stats.sales.length
      return { current, target: goal.count, met: current >= goal.count }
    }
    case 'model': {
      const current = stats.sales.filter((s) => s.model === goal.model).length
      return { current, target: 1, met: current >= 1 }
    }
    case 'noImpatient':
      return { current: stats.impatient, target: 0, met: stats.impatient === 0 }
    case 'revenue': {
      const current = revenue(stats)
      return { current, target: goal.amount, met: current >= goal.amount }
    }
    case 'profit': {
      const current = totalGross(stats)
      return { current, target: goal.amount, met: current >= goal.amount }
    }
    case 'reputation': {
      const current = reputationChange(stats, rep)
      return { current, target: goal.points, met: current >= goal.points }
    }
    case 'serviced': {
      const current = stats.service.jobs
      return { current, target: goal.count, met: current >= goal.count }
    }
  }
}

const PRAISE = ['Now that is how you run a lot.', "Good work. Don't let it go to your head."]
const GRUMBLES = [
  'I asked for one thing. One.',
  "I don't pay you to admire the cars.",
  'Tomorrow had better be better.',
  'My accountant is going to hear about this, and so are you.',
]

/**
 * Judges the day against the owner's goal at closing. The level scales the
 * bonus (`bonus` × `OWNER_BONUS`, rounded to $100) and reputation (`rep`).
 */
export function judgeDay(
  goal: OwnerGoal,
  stats: DayStats,
  day: number,
  bonus = 1,
  rep?: RepScale,
): OwnerVerdict {
  const { met } = goalProgress(goal, stats, rep)
  const lines = met ? PRAISE : GRUMBLES
  return { goal, met, bonus: met ? ownerBonus(bonus) : 0, line: lines[day % lines.length] }
}

/** The bonus for a goal met at the level's `factor`, rounded to $100. */
export function ownerBonus(factor = 1): number {
  return Math.round((OWNER_BONUS * factor) / 100) * 100
}
