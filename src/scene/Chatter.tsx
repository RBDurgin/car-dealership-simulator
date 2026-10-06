import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { activeVoices, speak } from '../audio/voice'
import { effectiveGain } from '../sim/audioSettings'
import {
  conversationsOf,
  firstGapMs,
  MAX_VOICES,
  nextLine,
  REACTION_GAP_MS,
  reactionsFor,
  variantOf,
  voiceMix,
  type ChatterState,
  type Conversation,
  type Line,
} from '../sim/chatter'
import { PLAYER_ID } from '../sim/customers'
import { utterance, utteranceMs, voiceOf, type Syllable, type Voice } from '../sim/gibberish'
import type { Vec2 } from '../sim/grid'
import { OWNER_ID } from '../sim/owner'
import { createRng } from '../sim/rng'
import { isPaused, useGame } from '../state/store'
import { ambientPos, cameraState, customerPos, playerPos, staffPos } from './runtime'
import { frameSeconds } from './walker'

/** A line to say at `at` (chatter clock seconds), already worked out. */
interface Queued {
  speaker: string
  syllables: Syllable[]
  at: number
}

/** A queued line still unsaid this long after its time is dropped (its speaker went quiet). */
const STALE_S = 3

const rng = createRng(0x9a77e5)
/** Seconds of unpaused play: conversations wait while the game is paused. */
let now = 0
const talks = new Map<string, { conv: Conversation; turn: number; nextAt: number }>()
/** When each speaker finishes their current line. */
const busyUntil = new Map<string, number>()
let queue: Queued[] = []
const voices = new Map<string, Voice>()
let convCache: { customers: unknown; nazma: unknown; list: Conversation[] } | null = null

function voiceFor(s: ChatterState, speaker: string): Voice | null {
  let v = voices.get(speaker)
  if (v) return v
  const variant = variantOf(s, speaker)
  if (!variant) return null
  v = voiceOf(speaker, variant)
  voices.set(speaker, v)
  return v
}

function positionOf(speaker: string): Vec2 | undefined {
  if (speaker === PLAYER_ID) return playerPos
  return customerPos.get(speaker) ?? staffPos.get(speaker) ?? ambientPos.get(speaker)
}

/** Queues a reaction's lines one after the other, and holds its speakers' conversations till it's done. */
function enqueue(s: ChatterState, lines: Line[]): void {
  let at = now
  for (const line of lines) {
    const voice = voiceFor(s, line.speaker)
    if (!voice) continue
    const syllables = utterance(rng, voice, line.tone, line.syllables)
    queue.push({ speaker: line.speaker, syllables, at })
    at += (utteranceMs(syllables) + REACTION_GAP_MS) / 1000
    busyUntil.set(line.speaker, Math.max(busyUntil.get(line.speaker) ?? 0, at))
  }
  for (const t of talks.values()) {
    if (lines.some((l) => t.conv.speakers.includes(l.speaker))) t.nextAt = Math.max(t.nextAt, at)
  }
}

/** Keeps `talks` in step with the conversations the store implies, starting new ones' timers. */
function syncTalks(s: ChatterState): void {
  if (convCache?.customers !== s.customers || convCache.nazma !== s.nazma) {
    convCache = { customers: s.customers, nazma: s.nazma, list: conversationsOf(s) }
    const keys = new Set(convCache.list.map((c) => c.key))
    for (const key of talks.keys()) if (!keys.has(key)) talks.delete(key)
    for (const conv of convCache.list) {
      if (!talks.has(conv.key)) {
        talks.set(conv.key, { conv, turn: 0, nextAt: now + firstGapMs(conv.kind, rng) / 1000 })
      }
    }
  }
}

/**
 * Gibberish voices (`sim/chatter`, `audio/voice`): salespeople pitching,
 * customers answering, murmurs at the desk, couples chatting, greetings and
 * grumbles. Timers live here, in module state; each line plays from where its
 * speaker stands, nearest first, at most `MAX_VOICES` at once, and nothing out
 * of earshot. Renders nothing.
 */
export function Chatter() {
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.screen !== 'playing') return
        for (const lines of reactionsFor(prev, s, rng)) enqueue(s, lines)
      }),
    [],
  )

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    if (game.screen !== 'playing' || isPaused(game)) return
    now += frameSeconds(rawDelta, 1).realSeconds
    syncTalks(game)

    const due: Queued[] = []
    for (const t of talks.values()) {
      if (t.nextAt > now) continue
      const [a, b] = t.conv.speakers
      if ((busyUntil.get(a) ?? 0) > now || (busyUntil.get(b) ?? 0) > now) continue
      const { line, gapMs } = nextLine(t.conv, t.turn++, rng)
      const voice = voiceFor(game, line.speaker)
      if (!voice) continue
      const syllables = utterance(rng, voice, line.tone, line.syllables)
      const end = now + utteranceMs(syllables) / 1000
      busyUntil.set(line.speaker, end)
      t.nextAt = end + gapMs / 1000
      due.push({ speaker: line.speaker, syllables, at: now })
    }
    if (queue.length > 0) {
      queue = queue.filter((q) => {
        if (q.at > now) return true
        if (now - q.at < STALE_S) due.push(q)
        return false
      })
    }
    if (due.length === 0) return

    // Unheard lines still take their turn, so conversations keep their rhythm.
    if (effectiveGain(game.audio, 'voice') === 0) return
    const heard = due
      .map((q) => {
        const at = positionOf(q.speaker)
        const mix = at && voiceMix(playerPos, cameraState.yaw, at)
        return mix ? { q, mix } : null
      })
      .filter((x) => x !== null)
      .sort((x, y) => x.mix.dist - y.mix.dist)
    let free = MAX_VOICES - activeVoices()
    for (const { q, mix } of heard) {
      if (free <= 0) break
      const voice = voices.get(q.speaker)
      if (voice && speak(voice, q.syllables, mix.gain, mix.pan)) free--
    }
  })

  // The owner leaves with the day; forget voices of anyone no longer around.
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.clock.day === prev.clock.day) return
        for (const id of voices.keys()) if (id !== PLAYER_ID && id !== OWNER_ID) voices.delete(id)
        busyUntil.clear()
        queue = []
      }),
    [],
  )
  return null
}
