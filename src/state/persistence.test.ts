import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUDIO_SETTINGS } from '../sim/audioSettings'
import { CLOSE_MINUTE } from '../sim/clock'
import { createSave } from '../sim/save'
import {
  clearSave,
  readTrophyCase,
  resetTrophyCase,
  SAVE_FAILED_NOTICE,
  startAudioPref,
  startAutosave,
  startControlsPref,
  startGraphicsPref,
  startTrophyCase,
  writeSave,
} from './persistence'
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

describe('trophy case', () => {
  let stop: () => void = () => {}
  beforeEach(() => useGame.setState(initial, true))
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
  })

  it('keeps each achievement as it is earned, at the level it was earned on', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startTrophyCase()
    game().newGame('hard')
    game().earnAchievements(['first-sale'])
    expect(readTrophyCase().earned['first-sale']).toMatchObject({ level: 'hard' })
  })

  it('outlives a new game and a cleared save, until reset', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startTrophyCase()
    game().newGame('easy')
    game().earnAchievements(['first-sale'])
    clearSave()
    game().newGame('medium')
    expect(readTrophyCase().earned['first-sale']).toMatchObject({ level: 'easy' })
    resetTrophyCase()
    expect(readTrophyCase().earned).toEqual({})
  })

  it('takes in the achievements and records of a save that loads', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    game().newGame('medium')
    useGame.setState({
      achievements: [{ id: 'closer', day: 4, level: 'medium' }],
      records: { ...game().records, bestDay: { value: 9_000, day: 4 } },
    })
    const save = createSave(game(), Date.now())
    useGame.setState(initial, true)
    stop = startTrophyCase()
    game().loadGame(save)
    const c = readTrophyCase()
    expect(c.earned.closer).toMatchObject({ level: 'medium' })
    expect(c.best.day).toBe(9_000)
  })

  it('is just empty without storage', () => {
    stop = startTrophyCase()
    game().newGame('medium')
    game().earnAchievements(['first-sale'])
    expect(readTrophyCase().earned).toEqual({})
  })
})

describe('graphics preference', () => {
  let stop: () => void = () => {}
  beforeEach(() => useGame.setState(initial, true))
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
  })

  it('starts on Auto, and remembers a change for next time', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startGraphicsPref(false)
    expect(game().graphics).toBe('auto')
    game().setGraphics('low')
    stop()

    useGame.setState(initial, true)
    stop = startGraphicsPref(false)
    expect(game().graphics).toBe('low')
    expect(game().qualityTier).toBe(2)
  })

  it('starts Auto a step down on a small screen, and a new setting on its own tier', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startGraphicsPref(true)
    expect(game().qualityTier).toBe(1)
    game().setGraphics('high')
    expect(game().qualityTier).toBe(0)
    game().setGraphics('auto')
    expect(game().qualityTier).toBe(1)
  })

  it('ignores junk in storage, and works without storage', () => {
    const storage = fakeStorage()
    storage.setItem('car-dealership-simulator.graphics', 'ultra')
    vi.stubGlobal('localStorage', storage)
    stop = startGraphicsPref(false)
    expect(game().graphics).toBe('auto')
    stop()
    vi.unstubAllGlobals()
    stop = startGraphicsPref(false)
    game().setGraphics('high')
    expect(game().graphics).toBe('high')
  })
})

describe('end-of-day save', () => {
  let stop: () => void = () => {}
  beforeEach(() => useGame.setState(initial, true))
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
  })

  /** A full quota: every write is refused, as browsers do. */
  function fullStorage() {
    return {
      ...fakeStorage(),
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
    }
  }

  const settle = () =>
    useGame.setState((s) => ({
      screen: 'playing',
      clock: { ...s.clock, minute: CLOSE_MINUTE },
      customers: [],
      dayStats: { ...s.dayStats, settled: true },
    }))

  it('reports a refused write', () => {
    vi.stubGlobal('localStorage', fullStorage())
    expect(writeSave(createSave(game(), 0))).toBe(false)
    vi.stubGlobal('localStorage', fakeStorage())
    expect(writeSave(createSave(game(), 0))).toBe(true)
  })

  it('saves once the day is settled', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    stop = startAutosave()
    settle()
    expect(localStorage.getItem('car-dealership-simulator.save')).not.toBeNull()
    expect(game().notice).toBeNull()
  })

  it("tells the player when the browser won't take the save, and plays on", () => {
    vi.stubGlobal('localStorage', fullStorage())
    stop = startAutosave()
    settle()
    expect(game().notice?.text).toBe(SAVE_FAILED_NOTICE)
    expect(game().screen).toBe('playing')
  })
})
