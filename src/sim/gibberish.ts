import { createRng, hashSeed, type Rng } from './rng'

/**
 * Sims-style gibberish: who sounds like what, and what one line of nonsense is
 * made of. Pure numbers; `audio/voice.ts` turns them into sound.
 */

/** How a line is said. Each has its own pitch contour, pace and level. */
export type Tone = 'neutral' | 'question' | 'happy' | 'grumble' | 'greeting' | 'murmur'

export interface Voice {
  /** Base pitch in Hz. */
  pitch: number
  /** Speech rate: 1 is average, higher talks faster. */
  rate: number
  /** Scales every vowel's formants: smaller heads ring higher. */
  formant: number
  /** Buzzier or hollower. */
  wave: 'sawtooth' | 'square'
}

/** Base pitch ranges in Hz, before the seeded jitter picks a spot in them. */
export const PITCH_RANGE = {
  low: { min: 95, max: 140 },
  high: { min: 180, max: 250 },
}
export const RATE_RANGE = { min: 0.85, max: 1.2 }
const FORMANT_SHIFT = { low: { min: 0.94, max: 1.04 }, high: { min: 1.08, max: 1.2 } }

/**
 * The voice of character `id`, wearing model `variant`. Female models get the
 * higher range, everyone else the lower; the id picks where in it they sit,
 * so the same character always sounds the same.
 */
export function voiceOf(id: string, variant: string): Voice {
  const rng = createRng(hashSeed(`voice:${id}`))
  const range = variant.startsWith('female') ? 'high' : 'low'
  const between = ({ min, max }: { min: number; max: number }) => min + rng.next() * (max - min)
  return {
    pitch: between(PITCH_RANGE[range]),
    rate: between(RATE_RANGE),
    formant: between(FORMANT_SHIFT[range]),
    wave: rng.next() < 0.5 ? 'sawtooth' : 'square',
  }
}

/** A short burst of filtered noise in front of a vowel. */
export interface Consonant {
  /** Centre of the noise band in Hz: low for "b"/"g", high for "s"/"t". */
  freq: number
  ms: number
}

export interface Syllable {
  consonant: Consonant | null
  /** First and second formant of the vowel, Hz. */
  formants: [number, number]
  /** Length of the vowel. */
  ms: number
  /** Pitch at the start and end of the vowel, Hz. */
  pitch: number
  pitchEnd: number
  /** Loudness, 0–1. */
  gain: number
}

/** Average vowels (an adult's F1/F2): ah, eh, ee, oh, oo, uh. */
const VOWELS: readonly [number, number][] = [
  [730, 1090],
  [530, 1840],
  [290, 2250],
  [570, 840],
  [320, 900],
  [520, 1400],
]

const CONSONANTS: readonly Consonant[] = [
  { freq: 600, ms: 25 }, // b, g
  { freq: 1800, ms: 20 }, // p, k
  { freq: 3200, ms: 22 }, // t, d
  { freq: 5200, ms: 70 }, // s
  { freq: 3800, ms: 60 }, // sh
  { freq: 1200, ms: 40 }, // h, f
]
/** Share of syllables that open on a consonant. */
const CONSONANT_CHANCE = 0.7

/** Base vowel length in ms, before the voice's rate and the tone's pace. */
export const SYLLABLE_MS = { min: 90, max: 160 }

interface ToneShape {
  /** Pitch multiplier at a point `t` (0–1) through the line; `i` is the syllable. */
  contour: (t: number, i: number) => number
  /** Random pitch wobble per syllable, as a share. */
  wobble: number
  /** Vowel length multiplier. */
  pace: number
  gain: number
}

const TONES: Record<Tone, ToneShape> = {
  // A gentle fall across the line, like a statement.
  neutral: { contour: (t) => 1.05 - 0.13 * t, wobble: 0.05, pace: 1, gain: 0.8 },
  // Level, then up on the last syllable or two.
  question: {
    contour: (t) => (t < 0.6 ? 1 - 0.05 * t : 1 + 0.9 * (t - 0.6)),
    wobble: 0.03,
    pace: 1,
    gain: 0.8,
  },
  // Up high and bouncing between syllables.
  happy: { contour: (_, i) => 1.18 + (i % 2 ? 0.1 : -0.04), wobble: 0.06, pace: 0.85, gain: 0.9 },
  // Low, falling and drawn out.
  grumble: { contour: (t) => 0.82 - 0.14 * t, wobble: 0.03, pace: 1.25, gain: 0.75 },
  // Up on the first syllable, down to rest: "hel-lo!".
  greeting: { contour: (t) => 1.25 - 0.3 * t, wobble: 0.03, pace: 0.95, gain: 0.9 },
  // Quiet, quick and nearly flat: paperwork small talk.
  murmur: { contour: () => 0.95, wobble: 0.02, pace: 0.8, gain: 0.45 },
}

/**
 * One line of gibberish in `voice` and `tone`, `count` syllables long (at
 * least one). The rng picks the sounds, so a seeded rng repeats the line.
 */
export function utterance(rng: Rng, voice: Voice, tone: Tone, count: number): Syllable[] {
  const shape = TONES[tone]
  const n = Math.max(1, Math.round(count))
  const out: Syllable[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1)
    const tNext = n === 1 ? 1 : Math.min(1, (i + 0.8) / (n - 1))
    const wobble = 1 + (rng.next() * 2 - 1) * shape.wobble
    const [f1, f2] = rng.pick(VOWELS)
    const consonant = rng.next() < CONSONANT_CHANCE ? rng.pick(CONSONANTS) : null
    const base = SYLLABLE_MS.min + rng.next() * (SYLLABLE_MS.max - SYLLABLE_MS.min)
    // The last syllable is held a little, like the end of a phrase.
    const hold = i === n - 1 ? 1.3 : 1
    out.push({
      consonant,
      formants: [f1 * voice.formant, f2 * voice.formant],
      ms: (base * shape.pace * hold) / voice.rate,
      pitch: voice.pitch * shape.contour(t, i) * wobble,
      pitchEnd: voice.pitch * shape.contour(tNext, i) * wobble,
      // Stressed and unstressed syllables alternate a little.
      gain: shape.gain * (i % 2 ? 0.85 : 1),
    })
  }
  return out
}

/** How long a line lasts, ms, consonants included. */
export function utteranceMs(syllables: readonly Syllable[]): number {
  return syllables.reduce((ms, s) => ms + s.ms + (s.consonant?.ms ?? 0), 0)
}
