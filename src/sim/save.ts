import { ARCHETYPES } from './archetypes'
import { calendarOf } from './calendar'
import { CUSTOMER_VARIANTS } from './characters'
import {
  defaultPerks,
  emptyMonthCsi,
  SERVICE_INTERVAL,
  LOYALTY_DISCOUNTS,
  REFERRAL_FEES,
  type Appreciation,
  type Client,
  type ClientPerks,
  type MonthCsi,
} from './clients'
import type { GameTime } from './clock'
import { isDifficulty, TUNING, type Difficulty } from './difficulty'
import { isExpansionId, type OwnedExpansion } from './expansions'
import { IMPROVEMENT_IDS, type OwnedImprovement } from './improvements'
import { isFranchiseTier, START_TIER, type FranchiseTier } from './franchise'
import { CAR_MODELS } from './customers'
import { BASE_MSRP, COST_FRACTION, type InventoryCar } from './inventory'
import { PARKING_SPACES, PLATFORMS, type CarModel } from './layout'
import { CHANNEL_IDS, unfinished, type Campaign } from './marketing'
import { lastTheftNight } from './nazma'
import { BASE_SLOTS, type Order } from './ordering'
import { emptyCareer, isRankId, type Career } from './progression'
import { emptyMonthSales, monthlyQuota, type MonthSales } from './quota'
import { MAX_REPUTATION, START_REPUTATION } from './reputation'
import { emptyRival, isRival, type Rival } from './rival'
import { defaultService, isRateLevel, type ServiceSettings } from './service'
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
export const SAVE_VERSION = 25

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
  /** The service department's settings (see `sim/service.ts`). */
  service: ServiceSettings
  /** The client book (see `sim/clients.ts`). */
  clients: Client[]
  /** The loyalty levers set in the Clients tab. */
  clientPerks: ClientPerks
  /** A client appreciation day booked, or null. */
  appreciation: Appreciation | null
  /** The month's new-car buyers' visit scores so far, for the CSI. */
  monthCsi: MonthCsi
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
  service: ServiceSettings
  clients: Client[]
  clientPerks: ClientPerks
  appreciation: Appreciation | null
  monthCsi: MonthCsi
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
    // The shop hands every car back at closing; this is in case one wasn't.
    inventory: s.inventory.map((c) => (c.status === 'recon' ? { ...c, status: 'available' } : c)),
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
    service: s.service,
    clients: s.clients,
    clientPerks: s.clientPerks,
    appreciation: s.appreciation,
    monthCsi: s.monthCsi,
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
  // v22: the service department at its defaults, and cars sold by model, the
  // career's sales spread evenly over the models so recalls have buyers to call.
  21: (raw) => ({
    ...raw,
    service: defaultService(),
    career: isObject(raw.career)
      ? {
          ...raw.career,
          soldByModel: spreadSales(isNumber(raw.career.sales) ? raw.career.sales : 0),
        }
      : raw.career,
  }),
  // v23: the client book. No sale history was saved, so it starts empty.
  22: (raw) => ({
    ...raw,
    clients: [],
    clientPerks: defaultPerks(),
    appreciation: null,
    monthCsi: emptyMonthCsi(),
  }),
  // v24: friends sent and thank-you calls, per purchase. Nobody has sent any yet.
  23: (raw) => ({
    ...raw,
    clients: Array.isArray(raw.clients)
      ? raw.clients.map((c) => (isObject(c) ? { ...c, friendsSent: 0, thanked: false } : c))
      : raw.clients,
  }),
  // v25: the best month's CSI (none yet), and clients with a car from us due
  // for service a service interval after they bought it.
  24: (raw) => ({
    ...raw,
    career: isObject(raw.career) ? { ...raw.career, bestCsi: null } : raw.career,
    clients: Array.isArray(raw.clients)
      ? raw.clients.map((c) =>
          isObject(c) && c.status === 'client' && isObject(c.car) && isNumber(c.car.boughtDay)
            ? { ...c, serviceDue: c.car.boughtDay + SERVICE_INTERVAL }
            : c,
        )
      : raw.clients,
  }),
}

/** `sales` cars spread evenly over the models, the remainder to the first ones. */
function spreadSales(sales: number): Partial<Record<CarModel, number>> {
  const each = Math.floor(sales / CAR_MODELS.length)
  const extra = sales % CAR_MODELS.length
  const spread: Partial<Record<CarModel, number>> = {}
  CAR_MODELS.forEach((model, i) => {
    const count = each + (i < extra ? 1 : 0)
    if (count > 0) spread[model] = count
  })
  return spread
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
  const { expansions, won, rival, service, clients, clientPerks, appreciation, monthCsi } = raw
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
  if (!isObject(service) || !isRateLevel(service.rate) || typeof service.autoRecon !== 'boolean')
    return null
  if (!Array.isArray(clients)) return null
  clients.forEach(mendBudget)
  if (!clients.every(isClient)) return null
  if (!isPerks(clientPerks)) return null
  if (appreciation !== null && !isAppreciation(appreciation)) return null
  if (!isObject(monthCsi) || !isNumber(monthCsi.total) || !isNumber(monthCsi.count)) return null
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
    (v.status === 'available' || v.status === 'sold' || v.status === 'recon') &&
    (v.used === null || isUsedInfo(v.used))
  )
}

const CLIENT_STATUSES: readonly unknown[] = ['prospect', 'client', 'lapsed', 'defected']
const isModel = (v: unknown) => (CAR_MODELS as readonly unknown[]).includes(v)
const isVariant = (v: unknown) => (CUSTOMER_VARIANTS as readonly unknown[]).includes(v)
const isDayOrNull = (v: unknown) => v === null || isNumber(v)

function isClient(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    isVariant(v.variant) &&
    (v.companion === null || isVariant(v.companion)) &&
    typeof v.archetype === 'string' &&
    v.archetype in ARCHETYPES &&
    CLIENT_STATUSES.includes(v.status) &&
    isNumber(v.since) &&
    isNumber(v.lastVisit) &&
    isNumber(v.visits) &&
    isNumber(v.bought) &&
    (v.car === null || isClientCar(v.car)) &&
    isNumber(v.budget) &&
    Array.isArray(v.preferredModels) &&
    v.preferredModels.every(isModel) &&
    (v.lastDeal === null ||
      (isObject(v.lastDeal) &&
        isModel(v.lastDeal.model) &&
        isDayOrNull(v.lastDeal.ask) &&
        isDayOrNull(v.lastDeal.counter))) &&
    isNumber(v.satisfaction) &&
    v.satisfaction >= 0 &&
    v.satisfaction <= 100 &&
    Array.isArray(v.reasons) &&
    v.reasons.every((r) => isObject(r) && typeof r.kind === 'string' && isNumber(r.points)) &&
    isDayOrNull(v.dueDay) &&
    isDayOrNull(v.expires) &&
    isDayOrNull(v.lastCall) &&
    isNumber(v.callsThisCycle) &&
    (v.appointment === null ||
      (isObject(v.appointment) &&
        isNumber(v.appointment.day) &&
        isNumber(v.appointment.minute) &&
        typeof v.appointment.reason === 'string')) &&
    (v.referredBy === null || typeof v.referredBy === 'string') &&
    isNumber(v.referrals) &&
    isNumber(v.friendsSent) &&
    typeof v.thanked === 'boolean' &&
    isDayOrNull(v.serviceDue)
  )
}

/**
 * A prospect back with two models in mind once came with a NaN budget, saved
 * as null. Give them the priciest of their models' base price instead.
 */
function mendBudget(v: unknown): void {
  if (!isObject(v) || isNumber(v.budget) || !Array.isArray(v.preferredModels)) return
  const prices = v.preferredModels.filter(isModel).map((m) => BASE_MSRP[m as CarModel])
  if (prices.length > 0) v.budget = Math.round(Math.max(...prices) / 500) * 500
}

function isClientCar(v: unknown): boolean {
  return (
    isObject(v) &&
    isModel(v.model) &&
    typeof v.used === 'boolean' &&
    isNumber(v.price) &&
    isNumber(v.boughtDay) &&
    isNumber(v.year) &&
    isNumber(v.miles) &&
    isNumber(v.condition)
  )
}

function isAppreciation(v: unknown): boolean {
  return isObject(v) && isNumber(v.day) && isNumber(v.month)
}

function isPerks(v: unknown): boolean {
  return (
    isObject(v) &&
    (LOYALTY_DISCOUNTS as readonly unknown[]).includes(v.loyaltyDiscount) &&
    (REFERRAL_FEES as readonly unknown[]).includes(v.referralFee) &&
    typeof v.receptionCalls === 'boolean'
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
    isNumber(v.rivalsBeaten) &&
    (v.bestCsi === null || isNumber(v.bestCsi)) &&
    isObject(v.soldByModel) &&
    Object.entries(v.soldByModel).every(
      ([model, n]) => (CAR_MODELS as readonly string[]).includes(model) && isNumber(n),
    )
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
