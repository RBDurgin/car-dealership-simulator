import { describe, expect, it } from 'vitest'
import {
  clampVolume,
  DEFAULT_AUDIO_SETTINGS,
  effectiveGain,
  PAUSE_DUCK,
  parseAudioSettings,
  withVolume,
} from './audioSettings'

describe('clampVolume', () => {
  it('keeps volumes within 0–1', () => {
    expect(clampVolume(0.4)).toBe(0.4)
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(3)).toBe(1)
    expect(clampVolume(Number.NaN)).toBe(0)
  })
})

describe('parseAudioSettings', () => {
  it('reads back what was stored', () => {
    const stored = { master: 0.5, music: 0, sfx: 1, voice: 0.25, muted: true }
    expect(parseAudioSettings(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
  })

  it('falls back to the defaults for junk', () => {
    for (const junk of [null, undefined, 42, 'loud', []]) {
      expect(parseAudioSettings(junk)).toEqual(DEFAULT_AUDIO_SETTINGS)
    }
  })

  it('keeps the good fields and defaults the rest', () => {
    const s = parseAudioSettings({ master: 2, music: 'max', sfx: null, voice: 0.1, muted: 'yes' })
    expect(s).toEqual({ ...DEFAULT_AUDIO_SETTINGS, master: 1, voice: 0.1 })
  })

  it('returns a copy, not the defaults themselves', () => {
    const s = parseAudioSettings(null)
    s.master = 0
    expect(DEFAULT_AUDIO_SETTINGS.master).toBeGreaterThan(0)
  })
})

describe('withVolume', () => {
  it('sets one bus, clamped', () => {
    const s = withVolume(DEFAULT_AUDIO_SETTINGS, 'music', 1.5)
    expect(s).toEqual({ ...DEFAULT_AUDIO_SETTINGS, music: 1 })
  })

  it('unmutes when a volume is turned up, not down to zero', () => {
    const muted = { ...DEFAULT_AUDIO_SETTINGS, muted: true }
    expect(withVolume(muted, 'sfx', 0.5).muted).toBe(false)
    expect(withVolume(muted, 'sfx', 0).muted).toBe(true)
  })
})

describe('effectiveGain', () => {
  const s = { master: 0.5, music: 0.4, sfx: 0.8, voice: 1, muted: false }

  it('scales each bus by master', () => {
    expect(effectiveGain(s, 'master')).toBe(0.5)
    expect(effectiveGain(s, 'music')).toBeCloseTo(0.2)
    expect(effectiveGain(s, 'sfx')).toBeCloseTo(0.4)
    expect(effectiveGain(s, 'voice')).toBeCloseTo(0.5)
  })

  it('is silent when muted', () => {
    for (const bus of ['master', 'music', 'sfx', 'voice'] as const) {
      expect(effectiveGain({ ...s, muted: true }, bus)).toBe(0)
    }
  })

  it('ducks sound effects and voices while paused, not music', () => {
    expect(effectiveGain(s, 'sfx', true)).toBeCloseTo(0.4 * PAUSE_DUCK)
    expect(effectiveGain(s, 'voice', true)).toBeCloseTo(0.5 * PAUSE_DUCK)
    expect(effectiveGain(s, 'music', true)).toBeCloseTo(0.2)
  })
})
