import { effectiveGain, type AudioBus } from '../sim/audioSettings'
import { isPaused, useGame } from '../state/store'

/** A bus that sounds play on; master is folded into each one's gain. */
export type OutputBus = Exclude<AudioBus, 'master'>

const OUTPUT_BUSES: readonly OutputBus[] = ['music', 'sfx', 'voice']
/** Seconds a volume change takes to settle, so slider drags and ducking don't click. */
const GAIN_SMOOTHING = 0.05
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const

let ctx: AudioContext | null = null
const buses = new Map<OutputBus, GainNode>()

/** The running context, or null before the first gesture, while the tab is hidden, or without Web Audio. */
export function audioContext(): AudioContext | null {
  return ctx?.state === 'running' ? ctx : null
}

/** Where a sound on `bus` connects. Only valid alongside a context from `audioContext()`. */
export function busNode(bus: OutputBus): GainNode | null {
  return buses.get(bus) ?? null
}

function applyGains(): void {
  if (!ctx) return
  const s = useGame.getState()
  const paused = isPaused(s)
  for (const bus of OUTPUT_BUSES) {
    buses
      .get(bus)
      ?.gain.setTargetAtTime(effectiveGain(s.audio, bus, paused), ctx.currentTime, GAIN_SMOOTHING)
  }
}

function createContext(): AudioContext | null {
  try {
    const c = new AudioContext()
    for (const bus of OUTPUT_BUSES) {
      const g = c.createGain()
      g.connect(c.destination)
      buses.set(bus, g)
    }
    return c
  } catch {
    // No Web Audio: the game plays silently.
    return null
  }
}

/** Browsers that report user activation say whether this event can start audio; others are trusted. */
function hasActivation(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  return ua ? ua.isActive : true
}

/**
 * Starts the mixer. No AudioContext exists until the first tap, click or key
 * press (the title screen counts), which keeps browsers' autoplay rules happy,
 * iOS included. Then the buses follow the settings and the pause, and the
 * context sleeps while the tab is hidden. `onUnlock` runs once sound can play.
 */
export function startAudio(onUnlock?: () => void): () => void {
  let unlocking = true
  const unlock = () => {
    if (!hasActivation()) return
    ctx ??= createContext()
    if (!ctx) return removeUnlock()
    applyGains()
    const c = ctx
    void c.resume().then(() => {
      if (c.state !== 'running' || !unlocking) return
      removeUnlock()
      onUnlock?.()
    })
  }
  const removeUnlock = () => {
    unlocking = false
    for (const e of UNLOCK_EVENTS) window.removeEventListener(e, unlock, true)
  }
  for (const e of UNLOCK_EVENTS) window.addEventListener(e, unlock, true)

  const onVisibility = () => {
    if (!ctx || unlocking) return
    void (document.hidden ? ctx.suspend() : ctx.resume())
  }
  document.addEventListener('visibilitychange', onVisibility)

  const unsubscribe = useGame.subscribe((s, prev) => {
    if (s.audio !== prev.audio || isPaused(s) !== isPaused(prev)) applyGains()
  })

  return () => {
    removeUnlock()
    document.removeEventListener('visibilitychange', onVisibility)
    unsubscribe()
  }
}
