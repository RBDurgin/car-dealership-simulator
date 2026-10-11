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
import type { Employee } from '../sim/staff'
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
 * the showroom improvements up today and the level add.
 */
export function sellerBonusFor(
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
