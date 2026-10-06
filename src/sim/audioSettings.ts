/**
 * Sound settings: a master volume, one per bus, and mute. Kept per device in
 * localStorage, apart from the save game.
 */

/** The mixer's buses. Every sound plays on one of music, sfx or voice; master scales them all. */
export type AudioBus = 'master' | 'music' | 'sfx' | 'voice'

export const AUDIO_BUSES: readonly AudioBus[] = ['master', 'music', 'sfx', 'voice']

/** Each volume runs 0–1. */
export type AudioSettings = Record<AudioBus, number> & { muted: boolean }

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  voice: 0.7,
  muted: false,
}

/** Sound effects and voices drop to this share while the game is paused (title screen, guide). */
export const PAUSE_DUCK = 0.3

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** Settings from storage, with anything missing or malformed set to its default. */
export function parseAudioSettings(raw: unknown): AudioSettings {
  const settings = { ...DEFAULT_AUDIO_SETTINGS }
  if (typeof raw !== 'object' || raw === null) return settings
  const r = raw as Record<string, unknown>
  for (const bus of AUDIO_BUSES) {
    const v = r[bus]
    if (typeof v === 'number' && Number.isFinite(v)) settings[bus] = clampVolume(v)
  }
  if (typeof r.muted === 'boolean') settings.muted = r.muted
  return settings
}

/**
 * Sets one bus's volume. Turning a volume up also unmutes, so a player who
 * reaches for a slider hears the change.
 */
export function withVolume(settings: AudioSettings, bus: AudioBus, v: number): AudioSettings {
  const volume = clampVolume(v)
  return { ...settings, [bus]: volume, muted: settings.muted && volume === 0 }
}

/**
 * How loud a bus plays overall, 0–1: its own volume times master, nothing
 * when muted. Sound effects and voices are ducked while `paused`; music is
 * left to its own muffling. `master` alone gives the master volume.
 */
export function effectiveGain(settings: AudioSettings, bus: AudioBus, paused = false): number {
  if (settings.muted) return 0
  if (bus === 'master') return settings.master
  const duck = paused && bus !== 'music' ? PAUSE_DUCK : 1
  return settings.master * settings[bus] * duck
}
