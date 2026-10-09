import { grossProfit, type DayStats } from './deal'

/**
 * The dealership's career: lifetime totals, added to each time a day is
 * settled, and the rank they've earned. A rank needs a lifetime gross profit
 * (scaled by the difficulty level's `rankScale`) and a minimum reputation.
 * Once reached, a rank is kept, even if reputation slips later.
 */

export type RankId =
  'corner-lot' | 'main-street' | 'trusted-dealer' | 'regional-name' | 'dealer-of-the-year'

export interface Rank {
  id: RankId
  name: string
  /** Lifetime gross profit needed, before the level's `rankScale`. */
  gross: number
  /** Reputation needed. */
  reputation: number
}

/** From the bottom up. Every game starts at the first. */
export const RANKS: readonly Rank[] = [
  { id: 'corner-lot', name: 'Corner Lot', gross: 0, reputation: 0 },
  { id: 'main-street', name: 'Main Street', gross: 120_000, reputation: 45 },
  { id: 'trusted-dealer', name: 'Trusted Dealer', gross: 300_000, reputation: 55 },
  { id: 'regional-name', name: 'Regional Name', gross: 550_000, reputation: 65 },
  { id: 'dealer-of-the-year', name: 'Dealer of the Year', gross: 1_000_000, reputation: 80 },
]

export const RANK_IDS = RANKS.map((r) => r.id)

/** The top rank: reaching it wins the game (play goes on after). */
export const TOP_RANK = RANKS[RANKS.length - 1]

export interface Career {
  /** Lifetime gross profit (sale prices less dealer cost). */
  gross: number
  /** Cars sold, new and used. */
  sales: number
  /** Days settled. */
  days: number
  /** Gross profit so far this month, toward `bestMonth`. */
  monthGross: number
  /** The best month's gross profit, counted once a month is over. */
  bestMonth: number
  /** The highest rank reached. */
  rank: RankId
  /** Times Nazma's rival lot has gone bust. */
  rivalsBeaten: number
}

export function emptyCareer(): Career {
  return {
    gross: 0,
    sales: 0,
    days: 0,
    monthGross: 0,
    bestMonth: 0,
    rank: RANKS[0].id,
    rivalsBeaten: 0,
  }
}

export function isRankId(v: unknown): v is RankId {
  return (RANK_IDS as readonly unknown[]).includes(v)
}

export function rankById(id: RankId): Rank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0]
}

const indexOf = (id: RankId) => RANK_IDS.indexOf(id)

/** `rank`'s lifetime gross at the level's `scale`, rounded to $1,000. */
export function rankGross(rank: Rank, scale = 1): number {
  return Math.round((rank.gross * scale) / 1000) * 1000
}

/** Whether `career` and `reputation` meet `rank`'s requirements. */
function meets(rank: Rank, career: Career, reputation: number, scale: number): boolean {
  return career.gross >= rankGross(rank, scale) && reputation >= rank.reputation
}

/**
 * The rank `career` holds at `reputation`: the highest one met, or the one
 * already reached if that's higher. Ranks are earned in order, so a rank
 * whose reputation isn't met holds back the ones above it.
 */
export function rankOf(career: Career, reputation: number, scale = 1): Rank {
  let earned = 0
  while (earned + 1 < RANKS.length && meets(RANKS[earned + 1], career, reputation, scale)) earned++
  return RANKS[Math.max(earned, indexOf(career.rank))]
}

/** `career` has reached the top rank. */
export function atTopRank(career: Career): boolean {
  return career.rank === TOP_RANK.id
}

/**
 * The best month's gross so far, counting the month under way (which only
 * goes into `bestMonth` once it's over).
 */
export function bestMonthSoFar(career: Career): number {
  return Math.max(career.bestMonth, career.monthGross)
}

/** The rank after `id`, or null at the top. */
export function nextRank(id: RankId): Rank | null {
  return RANKS[indexOf(id) + 1] ?? null
}

/**
 * The day's sales added to `career`, its rank brought up to date at
 * `reputation` (after the day). On the month's last day (`monthEnd`) the
 * month's gross is weighed against the best month and starts again.
 */
export function addDay(
  career: Career,
  stats: DayStats,
  reputation: number,
  monthEnd: boolean,
  scale = 1,
): Career {
  const monthGross = career.monthGross + grossProfit(stats)
  const next: Career = {
    gross: career.gross + grossProfit(stats),
    sales: career.sales + stats.sales.length,
    days: career.days + 1,
    monthGross: monthEnd ? 0 : monthGross,
    bestMonth: monthEnd ? Math.max(career.bestMonth, monthGross) : career.bestMonth,
    rank: career.rank,
    rivalsBeaten: career.rivalsBeaten,
  }
  return { ...next, rank: rankOf(next, reputation, scale).id }
}

/** The rank reached going from `prev` to `next`, or null if it didn't change. */
export function rankUp(prev: Career, next: Career): Rank | null {
  return indexOf(next.rank) > indexOf(prev.rank) ? rankById(next.rank) : null
}

export interface RankProgress {
  rank: Rank
  /** The rank to aim for, or null at the top. */
  next: Rank | null
  /** Lifetime gross needed for `next` at this level (0 at the top). */
  grossNeeded: number
  /** Share of that gross made, 0–1 (1 at the top). */
  share: number
  /** Reputation is high enough for `next`. */
  reputationMet: boolean
}

/** How far `career` is along toward the next rank, for a meter. */
export function rankProgress(career: Career, reputation: number, scale = 1): RankProgress {
  const rank = rankOf(career, reputation, scale)
  const next = nextRank(rank.id)
  if (!next) return { rank, next, grossNeeded: 0, share: 1, reputationMet: true }
  const grossNeeded = rankGross(next, scale)
  return {
    rank,
    next,
    grossNeeded,
    share: Math.max(0, Math.min(1, career.gross / grossNeeded)),
    reputationMet: reputation >= next.reputation,
  }
}

/** The morning's word on a rank reached. */
export function rankUpNotice(rank: Rank): string {
  return rank.id === 'dealer-of-the-year'
    ? `You're the ${rank.name}! The whole region knows your name.`
    : `Your dealership is now a ${rank.name}.`
}
