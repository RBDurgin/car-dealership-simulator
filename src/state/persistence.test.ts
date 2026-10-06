import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUDIO_SETTINGS } from '../sim/audioSettings'
import { startAudioPref, startControlsPref } from './persistence'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** A Map-backed stand-in for localStorage; Vitest runs in node, which has none. */
function fakeStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  }
}

describe('controls hint preference', () => {
  let stop: () => void = () => {}
  beforeEach(() => useGame.setState(initial, true))
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
  })

  it('starts from the fallback on a first visit', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startControlsPref(false)
    expect(game().controlsOpen).toBe(false)
  })

  it('remembers a toggle for next time', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startControlsPref(true)
    game().toggleControls()
    stop()

    useGame.setState(initial, true)
    stop = startControlsPref(true)
    expect(game().controlsOpen).toBe(false)
  })

  it('falls back when storage is missing', () => {
    stop = startControlsPref(true)
    expect(game().controlsOpen).toBe(true)
    game().toggleControls()
    expect(game().controlsOpen).toBe(false)
  })
})

describe('sound settings', () => {
  let stop: () => void = () => {}
  beforeEach(() => useGame.setState(initial, true))
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
  })

  it('starts from the defaults on a first visit', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startAudioPref()
    expect(game().audio).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('remembers volumes and mute for next time', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startAudioPref()
    game().setVolume('music', 0.25)
    game().toggleMute()
    stop()

    useGame.setState(initial, true)
    stop = startAudioPref()
    expect(game().audio).toMatchObject({ music: 0.25, muted: true })
  })

  it('ignores junk in storage', () => {
    const storage = fakeStorage()
    storage.setItem('car-dealership-simulator.audio', '{not json')
    vi.stubGlobal('localStorage', storage)
    stop = startAudioPref()
    expect(game().audio).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('still works without storage', () => {
    stop = startAudioPref()
    game().toggleMute()
    expect(game().audio.muted).toBe(true)
  })

  it('is not part of the save', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startAudioPref()
    game().toggleMute()
    expect(localStorage.getItem('car-dealership-simulator.save')).toBeNull()
  })
})
