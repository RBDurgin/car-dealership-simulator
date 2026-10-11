import {
  ACHIEVEMENTS,
  isAchievementId,
  type AchievementId,
  type EarnedAchievement,
} from './achievements'
import { DIFFICULTIES, isDifficulty, type Difficulty } from './difficulty'
import type { Records } from './stats'

/**
 * The device-wide trophy case: every achievement ever earned on this device,
 * across games, and the best records of any run. Kept in localStorage apart
 * from the save (see `startTrophyCase`), so clearing the save keeps it.
 */

/** When an achievement was first earned on this device (a real time, ms) and the hardest level since. */
export interface CaseEntry {
  first: number
  level: Difficulty
}

/** The best of each record across every game: day, week and month gross, one deal's gross, days in a row with a sale. */
export interface BestEver {
  day: number
  week: number
  month: number
  deal: number
  streak: number
}

export interface TrophyCase {
  earned: Partial<Record<AchievementId, CaseEntry>>
  best: BestEver
}

export const BEST_KEYS: readonly (keyof BestEver)[] = ['day', 'week', 'month', 'deal', 'streak']

export function emptyCase(): TrophyCase {
  return { earned: {}, best: { day: 0, week: 0, month: 0, deal: 0, streak: 0 } }
}

const levelRank = (d: Difficulty) => DIFFICULTIES.indexOf(d)

/** The harder of two levels. */
export const harder = (a: Difficulty, b: Difficulty): Difficulty =>
  levelRank(b) > levelRank(a) ? b : a

/** A game's records as the case keeps them. */
export function bestOf(records: Records): BestEver {
  return {
    day: records.bestDay?.value ?? 0,
    week: records.bestWeek?.value ?? 0,
    month: records.bestMonth?.value ?? 0,
    deal: records.biggestDeal?.value ?? 0,
    streak: records.longestStreak?.value ?? 0,
  }
}

/**
 * The case with a game's `achievements` and `records` in: a new id is stamped
 * `now`; one already there keeps its earliest time and takes the hardest
 * level; each record keeps the highest. Returns `c` itself when nothing changed.
 */
export function mergeCase(
  c: TrophyCase,
  achievements: readonly EarnedAchievement[],
  records: Records,
  now: number,
): TrophyCase {
  let earned = c.earned
  for (const a of achievements) {
    const had = earned[a.id]
    const entry: CaseEntry = had
      ? { first: had.first, level: harder(had.level, a.level) }
      : { first: now, level: a.level }
    if (had && had.level === entry.level) continue
    if (earned === c.earned) earned = { ...earned }
    earned[a.id] = entry
  }
  const game = bestOf(records)
  let best = c.best
  for (const key of BEST_KEYS) {
    if (game[key] <= best[key]) continue
    if (best === c.best) best = { ...best }
    best[key] = game[key]
  }
  return earned === c.earned && best === c.best ? c : { earned, best }
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** A case read back from storage: unknown ids and anything badly formed are dropped. */
export function parseCase(raw: unknown): TrophyCase {
  const c = emptyCase()
  if (!raw || typeof raw !== 'object') return c
  const { earned, best } = raw as { earned?: unknown; best?: unknown }
  if (earned && typeof earned === 'object') {
    for (const [id, entry] of Object.entries(earned)) {
      if (!isAchievementId(id) || !entry || typeof entry !== 'object') continue
      const { first, level } = entry as { first?: unknown; level?: unknown }
      if (isCount(first) && isDifficulty(level)) c.earned[id] = { first, level }
    }
  }
  if (best && typeof best === 'object') {
    for (const key of BEST_KEYS) {
      const v = (best as Record<string, unknown>)[key]
      if (isCount(v)) c.best[key] = v
    }
  }
  return c
}

/** How many of the catalogue the case holds. */
export const caseCount = (c: TrophyCase) => ACHIEVEMENTS.filter((a) => c.earned[a.id]).length
