import { revenue, type DayStats } from './deal'
import { carName } from './interactables'
import { availableCars, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
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

/**
 * A goal the day's team can reasonably meet: more sales and revenue with more
 * salespeople on the payroll, and a body type only if one is for sale.
 */
export function generateGoal(
  rng: Rng,
  inventory: readonly InventoryCar[],
  salesStaff: number,
): OwnerGoal {
  const models = [...new Set(availableCars(inventory).map((c) => c.model))]
  const kinds: OwnerGoal['kind'][] = ['sales', 'revenue', 'noImpatient']
  if (models.length > 0) kinds.push('model')
  switch (rng.pick(kinds)) {
    case 'sales':
      return { kind: 'sales', count: rng.int(2, 3) + salesStaff }
    case 'revenue':
      return { kind: 'revenue', amount: (rng.int(6, 9) + 3 * salesStaff) * 10_000 }
    case 'noImpatient':
      return { kind: 'noImpatient' }
    case 'model':
      return { kind: 'model', model: rng.pick(models) }
  }
}

/** "Sell 2 cars", "Sell a Summit Ridge", "No impatient walk-outs", "$80,000 revenue". */
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
  }
}

/**
 * How far along the day is: `current` toward `target` (for no walk-outs, the
 * walk-outs so far against none allowed), and whether it's met as things stand.
 */
export function goalProgress(
  goal: OwnerGoal,
  stats: DayStats,
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
  }
}

const PRAISE = ['Now that is how you run a lot.', "Good work. Don't let it go to your head."]
const GRUMBLES = [
  'I asked for one thing. One.',
  "I don't pay you to admire the cars.",
  'Tomorrow had better be better.',
  'My accountant is going to hear about this, and so are you.',
]

/** Judges the day against the owner's goal at closing. */
export function judgeDay(goal: OwnerGoal, stats: DayStats, day: number): OwnerVerdict {
  const { met } = goalProgress(goal, stats)
  const lines = met ? PRAISE : GRUMBLES
  return { goal, met, bonus: met ? OWNER_BONUS : 0, line: lines[day % lines.length] }
}
