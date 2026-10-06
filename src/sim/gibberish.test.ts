import { describe, expect, it } from 'vitest'
import { PITCH_RANGE, RATE_RANGE, utterance, utteranceMs, voiceOf, type Tone } from './gibberish'
import { createRng } from './rng'

const TONES: Tone[] = ['neutral', 'question', 'happy', 'grumble', 'greeting', 'murmur']

describe('voiceOf', () => {
  it('always gives a character the same voice', () => {
    expect(voiceOf('customer-7', 'male-a')).toEqual(voiceOf('customer-7', 'male-a'))
  })

  it('gives different characters different voices', () => {
    expect(voiceOf('customer-7', 'male-a')).not.toEqual(voiceOf('customer-8', 'male-a'))
  })

  it('pitches female models high and everyone else low', () => {
    for (let i = 0; i < 50; i++) {
      const high = voiceOf(`c${i}`, 'female-c')
      const low = voiceOf(`c${i}`, i % 2 ? 'male-b' : 'salesperson')
      expect(high.pitch).toBeGreaterThanOrEqual(PITCH_RANGE.high.min)
      expect(high.pitch).toBeLessThanOrEqual(PITCH_RANGE.high.max)
      expect(low.pitch).toBeGreaterThanOrEqual(PITCH_RANGE.low.min)
      expect(low.pitch).toBeLessThanOrEqual(PITCH_RANGE.low.max)
      expect(high.formant).toBeGreaterThan(low.formant)
      expect(low.rate).toBeGreaterThanOrEqual(RATE_RANGE.min)
      expect(low.rate).toBeLessThanOrEqual(RATE_RANGE.max)
    }
  })
})

describe('utterance', () => {
  const voice = voiceOf('e1', 'female-a')

  it('repeats with the same seed', () => {
    expect(utterance(createRng(5), voice, 'happy', 4)).toEqual(
      utterance(createRng(5), voice, 'happy', 4),
    )
  })

  it('has the syllables asked for, at least one', () => {
    expect(utterance(createRng(1), voice, 'neutral', 6)).toHaveLength(6)
    expect(utterance(createRng(1), voice, 'neutral', 0)).toHaveLength(1)
  })

  it('keeps every syllable in a speakable range', () => {
    const rng = createRng(9)
    for (const tone of TONES) {
      for (const s of utterance(rng, voice, tone, 8)) {
        expect(s.pitch).toBeGreaterThan(voice.pitch * 0.6)
        expect(s.pitch).toBeLessThan(voice.pitch * 1.5)
        expect(s.pitchEnd).toBeGreaterThan(20)
        expect(s.ms).toBeGreaterThan(40)
        expect(s.ms).toBeLessThan(400)
        expect(s.gain).toBeGreaterThan(0)
        expect(s.gain).toBeLessThanOrEqual(1)
        expect(s.formants[0]).toBeLessThan(s.formants[1])
      }
    }
  })

  const mean = (tone: Tone) => {
    const rng = createRng(3)
    let sum = 0
    for (let i = 0; i < 40; i++) {
      const line = utterance(rng, voice, tone, 5)
      sum += line.reduce((p, s) => p + s.pitch, 0) / line.length
    }
    return sum / 40
  }

  it('rises at the end of a question', () => {
    const line = utterance(createRng(2), voice, 'question', 5)
    expect(line[4].pitch).toBeGreaterThan(line[0].pitch * 1.15)
  })

  it('falls through a grumble, which sits lower than a happy line', () => {
    const line = utterance(createRng(2), voice, 'grumble', 5)
    expect(line[4].pitch).toBeLessThan(line[0].pitch)
    expect(mean('grumble')).toBeLessThan(mean('neutral'))
    expect(mean('happy')).toBeGreaterThan(mean('neutral'))
  })

  it('is quick and quiet in a murmur', () => {
    const rng = createRng(4)
    const murmur = utterance(rng, voice, 'murmur', 5)
    const grumble = utterance(rng, voice, 'grumble', 5)
    expect(Math.max(...murmur.map((s) => s.gain))).toBeLessThan(
      Math.min(...grumble.map((s) => s.gain)),
    )
  })

  it('sums the length of a line, consonants and all', () => {
    const line = utterance(createRng(6), voice, 'neutral', 3)
    const vowels = line.reduce((ms, s) => ms + s.ms, 0)
    expect(utteranceMs(line)).toBeGreaterThanOrEqual(vowels)
    expect(utteranceMs([])).toBe(0)
  })
})
