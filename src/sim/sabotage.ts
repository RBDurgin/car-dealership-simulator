import type { JaguarStats } from './jaguar'

/**
 * What's kept of the saboteur's doings from day to day (saved): the last
 * night he tried to steal a car, so the gap after a try holds across days,
 * and lifetime tallies of his visits and the harm he did, added to in
 * `settleDay` from the day's `JaguarStats`.
 */
export interface SabotageRecord {
  /** The last night he tried to steal a car (0 if never). */
  lastTheftDay: number
  /** Days he came onto the lot. */
  visits: number
  /** Visits the player ran him off. */
  runOffByYou: number
  /** Visits a guard ran him off. */
  runOffByGuard: number
  /** Cars he smudged. */
  smudged: number
  /** Cars he stole overnight. */
  stolen: number
  /** Staff he talked into quitting, who quit. */
  poached: number
  /** Staff he talked to whom the player kept with a raise. */
  kept: number
}

export function emptySabotage(): SabotageRecord {
  return {
    lastTheftDay: 0,
    visits: 0,
    runOffByYou: 0,
    runOffByGuard: 0,
    smudged: 0,
    stolen: 0,
    poached: 0,
    kept: 0,
  }
}

/** `record` with the day's `stats` added to its tallies. */
export function addSabotageDay(record: SabotageRecord, stats: JaguarStats): SabotageRecord {
  return {
    ...record,
    visits: record.visits + (stats.visited ? 1 : 0),
    runOffByYou: record.runOffByYou + (stats.runOff === 'player' ? 1 : 0),
    runOffByGuard: record.runOffByGuard + (stats.runOff === 'guard' ? 1 : 0),
    smudged: record.smudged + stats.smudged,
    stolen: record.stolen + stats.stolen.length,
    poached: record.poached + stats.quit.length,
    kept: record.kept + stats.kept.length,
  }
}

const KEYS = Object.keys(emptySabotage()) as (keyof SabotageRecord)[]

/** Whether `v` is a well-formed `SabotageRecord` (for the save). */
export function isSabotageRecord(v: unknown): v is SabotageRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return KEYS.every((k) => {
    const n = r[k]
    return typeof n === 'number' && Number.isFinite(n) && n >= 0
  })
}
