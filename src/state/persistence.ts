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
 * payroll is paid, then again for any hiring, firing, ordering or advertising from the day summary.
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
      s.orders !== prev.orders ||
      s.campaigns !== prev.campaigns ||
      s.roster !== prev.roster
    if (changed) writeSave(createSave(s, Date.now()))
  })
}

const CONTROLS_KEY = 'car-dealership-simulator.controlsOpen'

/**
 * Opens or collapses the controls hint as this device last left it (or as
 * `fallback` says on a first visit), then remembers each toggle. Kept apart
 * from the save slot: it's a per-device preference, not game progress.
 */
export function startControlsPref(fallback: boolean): () => void {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(CONTROLS_KEY)
  } catch {
    // No storage: use the fallback.
  }
  useGame.getState().toggleControls(saved === null ? fallback : saved === '1')
  return useGame.subscribe((s, prev) => {
    if (s.controlsOpen === prev.controlsOpen) return
    try {
      localStorage.setItem(CONTROLS_KEY, s.controlsOpen ? '1' : '0')
    } catch {
      // Not remembered; it still toggles.
    }
  })
}
