import type { GameTime } from './clock'
import type { InventoryCar } from './inventory'
import type { Employee } from './staff'

/**
 * The saved game. Saves are only made at the end of a day, so nothing mid-day
 * (customers, positions, the running clock, rng streams) is kept: each day is
 * rebuilt from its number when it starts. Bump the version whenever a saved
 * type (`InventoryCar`, `Employee`) changes shape; older saves are then ignored.
 */
export const SAVE_VERSION = 2

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

/** A save read back from storage, or null if it's missing, from another version or malformed. */
export function parseSave(raw: unknown): SaveData | null {
  if (!isObject(raw) || raw.version !== SAVE_VERSION) return null
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
