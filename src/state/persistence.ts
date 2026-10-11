import { parseAudioSettings } from '../sim/audioSettings'
import { isClosed } from '../sim/clock'
import { createSave, parseSave, type SaveData } from '../sim/save'
import { emptyCase, mergeCase, parseCase, type TrophyCase } from '../sim/trophyCase'
import { LATEST_NEWS } from '../sim/whatsNew'
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

/**
 * Saves whenever the day is over and something worth keeping changes: once when
 * payroll is paid, then again for any hiring, firing, ordering, advertising, improving, changing the service settings or the client book's levers from the day summary
 * (or a tip shown or an achievement earned after closing, or Keep playing on the win screen).
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
      s.improvements !== prev.improvements ||
      s.roster !== prev.roster ||
      s.tipsSeen !== prev.tipsSeen ||
      s.achievements !== prev.achievements ||
      s.service !== prev.service ||
      s.clients !== prev.clients ||
      s.clientPerks !== prev.clientPerks ||
      s.appreciation !== prev.appreciation ||
      s.won !== prev.won
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
  return useGame.subscribe((s, prev) => {
    if (s.audio === prev.audio) return
    try {
      localStorage.setItem(AUDIO_KEY, JSON.stringify(s.audio))
    } catch {
      // Not remembered; the change still applies.
    }
  })
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
  return useGame.subscribe((s, prev) => {
    if (s.achievements === prev.achievements && s.records === prev.records) return
    const before = readTrophyCase()
    const after = mergeCase(before, s.achievements, s.records, Date.now())
    if (after === before) return
    try {
      localStorage.setItem(TROPHY_KEY, JSON.stringify(after))
    } catch {
      // Not kept; the game carries on.
    }
  })
}
