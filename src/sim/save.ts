import { calendarOf } from './calendar'
import type { GameTime } from './clock'
import { isDifficulty, TUNING, type Difficulty } from './difficulty'
import { isExpansionId, type OwnedExpansion } from './expansions'
import { IMPROVEMENT_IDS, type OwnedImprovement } from './improvements'
import { isFranchiseTier, START_TIER, type FranchiseTier } from './franchise'
import { COST_FRACTION, type InventoryCar } from './inventory'
import { PARKING_SPACES, PLATFORMS } from './layout'
import { CHANNEL_IDS, unfinished, type Campaign } from './marketing'
import { lastTheftNight } from './nazma'
import { BASE_SLOTS, type Order } from './ordering'
import { emptyCareer, isRankId, type Career } from './progression'
import { emptyMonthSales, monthlyQuota, type MonthSales } from './quota'
import { MAX_REPUTATION, START_REPUTATION } from './reputation'
import { emptyRival, isRival, type Rival } from './rival'
import { dressFor, ROLES, type Employee } from './staff'
import { isTipId, type TipId } from './tips'
import { LATEST_NEWS, legacyNews } from './whatsNew'

/**
 * The saved game. Saves are only made at the end of a day, so nothing mid-day
 * (customers, positions, the running clock, rng streams) is kept: each day is
 * rebuilt from its number when it starts. Bump the version whenever a saved
 * type (`InventoryCar`, `Employee`) changes shape, and add an entry to
 * `UPGRADES` that brings the previous version up to date. Saves older than the
 * upgrade chain reaches are ignored. Orders placed during the day are kept and
 * delivered on the morning the save resumes, ad campaigns that haven't
 * finished carry on, and improvements bought that day are up by then.
 */
export const SAVE_VERSION = 21

export interface SaveData {
  version: number
  /** Real time (ms since epoch) the save was written. */
  savedAt: number
  /** The day that just ended. Resuming starts the morning after. */
  day: number
  cash: number
  inventory: InventoryCar[]
  roster: Employee[]
  /** Cars ordered, to be delivered on the morning the save resumes. */
  orders: Order[]
  /** Ad campaigns still running (or starting) the morning the save resumes. */
  campaigns: Campaign[]
  /** Improvements bought, with the day each was bought. */
  improvements: OwnedImprovement[]
  /** Expansions bought, with the day each was bought (see `sim/expansions.ts`). */
  expansions: OwnedExpansion[]
  /** Reputation after the day was settled (see `sim/reputation.ts`). */
  reputation: number
  /** The month's sales so far, toward the manufacturer's quota (see `sim/quota.ts`). */
  monthSales: MonthSales
  /** The month's sales target. */
  quota: number
  /** The level picked at New game. */
  difficulty: Difficulty
  /** The bank's one-time safety net (Easy) has been used. */
  bailoutUsed: boolean
  /** Guided tips already shown (Easy), so a resumed game doesn't repeat them. */
  tipsSeen: TipId[]
  /** Lifetime totals and the rank reached (see `sim/progression.ts`). */
  career: Career
  /** The manufacturer's franchise tier (see `sim/franchise.ts`). */
  franchise: FranchiseTier
  /** The top rank's win screen has been seen, and play went on. */
  won: boolean
  /** The latest update (see `sim/whatsNew.ts`) this game's player has been shown. */
  news: number
  /** Nazma's lot across the road (see `sim/rival.ts`). */
  rival: Rival
}

export interface SaveSource {
  clock: GameTime
  cash: number
  inventory: InventoryCar[]
  roster: Employee[]
  orders: Order[]
  campaigns: Campaign[]
  improvements: OwnedImprovement[]
  expansions: OwnedExpansion[]
  reputation: number
  monthSales: MonthSales
  quota: number
  difficulty: Difficulty
  bailoutUsed: boolean
  tipsSeen: TipId[]
  career: Career
  franchise: FranchiseTier
  won: boolean
  rival: Rival
}

/**
 * A save of the day that just ended. The fired (and those who quit) are gone
 * and everyone else is off for the night, nobody still thinking of quitting.
 * A build that writes a save has shown its updates on the title screen (or
 * it's a new game, with nothing to catch up on), so `news` is the latest.
 */
export function createSave(s: SaveSource, now: number): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    day: s.clock.day,
    cash: s.cash,
    inventory: s.inventory,
    roster: s.roster.filter((e) => !e.fired).map((e) => ({ ...e, status: 'off', quitting: false })),
    orders: s.orders,
    campaigns: unfinished(s.campaigns, s.clock.day + 1),
    improvements: s.improvements,
    expansions: s.expansions,
    reputation: s.reputation,
    monthSales: s.monthSales,
    quota: s.quota,
    difficulty: s.difficulty,
    bailoutUsed: s.bailoutUsed,
    tipsSeen: s.tipsSeen,
    career: s.career,
    franchise: s.franchise,
    won: s.won,
    news: LATEST_NEWS,
    rival: s.rival,
  }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

type RawSave = Record<string, unknown>

/** A v2 car's cost, before cars had one: the middle of the range a new game rolls. */
const LEGACY_COST_FRACTION = (COST_FRACTION.min + COST_FRACTION.max) / 2

/**
 * Each step brings a save from its key version to the next. `from` is the
 * version the save was read at, before any step ran.
 */
const UPGRADES: Record<number, (raw: RawSave, from: number) => RawSave> = {
  // v3: cars have a dealer cost.
  2: (raw) => ({
    ...raw,
    inventory: Array.isArray(raw.inventory)
      ? raw.inventory.map((c: unknown) =>
          isObject(c) && isNumber(c.msrp)
            ? { ...c, cost: Math.round((c.msrp * LEGACY_COST_FRACTION) / 100) * 100 }
            : c,
        )
      : raw.inventory,
  }),
  // v4: cars know when they arrived and whether they're floored, and orders are saved.
  3: (raw) => ({
    ...raw,
    inventory: Array.isArray(raw.inventory)
      ? raw.inventory.map((c: unknown) =>
          isObject(c) ? { ...c, arrivedDay: 1, floored: false } : c,
        )
      : raw.inventory,
    orders: [],
  }),
  // v5: ad campaigns.
  4: (raw) => ({ ...raw, campaigns: [] }),
  // v6: improvements.
  5: (raw) => ({ ...raw, improvements: [] }),
  // v7: reputation, starting where a new game does.
  6: (raw) => ({ ...raw, reputation: START_REPUTATION }),
  // v8: employees can be thinking of quitting (never at the end of a day).
  7: (raw) => ({
    ...raw,
    roster: Array.isArray(raw.roster)
      ? raw.roster.map((e: unknown) => (isObject(e) ? { ...e, quitting: false } : e))
      : raw.roster,
  }),
  // v9: the manufacturer's quota, starting the month afresh at the save's reputation.
  8: (raw) => ({
    ...raw,
    monthSales: emptyMonthSales(),
    quota: isNumber(raw.day)
      ? monthlyQuota(
          calendarOf(raw.day).month,
          BASE_SLOTS,
          isNumber(raw.reputation) ? raw.reputation : START_REPUTATION,
        )
      : undefined,
  }),
  // v10: difficulty levels. Every game before them was Medium.
  9: (raw) => ({ ...raw, difficulty: 'medium' }),
  // v11: Easy's safety net and guided tips, neither used yet.
  10: (raw) => ({ ...raw, bailoutUsed: false, tipsSeen: [] }),
  // v12: used cars. Every car before them was new.
  11: (raw) => ({
    ...raw,
    inventory: Array.isArray(raw.inventory)
      ? raw.inventory.map((c: unknown) => (isObject(c) ? { ...c, used: null } : c))
      : raw.inventory,
  }),
  // v13: the career, starting from nothing.
  12: (raw) => ({ ...raw, career: emptyCareer() }),
  // v14: the updates already shown, judged by the version the save started at.
  13: (raw, from) => ({ ...raw, news: legacyNews(from) }),
  // v15: the franchise tier. Every game before it starts at Bronze.
  14: (raw) => ({ ...raw, franchise: START_TIER }),
  // v16: expansions. Nothing was bought before them.
  15: (raw) => ({ ...raw, expansions: [] }),
  // v17: the win. Nobody had seen the win screen before it.
  16: (raw) => ({ ...raw, won: false }),
  // v18: Nazma's rival lot, not yet announced. His last theft night is replayed
  // at the save's level, so the gap after it holds.
  17: (raw) => ({
    ...raw,
    rival: {
      ...emptyRival(),
      lastTheftDay: isNumber(raw.day)
        ? lastTheftNight(
            raw.day,
            isDifficulty(raw.difficulty) ? TUNING[raw.difficulty].theftChance : 1,
          )
        : 0,
    },
  }),
  // v19: his weekly shares, none reported yet.
  18: (raw) => ({
    ...raw,
    rival:
      typeof raw.rival === 'object' && raw.rival !== null ? { ...raw.rival, weeks: [] } : raw.rival,
  }),
  // v20: his weekly move, none picked until the next Monday.
  19: (raw) => ({
    ...raw,
    rival:
      typeof raw.rival === 'object' && raw.rival !== null
        ? { ...raw.rival, move: null }
        : raw.rival,
  }),
  // v21: going bust. He never had, and nobody had beaten him.
  20: (raw) => ({
    ...raw,
    rival: isObject(raw.rival) ? { ...raw.rival, closedDay: 0 } : raw.rival,
    career: isObject(raw.career) ? { ...raw.career, rivalsBeaten: 0 } : raw.career,
  }),
}

/** `raw` brought up to `SAVE_VERSION`, or null if it's too old (or new) to upgrade. */
function upgrade(raw: RawSave): RawSave | null {
  let save = raw
  const from = raw.version as number
  while (save.version !== SAVE_VERSION) {
    const version = save.version
    const step = isNumber(version) ? UPGRADES[version] : undefined
    if (!step) return null
    save = { ...step(save, from), version: (version as number) + 1 }
  }
  return save
}

/**
 * A save read back from storage and brought up to date, or null if it's
 * missing, from a version that can't be upgraded, or malformed.
 */
export function parseSave(input: unknown): SaveData | null {
  const raw = isObject(input) ? upgrade(input) : null
  if (!raw) return null
  const { savedAt, day, cash, inventory, roster, orders, campaigns, improvements, reputation } = raw
  const { monthSales, quota, difficulty, bailoutUsed, tipsSeen, career, franchise, news } = raw
  const { expansions, won, rival } = raw
  if (!isNumber(savedAt) || !isNumber(day) || day < 1 || !isNumber(cash)) return null
  if (!Array.isArray(inventory) || !inventory.every(isCar)) return null
  if (!Array.isArray(roster) || !roster.every(isEmployee)) return null
  if (!Array.isArray(orders) || !orders.every(isOrder)) return null
  if (!Array.isArray(campaigns) || !campaigns.every(isCampaign)) return null
  if (!Array.isArray(improvements) || !improvements.every(isImprovement)) return null
  if (!Array.isArray(expansions) || !expansions.every(isExpansion)) return null
  if (!isNumber(reputation) || reputation < 0 || reputation > MAX_REPUTATION) return null
  if (!isObject(monthSales) || !isNumber(monthSales.count) || !isNumber(monthSales.msrp))
    return null
  if (!isNumber(quota) || quota < 1) return null
  if (!isDifficulty(difficulty)) return null
  if (typeof bailoutUsed !== 'boolean') return null
  if (!Array.isArray(tipsSeen) || !tipsSeen.every(isTipId)) return null
  if (!isCareer(career)) return null
  if (!isFranchiseTier(franchise)) return null
  if (typeof won !== 'boolean') return null
  if (!isRival(rival)) return null
  if (!Number.isInteger(news) || (news as number) < 0) return null
  // Older saves may have a dropped model (female-a), or the police uniform off a guard.
  for (const e of roster as Employee[]) e.variant = dressFor(e.role, e.variant)
  // A newer build has more updates than this one knows of.
  return { ...raw, news: Math.min(news as number, LATEST_NEWS) } as unknown as SaveData
}

function isCar(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.model === 'string' &&
    isNumber(v.msrp) &&
    isNumber(v.cost) &&
    isNumber(v.cleanliness) &&
    isNumber(v.arrivedDay) &&
    typeof v.floored === 'boolean' &&
    isObject(v.rect) &&
    (v.status === 'available' || v.status === 'sold') &&
    (v.used === null || isUsedInfo(v.used))
  )
}

function isCareer(v: unknown): boolean {
  return (
    isObject(v) &&
    isNumber(v.gross) &&
    isNumber(v.sales) &&
    isNumber(v.days) &&
    isNumber(v.monthGross) &&
    isNumber(v.bestMonth) &&
    isRankId(v.rank) &&
    isNumber(v.rivalsBeaten)
  )
}

function isUsedInfo(v: unknown): boolean {
  return (
    isObject(v) &&
    isNumber(v.year) &&
    isNumber(v.miles) &&
    isNumber(v.condition) &&
    v.condition >= 0 &&
    v.condition <= 1 &&
    isNumber(v.acquiredDay)
  )
}

function isEmployee(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    (ROLES as readonly unknown[]).includes(v.role) &&
    isNumber(v.wage) &&
    isNumber(v.skill) &&
    typeof v.quitting === 'boolean'
  )
}

function isOrder(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.model === 'string' &&
    isNumber(v.cost) &&
    (v.financing === 'cash' || v.financing === 'floor') &&
    isObject(v.slot) &&
    isSlot(v.slot.location, v.slot.index) &&
    isNumber(v.day)
  )
}

function isCampaign(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    CHANNEL_IDS.includes(v.channel as Campaign['channel']) &&
    isNumber(v.startDay) &&
    isNumber(v.endDay)
  )
}

function isImprovement(v: unknown): boolean {
  return isObject(v) && IMPROVEMENT_IDS.includes(v.id as OwnedImprovement['id']) && isNumber(v.day)
}

function isExpansion(v: unknown): boolean {
  return isObject(v) && isExpansionId(v.id) && isNumber(v.day)
}

function isSlot(location: unknown, index: unknown): boolean {
  const count =
    location === 'showroom' ? PLATFORMS.length : location === 'lot' ? PARKING_SPACES.length : 0
  return Number.isInteger(index) && (index as number) >= 0 && (index as number) < count
}
