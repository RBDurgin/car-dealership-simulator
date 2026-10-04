import { isClosed } from '../sim/clock'
import { createSave, parseSave, type SaveData } from '../sim/save'
import { useGame } from './store'

const SAVE_KEY = 'car-dealership-simulator.save'

// Storage can be missing or throw (private windows, blocked site data, full
// quota, tests), so every access is guarded and a failure just means no save.

export function readSave(): SaveData | null {
  try {
    const json = localStorage.getItem(SAVE_KEY)
    return json ? parseSave(JSON.parse(json)) : null
  } catch {
    return null
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // Not saved; the game carries on.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/**
 * Saves whenever the day is over and something worth keeping changes: once when
 * payroll is paid, then again for any hiring or firing from the day summary.
 */
export function startAutosave(): () => void {
  return useGame.subscribe((s, prev) => {
    if (s.screen !== 'playing' || !isClosed(s.clock) || s.customers.length > 0) return
    if (!s.dayStats.settled) return
    const changed =
      !prev.dayStats.settled ||
      s.screen !== prev.screen ||
      s.cash !== prev.cash ||
      s.inventory !== prev.inventory ||
      s.roster !== prev.roster
    if (changed) writeSave(createSave(s, Date.now()))
  })
}
