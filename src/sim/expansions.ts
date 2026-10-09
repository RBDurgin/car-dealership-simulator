import type { ExpansionId } from './layout'
import { RANK_IDS, rankById, type RankId } from './progression'

/**
 * Expansions: ground and buildings bought as the dealership grows. Like
 * improvements they're paid up front and go up overnight, but each needs a
 * rank first (see `sim/progression.ts`), and they change the layout itself
 * (`buildLayout`): the east lot opens the parcel and its parking spaces.
 */

export interface ExpansionInfo {
  label: string
  cost: number
  /** The rank it takes to buy. */
  rank: RankId
  /** An expansion that has to be bought first. */
  requires?: ExpansionId
  /** What it is, for the upgrades tab. */
  blurb: string
}

export const EXPANSIONS: Record<ExpansionId, ExpansionInfo> = {
  'east-lot': {
    label: 'East lot',
    cost: 60_000,
    rank: 'main-street',
    blurb:
      'The empty parcel next door, paved, with 12 more parking spaces and a gate from the lot.',
  },
}

export const EXPANSION_IDS = Object.keys(EXPANSIONS) as ExpansionId[]

/** An expansion bought on `day`. It goes up overnight. */
export interface OwnedExpansion {
  id: ExpansionId
  day: number
}

/** Expansions up on `day`: everything bought before it. */
export function installedExpansions(owned: readonly OwnedExpansion[], day: number): ExpansionId[] {
  return owned.filter((o) => o.day < day).map((o) => o.id)
}

/**
 * What a book (ordering, buying) needs to know which ground is open: the
 * store's expansions and clock. With either left out, nothing is.
 */
export interface Grounds {
  expansions?: readonly OwnedExpansion[]
  clock?: { day: number }
}

/** The expansions up today in `g`. */
export function expansionsUp(g: Grounds): ExpansionId[] {
  return g.expansions && g.clock ? installedExpansions(g.expansions, g.clock.day) : []
}

/** What buying an expansion needs to know about the dealership. */
export interface ExpansionBook {
  cash: number
  expansions: readonly OwnedExpansion[]
  /** The rank reached. */
  rank: RankId
}

/** Why `id` can't be bought, or null if it can. */
export function expansionBlocker(book: ExpansionBook, id: ExpansionId): string | null {
  const info = EXPANSIONS[id]
  const owns = (x: ExpansionId) => book.expansions.some((o) => o.id === x)
  if (owns(id)) return 'Already bought.'
  if (!reached(book.rank, info.rank)) {
    return `Needs the ${rankById(info.rank).name} rank.`
  }
  if (info.requires && !owns(info.requires)) {
    return `Needs the ${EXPANSIONS[info.requires].label.toLowerCase()} first.`
  }
  if (book.cash < info.cost) return 'Not enough cash for that.'
  return null
}

export type ExpansionResult =
  { ok: true; cash: number; expansions: OwnedExpansion[] } | { ok: false; reason: string }

/** Buys expansion `id` on `day`, paid from cash, to go up overnight. */
export function buyExpansion(book: ExpansionBook, id: ExpansionId, day: number): ExpansionResult {
  const reason = expansionBlocker(book, id)
  if (reason) return { ok: false, reason }
  return {
    ok: true,
    cash: book.cash - EXPANSIONS[id].cost,
    expansions: [...book.expansions, { id, day }],
  }
}

/** Whether rank `rank` is at least `needed`. */
function reached(rank: RankId, needed: RankId): boolean {
  return RANK_IDS.indexOf(rank) >= RANK_IDS.indexOf(needed)
}

/** Expansions that a rise from rank `prev` to `next` makes available to buy. */
export function unlockedBy(prev: RankId, next: RankId): ExpansionId[] {
  return EXPANSION_IDS.filter((id) => {
    const { rank } = EXPANSIONS[id]
    return reached(next, rank) && !reached(prev, rank)
  })
}

export function isExpansionId(v: unknown): v is ExpansionId {
  return (EXPANSION_IDS as readonly unknown[]).includes(v)
}
