import { atTopRank } from '../sim/progression'
import { dayOver, isClosed } from '../sim/clock'
import { PLAYER_ID, PLAYER_SKILL, skillBonus, type Customer } from '../sim/customers'
import { DEFAULT_DIFFICULTY, TUNING, type Tuning } from '../sim/difficulty'
import { expansionsUp } from '../sim/expansions'
import { TIER_PERKS } from '../sim/franchise'
import { effectsOf, installed } from '../sim/improvements'
import type { VisitOdds } from '../sim/nazma'
import { loyaltyBonus } from '../sim/clients'
import type { RepScale } from '../sim/reputation'
import { bayCount, type ReconBook } from '../sim/service'
import { workPace } from '../sim/morale'
import { financeSeconds, type Employee } from '../sim/staff'
import { netPrice, staffPlan } from '../sim/fi'
import { driveBonusFor } from '../sim/testDrive'
import type { GameState } from './types'

/**
 * Values read off the store's state: pure, so the slices, the UI and the
 * scene share them.
 */

/** Medium's starting cash; each level's is `TUNING[level].startingCash`. */
export const STARTING_CASH = TUNING[DEFAULT_DIFFICULTY].startingCash

/** Dev-only game speeds, cycled with a key. 1 is normal. */
export const DEV_TIME_SCALES = [1, 4, 16] as const

/**
 * Time stands still and the player can't move behind the title screen, the
 * guide or the rotate-your-device prompt.
 */
export function isPaused(s: Pick<GameState, 'screen' | 'helpOpen' | 'rotatePrompt'>): boolean {
  return s.screen === 'title' || s.helpOpen || s.rotatePrompt
}

/**
 * Nothing in the scene moves: paused, or the day is over and its summary up.
 * The canvas draws only on demand then, and Auto graphics stop measuring.
 */
export function sceneIdle(
  s: Pick<GameState, 'screen' | 'helpOpen' | 'rotatePrompt' | 'clock' | 'customers'>,
): boolean {
  return isPaused(s) || dayOver(s)
}

/**
 * The win screen shows over the day summary once the top rank is reached,
 * until the player picks Keep playing.
 */
export function winShowing(
  s: Pick<GameState, 'screen' | 'clock' | 'customers' | 'career' | 'won'>,
): boolean {
  return s.screen === 'playing' && dayOver(s) && atTopRank(s.career) && !s.won
}

/** Whether a service advisor is at the counter. */
export function advisorAtPost(roster: readonly Employee[]): boolean {
  return roster.some((e) => e.role === 'advisor' && e.status === 'atPost' && !e.fired)
}

/** Mechanics on the payroll (not let go). */
export function mechanicCount(roster: readonly Employee[]): number {
  return roster.filter((e) => e.role === 'mechanic' && !e.fired).length
}

/** What deciding whether a car can go to the shop needs, from the store. */
export function reconBook(
  s: Pick<GameState, 'inventory' | 'customers' | 'roster' | 'expansions' | 'clock'>,
): ReconBook {
  return {
    inventory: s.inventory,
    customers: s.customers,
    bays: bayCount(expansionsUp(s)),
    mechanics: mechanicCount(s.roster),
    closed: isClosed(s.clock),
  }
}

/** The levers of the game's difficulty level; a stable object, so fine as a selector. */
export function levelTuning(s: Pick<GameState, 'difficulty'>): Tuning {
  return TUNING[s.difficulty]
}

/** × each car's invoice: the level's factor and the franchise tier's. */
export function orderInvoice(s: Pick<GameState, 'difficulty' | 'franchise'>): number {
  return TUNING[s.difficulty].invoice * TIER_PERKS[s.franchise].invoice
}

/**
 * What `c`'s seller adds to the odds of a yes: their skill bonus, plus what
 * the showroom improvements up today and the level add, and what a test
 * drive did (or not having one they wanted, see `driveBonusFor`).
 */
export function sellerBonusFor(
  s: Pick<GameState, 'improvements' | 'clock' | 'difficulty' | 'roster' | 'clients' | 'inventory'>,
  c: Pick<Customer, 'handlerId' | 'clientId' | 'drive' | 'wantsDrive' | 'targetCarId'>,
): number {
  return baseSellerBonus(s, c) + testDriveBonus(s, c)
}

/** What the test drive does to `c`'s odds of a yes, at the level's scale. */
export function testDriveBonus(
  s: Pick<GameState, 'difficulty' | 'inventory'>,
  c: Pick<Customer, 'drive' | 'wantsDrive' | 'targetCarId'>,
): number {
  return driveBonusFor(c, s.inventory, levelTuning(s).driveBonus)
}

/** `sellerBonusFor` without the test drive: the seller, the showroom, the level and the book. */
export function baseSellerBonus(
  s: Pick<GameState, 'improvements' | 'clock' | 'difficulty' | 'roster' | 'clients'>,
  c: Pick<Customer, 'handlerId' | 'clientId'>,
): number {
  const showroom =
    effectsOf(installed(s.improvements, s.clock.day)).acceptBonus + levelTuning(s).acceptBonus
  // Someone from the book is as keen as their visits left them.
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined
  const extra = showroom + (client ? loyaltyBonus(client.satisfaction) : 0)
  if (c.handlerId === PLAYER_ID) return skillBonus(PLAYER_SKILL) + extra
  const e = s.roster.find((x) => x.id === c.handlerId)
  return (e ? skillBonus(e.skill) : 0) + extra
}

/** The level's scale on reputation gains and losses. */
export function repScale(t: Tuning): RepScale {
  return { gain: t.repGain, loss: t.repLoss }
}

/** The level's odds of a visit from Nazma, scaled by his rival lot's `sabotageScale`. */
export function visitOdds(t: Tuning, scale = 1): VisitOdds {
  return { chance: t.nazmaChance * scale, firstDay: t.firstNazmaDay }
}

/**
 * Game seconds the finance manager `e` takes over `c`'s paperwork: longer
 * for each product he'll present at the menu (see `staffPlan`).
 */
export function financePaperwork(
  s: Pick<GameState, 'difficulty'>,
  c: Pick<Customer, 'offer' | 'archetype' | 'credit' | 'budget'>,
  e: Pick<Employee, 'skill' | 'morale' | 'streak'>,
): number {
  const plan = c.offer ? staffPlan(e.skill, c, netPrice(c.offer), levelTuning(s).productTake) : null
  return financeSeconds(e.skill, plan?.presents.length ?? 0) * workPace(e)
}
