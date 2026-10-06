import type { Syllable, Voice } from '../sim/gibberish'
import { audioContext, busNode } from './engine'

/**
 * The gibberish synth. A buzzy oscillator through two bandpass "formant"
 * filters makes the vowels; short bursts of filtered noise make the
 * consonants. A whole line is scheduled on the audio clock at once, so
 * nothing runs per frame.
 */

/** Q of the formant filters: high enough to sound vowel-ish, low enough not to whistle. */
const FORMANT_Q = [7, 9] as const
/** The second formant sits quieter than the first, as in speech. */
const FORMANT_LEVEL = [1, 0.55] as const
/** Square waves come out louder than sawtooth through the same filters. */
const WAVE_LEVEL: Record<Voice['wave'], number> = { sawtooth: 1, square: 0.65 }
/** Overall level of a line before distance and the voice bus. */
const LINE_LEVEL = 1.6
/** Consonant level next to the vowels. */
const CONSONANT_LEVEL = 0.35
/** Softens the buzz above this, Hz. */
const LOWPASS_HZ = 3800
/** Seconds of a vowel's fade in. */
const ATTACK = 0.02

let noise: AudioBuffer | null = null

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise?.sampleRate === ctx.sampleRate) return noise
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noise = buffer
  return buffer
}

/** When each line still sounding ends, on the audio clock. */
const endings: number[] = []

/** How many lines are sounding now. */
export function activeVoices(): number {
  const ctx = audioContext()
  if (!ctx) return 0
  const now = ctx.currentTime
  for (let i = endings.length - 1; i >= 0; i--) if (endings[i] <= now) endings.splice(i, 1)
  return endings.length
}

/**
 * Says `syllables` in `voice`, at `gain` (0–1) and stereo `pan`. Silent
 * before the first gesture. Returns whether it played.
 */
export function speak(
  voice: Voice,
  syllables: readonly Syllable[],
  gain: number,
  pan: number,
): boolean {
  const ctx = audioContext()
  const bus = busNode('voice')
  if (!ctx || !bus || syllables.length === 0 || gain <= 0) return false

  const out = ctx.createGain()
  out.gain.value = gain * LINE_LEVEL * WAVE_LEVEL[voice.wave]
  const panner = ctx.createStereoPanner()
  panner.pan.value = pan
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = LOWPASS_HZ
  out.connect(lowpass).connect(panner).connect(bus)

  const osc = ctx.createOscillator()
  osc.type = voice.wave
  const env = ctx.createGain()
  env.gain.value = 0
  const formants = FORMANT_Q.map((q, i) => {
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = q
    const level = ctx.createGain()
    level.gain.value = FORMANT_LEVEL[i]
    osc.connect(f).connect(level).connect(env)
    return f
  })
  env.connect(out)

  const consonants = ctx.createGain()
  consonants.gain.value = CONSONANT_LEVEL
  consonants.connect(out)

  const start = ctx.currentTime + 0.02
  let t = start
  for (const s of syllables) {
    if (s.consonant) {
      const dur = s.consonant.ms / 1000
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(ctx)
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = s.consonant.freq
      band.Q.value = 1.5
      const burst = ctx.createGain()
      burst.gain.setValueAtTime(0, t)
      burst.gain.linearRampToValueAtTime(s.gain, t + Math.min(0.008, dur / 3))
      burst.gain.linearRampToValueAtTime(0, t + dur)
      src.connect(band).connect(burst).connect(consonants)
      // A random spot in the noise, so repeated consonants don't sound identical.
      src.start(t, Math.random() * 0.8, dur)
      t += dur
    }
    const dur = s.ms / 1000
    osc.frequency.setValueAtTime(s.pitch, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.pitchEnd), t + dur)
    formants.forEach((f, i) => f.frequency.setValueAtTime(s.formants[i], t))
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(s.gain, t + ATTACK)
    env.gain.linearRampToValueAtTime(s.gain * 0.75, t + dur * 0.7)
    env.gain.linearRampToValueAtTime(0, t + dur)
    t += dur
  }

  osc.start(start)
  osc.stop(t + 0.05)
  osc.onended = () => out.disconnect()
  endings.push(t)
  return true
}
