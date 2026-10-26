import { parseAudioSettings } from '../sim/audioSettings'
import { isClosed } from '../sim/clock'
import { parseGraphics, startQuality } from '../sim/graphics'
import { createSave, parseSave, type SaveData } from '../sim/save'
import { emptyCase, mergeCase, parseCase, type TrophyCase } from '../sim/trophyCase'
import { LATEST_NEWS } from '../sim/whatsNew'
import { useGame } from './store'
import { sameFields, subscribeTo } from './subscribe'
import type { GameState } from './types'

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

/** Writes the save; false when the browser refused it (storage full or blocked). */
export function writeSave(save: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    return true
  } catch {
    // Not saved; the game carries on.
    return false
  }
}

/** Shown when the end-of-day save is refused, most likely for a full storage quota. */
export const SAVE_FAILED_NOTICE =
  "Couldn't save today: this browser's storage is full or blocked. The game carries on."

/**
 * Marks the save as having seen every update, keeping everything else, once
 * What's new is closed. Does nothing without a save.
 */
export function markNewsSeen(): void {
  const save = readSave()
  if (save && save.news !== LATEST_NEWS) writeSave({ ...save, news: LATEST_NEWS })
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** What the day summary can still change once the day is settled, each worth saving again. */
const SAVED_AFTER_CLOSING = [
  'cash',
  'inventory',
  'orders',
  'campaigns',
  'improvements',
  'roster',
  'tipsSeen',
  'achievements',
  'service',
  'clients',
  'clientPerks',
  'appreciation',
  'won',
  'auctionBids',
] as const

/** Whether the day is over and payroll paid, so the day can be saved. */
function settledDay(s: GameState): boolean {
  if (s.screen !== 'playing' || !isClosed(s.clock) || s.customers.length > 0) return false
  return s.dayStats.settled
}

/**
 * Saves whenever the day is over and something worth keeping changes: once when
 * payroll is paid, then again for any hiring, firing, ordering, advertising, improving, changing the service settings, the client book's levers or the auction's max bids from the day summary
 * (or a tip shown or an achievement earned after closing, or Keep playing on the win screen).
 * Does nothing else until the day is settled.
 */
export function startAutosave(): () => void {
  return subscribeTo(
    (s) => s,
    (s) => {
      if (settledDay(s) && !writeSave(createSave(s, Date.now()))) {
        useGame.getState().showNotice(SAVE_FAILED_NOTICE)
      }
    },
    (a, b) => {
      const settled = settledDay(a)
      if (settled !== settledDay(b)) return false
      return !settled || sameFields(a, b, SAVED_AFTER_CLOSING)
    },
  )
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
  return subscribeTo(
    (s) => s.controlsOpen,
    (open) => {
      try {
        localStorage.setItem(CONTROLS_KEY, open ? '1' : '0')
      } catch {
        // Not remembered; it still toggles.
      }
    },
  )
}

const AUDIO_KEY = 'car-dealership-simulator.audio'

/**
 * Loads this device's volumes and mute (defaults on a first visit), then
 * remembers each change. Like the controls hint, it's kept apart from the save slot.
 */
export function startAudioPref(): () => void {
  let saved: unknown = null
  try {
    const json = localStorage.getItem(AUDIO_KEY)
    saved = json ? JSON.parse(json) : null
  } catch {
    // No storage, or junk in it: use the defaults.
  }
  useGame.setState({ audio: parseAudioSettings(saved) })
  return subscribeTo(
    (s) => s.audio,
    (audio) => {
      try {
        localStorage.setItem(AUDIO_KEY, JSON.stringify(audio))
      } catch {
        // Not remembered; the change still applies.
      }
    },
  )
}

const GRAPHICS_KEY = 'car-dealership-simulator.graphics'

/**
 * Loads this device's Graphics setting (Auto on a first visit) and starts the
 * scene on its tier (a step down on Auto on a `compact` screen), then
 * remembers each change and starts the new setting's tier. Like the sound
 * settings, it's kept apart from the save slot.
 */
export function startGraphicsPref(compact: boolean): () => void {
  let saved: unknown = null
  try {
    saved = localStorage.getItem(GRAPHICS_KEY)
  } catch {
    // No storage: Auto.
  }
  const setting = parseGraphics(saved)
  useGame.setState({ graphics: setting, qualityTier: startQuality(setting, compact).tier })
  return subscribeTo(
    (s) => s.graphics,
    (graphics) => {
      useGame.getState().setQualityTier(startQuality(graphics, compact).tier)
      try {
        localStorage.setItem(GRAPHICS_KEY, graphics)
      } catch {
        // Not remembered; the change still applies.
      }
    },
  )
}

const TROPHY_KEY = 'dealership.trophies'

/** This device's trophy case, or an empty one when there's none (or no storage). */
export function readTrophyCase(): TrophyCase {
  try {
    const json = localStorage.getItem(TROPHY_KEY)
    return json ? parseCase(JSON.parse(json)) : emptyCase()
  } catch {
    return emptyCase()
  }
}

/** Empties the trophy case (the title screen's Reset trophies). The save is left alone. */
export function resetTrophyCase(): void {
  try {
    localStorage.removeItem(TROPHY_KEY)
  } catch {
    // Nothing to clear.
  }
}

/**
 * Keeps the device-wide trophy case: each achievement as it's earned (and
 * those a loaded save already holds) and each day's records as it's settled
 * are merged in and written back. Like the audio settings, it's kept apart
 * from the save slot, so a new game or a cleared save keeps it.
 */
export function startTrophyCase(): () => void {
  return subscribeTo(
    (s) => s,
    ({ achievements, records }) => {
      const before = readTrophyCase()
      const after = mergeCase(before, achievements, records, Date.now())
      if (after === before) return
      try {
        localStorage.setItem(TROPHY_KEY, JSON.stringify(after))
      } catch {
        // Not kept; the game carries on.
      }
    },
    (a, b) => sameFields(a, b, ['achievements', 'records']),
  )
}
