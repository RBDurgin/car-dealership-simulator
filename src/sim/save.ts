import type { GameTime } from './clock'
import { COST_FRACTION, type InventoryCar } from './inventory'
import type { Employee } from './staff'

/**
 * The saved game. Saves are only made at the end of a day, so nothing mid-day
 * (customers, positions, the running clock, rng streams) is kept: each day is
 * rebuilt from its number when it starts. Bump the version whenever a saved
 * type (`InventoryCar`, `Employee`) changes shape, and add an entry to
 * `UPGRADES` that brings the previous version up to date. Saves older than the
 * upgrade chain reaches are ignored.
 */
export const SAVE_VERSION = 3

export interface SaveData {
  version: number
  /** Real time (ms since epoch) the save was written. */
  savedAt: number
  /** The day that just ended. Resuming starts the morning after. */
  day: number
  cash: number
  inventory: InventoryCar[]
  roster: Employee[]
}

export interface SaveSource {
  clock: GameTime
  cash: number
  inventory: InventoryCar[]
  roster: Employee[]
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
  const { savedAt, day, cash, inventory, roster } = raw
  if (!isNumber(savedAt) || !isNumber(day) || day < 1 || !isNumber(cash)) return null
  if (!Array.isArray(inventory) || !inventory.every(isCar)) return null
  if (!Array.isArray(roster) || !roster.every(isEmployee)) return null
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
