import { OWNER_VARIANT } from './characters'
import { PLAYER_ID, type Customer, type CustomerPhase } from './customers'
import type { Tone } from './gibberish'
import type { Vec2 } from './grid'
import { NAZMA_ID, NAZMA_VARIANT, nextTarget, type NazmaVisit } from './nazma'
import { OWNER_ID, type OwnerVisit } from './owner'
import type { Rng } from './rng'
import { spatialMix } from './sfxEvents'
import type { Employee } from './staff'

/**
 * Who says what, when. Two kinds of talk: conversations that go on while a
 * customer is in a phase (a sales pitch, signing, a couple browsing), taking
 * turns, and one-off lines a store change prompts (a greeting, a counter, a
 * yes, a walk-out). Pure: `scene/Chatter` keeps the timers and `audio/voice`
 * makes the sound.
 */

/** One line of gibberish: who says it, how, and how many syllables. */
export interface Line {
  /** A customer or employee id, `PLAYER_ID`, `OWNER_ID`, `NAZMA_ID` or a companion's id. */
  speaker: string
  tone: Tone
  syllables: number
}

/** The slice of the store chatter reads. */
export interface ChatterState {
  customers: readonly Customer[]
  roster: readonly Employee[]
  owner: OwnerVisit | null
  nazma: NazmaVisit | null
}

/** A couple's companion speaks as this id (their walker's id in scene/Customers). */
export const companionId = (customerId: string) => `${customerId}:companion`

/** The character model `speaker` wears, which picks their voice range. Null if they're gone. */
export function variantOf(s: ChatterState, speaker: string): string | null {
  if (speaker === PLAYER_ID) return 'salesperson'
  if (speaker === OWNER_ID) return OWNER_VARIANT
  if (speaker === NAZMA_ID) return NAZMA_VARIANT
  const companionOf = speaker.endsWith(':companion') ? speaker.slice(0, -':companion'.length) : null
  if (companionOf) return s.customers.find((c) => c.id === companionOf)?.companion ?? null
  const c = s.customers.find((x) => x.id === speaker)
  if (c) return c.variant
  return s.roster.find((e) => e.id === speaker)?.variant ?? null
}

export type ConversationKind = 'pitch' | 'signing' | 'couple' | 'poach'

/** Two people talking back and forth; `speakers[0]` opens. */
export interface Conversation {
  key: string
  kind: ConversationKind
  speakers: [string, string]
}

/** Phases a couple chats in, out of earshot of any salesperson. */
const COUPLE_PHASES: readonly CustomerPhase[] = ['browsing', 'waiting']

/** The conversations going on right now. */
export function conversationsOf(s: ChatterState): Conversation[] {
  const out: Conversation[] = []
  for (const c of s.customers) {
    if (c.phase === 'talking' && c.handlerId) {
      out.push({ key: `pitch:${c.id}`, kind: 'pitch', speakers: [c.handlerId, c.id] })
    } else if (c.phase === 'signing' && c.handlerId) {
      out.push({ key: `signing:${c.id}`, kind: 'signing', speakers: [c.handlerId, c.id] })
    } else if (c.companion && COUPLE_PHASES.includes(c.phase)) {
      out.push({ key: `couple:${c.id}`, kind: 'couple', speakers: [c.id, companionId(c.id)] })
    }
  }
  const n = s.nazma
  const poached = n?.scheme === 'poach' && n.status === 'onLot' && n.chatting && nextTarget(n)
  if (poached) {
    out.push({ key: `poach:${poached}`, kind: 'poach', speakers: [NAZMA_ID, poached] })
  }
  return out
}

const between = (rng: Rng, [min, max]: readonly [number, number]) => min + rng.next() * (max - min)

/** Real-time ms before a new conversation's first line. */
const FIRST_GAP_MS: Record<ConversationKind, readonly [number, number]> = {
  // Past the greeting, which is a reaction of its own.
  pitch: [600, 1200],
  signing: [800, 2000],
  couple: [2000, 9000],
  poach: [300, 800],
}

export function firstGapMs(kind: ConversationKind, rng: Rng): number {
  return between(rng, FIRST_GAP_MS[kind])
}

/** A couple says a line each, then quiet for this long. */
export const COUPLE_PAUSE_MS: readonly [number, number] = [7000, 16000]

/**
 * Line number `turn` (from 0) of `conv`, and the silence after it in ms. The
 * two sides take turns: in a pitch the seller talks up the car and the
 * customer chimes in, at the desk it's a murmur over the paperwork, a
 * couple trade a remark now and then, and Nazma talks someone round in a low
 * voice while they ask questions.
 */
export function nextLine(
  conv: Conversation,
  turn: number,
  rng: Rng,
): { line: Line; gapMs: number } {
  const first = turn % 2 === 0
  const speaker = conv.speakers[first ? 0 : 1]
  switch (conv.kind) {
    case 'pitch': {
      const roll = rng.next()
      const tone: Tone = first
        ? roll < 0.2
          ? 'happy'
          : 'neutral'
        : roll < 0.3
          ? 'question'
          : roll < 0.45
            ? 'happy'
            : 'neutral'
      const syllables = first ? rng.int(3, 8) : rng.int(2, 5)
      return { line: { speaker, tone, syllables }, gapMs: between(rng, [350, 1100]) }
    }
    case 'signing':
      return {
        line: { speaker, tone: 'murmur', syllables: rng.int(2, 5) },
        gapMs: between(rng, [700, 2200]),
      }
    case 'couple': {
      const tone: Tone = first
        ? rng.next() < 0.4
          ? 'question'
          : 'neutral'
        : rng.next() < 0.5
          ? 'happy'
          : 'neutral'
      const gapMs = first ? between(rng, [250, 600]) : between(rng, COUPLE_PAUSE_MS)
      return { line: { speaker, tone, syllables: rng.int(2, 5) }, gapMs }
    }
    case 'poach': {
      const tone: Tone = first
        ? rng.next() < 0.6
          ? 'murmur'
          : 'neutral'
        : rng.next() < 0.5
          ? 'question'
          : 'murmur'
      const syllables = first ? rng.int(4, 8) : rng.int(2, 4)
      return { line: { speaker, tone, syllables }, gapMs: between(rng, [400, 1200]) }
    }
  }
}

/** Gap between the lines of one reaction, ms. */
export const REACTION_GAP_MS = 250

/**
 * One-off lines for a store change, in the order they're said:
 * - a greeting from whoever starts helping a customer, and one back;
 * - the receptionist's hello when someone reaches the lot;
 * - a "hmm" while a customer considers an offer, a question when they counter;
 * - a happy yes (and a happy seller) on accepting, a grumble on walking out;
 * - the owner's hello and goal when they reach the office;
 * - Nazma's grumble as he's run off.
 */
export function reactionsFor(prev: ChatterState, next: ChatterState, rng: Rng): Line[][] {
  const out: Line[][] = []
  if (next.customers !== prev.customers) {
    const before = new Map(prev.customers.map((c) => [c.id, c]))
    const receptionist = next.roster.find(
      (e) => e.role === 'receptionist' && e.status === 'atPost' && !e.fired,
    )
    for (const c of next.customers) {
      const was = before.get(c.id)
      if (!was || was.phase === c.phase) continue
      const from = was.phase
      const to = c.phase
      if (to === 'talking' && (from === 'browsing' || from === 'waiting') && c.handlerId) {
        out.push([
          { speaker: c.handlerId, tone: 'greeting', syllables: rng.int(2, 3) },
          { speaker: c.id, tone: 'greeting', syllables: 2 },
        ])
      } else if (from === 'arriving' && receptionist) {
        out.push([{ speaker: receptionist.id, tone: 'greeting', syllables: rng.int(2, 3) }])
      } else if (from === 'talking' && to === 'considering') {
        out.push([{ speaker: c.id, tone: 'murmur', syllables: 1 }])
      } else if (from === 'considering' && to === 'talking' && c.haggle) {
        out.push([{ speaker: c.id, tone: 'question', syllables: rng.int(3, 5) }])
      } else if (from === 'considering' && (to === 'following' || c.leaveReason === 'sold')) {
        const lines: Line[] = [{ speaker: c.id, tone: 'happy', syllables: rng.int(2, 4) }]
        if (c.handlerId) lines.push({ speaker: c.handlerId, tone: 'happy', syllables: 2 })
        out.push(lines)
      } else if (
        to === 'leaving' &&
        (c.leaveReason === 'refused' || c.leaveReason === 'impatient')
      ) {
        out.push([{ speaker: c.id, tone: 'grumble', syllables: rng.int(3, 5) }])
      }
    }
  }
  if (next.owner?.announced && !prev.owner?.announced) {
    out.push([
      { speaker: OWNER_ID, tone: 'greeting', syllables: 2 },
      { speaker: OWNER_ID, tone: 'neutral', syllables: rng.int(6, 9) },
    ])
  }
  if (next.nazma?.status === 'runOff' && prev.nazma?.status === 'onLot') {
    out.push([{ speaker: NAZMA_ID, tone: 'grumble', syllables: rng.int(4, 6) }])
  }
  return out
}

// Hearing distance. Voices are small sounds: they fade out much sooner than
// sound effects, and past `VOICE_FAR` they aren't played at all.

/** Most voices sounding at once; the nearest speak. */
export const MAX_VOICES = 3
/** Full volume within this distance of the listener (world units). */
export const VOICE_NEAR = 4
/** Beyond this distance a line is skipped. */
export const VOICE_FAR = 18
/** Level at `VOICE_FAR`, just before it cuts out. */
const VOICE_FAR_GAIN = 0.15

/** Gain and pan for a voice at `at`, or null when it's too far off to bother playing. */
export function voiceMix(
  listener: Vec2,
  yaw: number,
  at: Vec2,
): { gain: number; pan: number; dist: number } | null {
  const dist = Math.hypot(at.x - listener.x, at.z - listener.z)
  if (dist > VOICE_FAR) return null
  const t = Math.max(0, (dist - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR))
  return { gain: 1 - t * (1 - VOICE_FAR_GAIN), pan: spatialMix(listener, yaw, at).pan, dist }
}
