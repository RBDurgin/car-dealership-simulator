import { rainPlays } from '../sim/musicPlan'
import { useGame } from '../state/store'
import { audioContext, busNode } from './engine'

/** Seconds of noise in the loop; long enough that its repeat isn't heard. */
const LOOP_SECONDS = 4
/** How loud the rain sits under the music, before the music bus's own level. */
const RAIN_LEVEL = 0.35
/** Seconds the rain takes to fade in or out. */
const FADE_SECONDS = 2

let rain: { source: AudioBufferSourceNode; fade: GainNode } | null = null
let on = false

/**
 * Steady rain: a hiss of noise with drops pattering through it, made here
 * rather than recorded. Loops seamlessly because noise has no seam to hear.
 */
function rainBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(2, Math.floor(LOOP_SECONDS * rate), rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let drop = 0
    for (let i = 0; i < data.length; i++) {
      // A sparse patter of louder drops, each a short decaying tick.
      if (Math.random() < 0.0009) drop = 0.6 + Math.random() * 0.6
      drop *= 0.992
      data[i] = (Math.random() * 2 - 1) * (0.35 + drop)
    }
  }
  return buffer
}

function start(ctx: AudioContext): NonNullable<typeof rain> {
  const source = ctx.createBufferSource()
  source.buffer = rainBuffer(ctx)
  source.loop = true
  // Rain is mostly mid and high hiss, without the harshest top.
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 400
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 5_000
  const fade = ctx.createGain()
  fade.gain.value = 0
  source.connect(high).connect(low).connect(fade).connect(busNode('music')!)
  source.start()
  return { source, fade }
}

/** Fades the rain in or out to match the store. Silent before audio is unlocked. */
export function syncRain(): void {
  const ctx = audioContext()
  if (!ctx || !busNode('music')) return
  const want = rainPlays(useGame.getState())
  if (want === on) return
  on = want
  rain ??= start(ctx)
  const now = ctx.currentTime
  rain.fade.gain.cancelScheduledValues(now)
  rain.fade.gain.setValueAtTime(rain.fade.gain.value, now)
  rain.fade.gain.linearRampToValueAtTime(want ? RAIN_LEVEL : 0, now + FADE_SECONDS)
}

/**
 * Plays the rain loop on the music bus on rainy days (`rainPlays`), following
 * the store's weather and screen. Call `syncRain` once audio is unlocked to start it.
 */
export function startRain(): () => void {
  return useGame.subscribe((s, prev) => {
    if (s.weather !== prev.weather || s.screen !== prev.screen) syncRain()
  })
}
