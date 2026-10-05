import type { GameTime } from './clock'
import { COST_FRACTION, type InventoryCar } from './inventory'
import { DISPLAY_CARS, PARKING_SPACES } from './layout'
import { CHANNEL_IDS, unfinished, type Campaign } from './marketing'
import type { Order } from './ordering'
import type { Employee } from './staff'

/**
 * The saved game. Saves are only made at the end of a day, so nothing mid-day
 * (customers, positions, the running clock, rng streams) is kept: each day is
 * rebuilt from its number when it starts. Bump the version whenever a saved
 * type (`InventoryCar`, `Employee`) changes shape, and add an entry to
 * `UPGRADES` that brings the previous version up to date. Saves older than the
 * upgrade chain reaches are ignored. Orders placed during the day are kept and
 * delivered on the morning the save resumes, and ad campaigns that haven't
 * finished carry on.
 */
export const SAVE_VERSION = 5

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
}

export interface SaveSource {
  clock: GameTime
  cash: number
  inventory: InventoryCar[]
  roster: Employee[]
  orders: Order[]
  campaigns: Campaign[]
}

/** A save of the day that just ended. The fired are gone and everyone else is off for the night. */
export function createSave(s: SaveSource, now: number): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    day: s.clock.day,
    cash: s.cash,
    inventory: s.inventory,
    roster: s.roster.filter((e) => !e.fired).map((e) => ({ ...e, status: 'off' })),
    orders: s.orders,
    campaigns: unfinished(s.campaigns, s.clock.day + 1),
  }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

type RawSave = Record<string, unknown>

/** A v2 car's cost, before cars had one: the middle of the range a new game rolls. */
const LEGACY_COST_FRACTION = (COST_FRACTION.min + COST_FRACTION.max) / 2

/** Each step brings a save from its key version to the next. */
const UPGRADES: Record<number, (raw: RawSave) => RawSave> = {
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
}

/** `raw` brought up to `SAVE_VERSION`, or null if it's too old (or new) to upgrade. */
function upgrade(raw: RawSave): RawSave | null {
  let save = raw
  while (save.version !== SAVE_VERSION) {
    const version = save.version
    const step = isNumber(version) ? UPGRADES[version] : undefined
    if (!step) return null
    save = { ...step(save), version: (version as number) + 1 }
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
  const { savedAt, day, cash, inventory, roster, orders, campaigns } = raw
  if (!isNumber(savedAt) || !isNumber(day) || day < 1 || !isNumber(cash)) return null
  if (!Array.isArray(inventory) || !inventory.every(isCar)) return null
  if (!Array.isArray(roster) || !roster.every(isEmployee)) return null
  if (!Array.isArray(orders) || !orders.every(isOrder)) return null
  if (!Array.isArray(campaigns) || !campaigns.every(isCampaign)) return null
  return raw as unknown as SaveData
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
    (v.status === 'available' || v.status === 'sold')
  )
}

function isEmployee(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.role === 'string' &&
    isNumber(v.wage) &&
    isNumber(v.skill)
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

function isSlot(location: unknown, index: unknown): boolean {
  const count =
    location === 'showroom' ? DISPLAY_CARS.length : location === 'lot' ? PARKING_SPACES.length : 0
  return Number.isInteger(index) && (index as number) >= 0 && (index as number) < count
}
