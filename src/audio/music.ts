import {
  CROSSFADE_SECONDS,
  isMuffled,
  MUFFLE_CUTOFF_HZ,
  MUFFLE_GAIN,
  OPEN_CUTOFF_HZ,
  trackFor,
  type TrackId,
} from '../sim/musicPlan'
import { useGame } from '../state/store'
import { audioContext, busNode } from './engine'

const BASE = `${import.meta.env.BASE_URL}audio/music/`
/** Seconds the muffle takes to close in or open out. */
const MUFFLE_SECONDS = 0.4
const RETRY_EVENTS = ['pointerdown', 'keydown'] as const

/** One track: a looping stream with its own fader, kept so it resumes where it stopped. */
interface Deck {
  el: HTMLAudioElement
  fade: GainNode
  /** Pauses the stream once its fade-out is done. */
  stopTimer?: number
}

const decks = new Map<TrackId, Deck>()
let current: TrackId | null = null
/** The shared muffle: a low-pass and a level, between the decks and the music bus. */
let muffle: { filter: BiquadFilterNode; gain: GainNode } | null = null
/** The browser refused to start the current track without a gesture; the next one retries. */
let blocked = false
let muffled = false

/** OGG where the browser plays it, MP3 elsewhere (older Safari). */
function extension(): string {
  return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'
}

function muffleNode(ctx: AudioContext): AudioNode {
  if (!muffle) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = OPEN_CUTOFF_HZ
    const gain = ctx.createGain()
    filter.connect(gain).connect(busNode('music')!)
    muffle = { filter, gain }
  }
  return muffle.filter
}

function deckFor(ctx: AudioContext, track: TrackId): Deck {
  let deck = decks.get(track)
  if (!deck) {
    const el = new Audio(`${BASE}${track}.${extension()}`)
    el.loop = true
    el.preload = 'none'
    const fade = ctx.createGain()
    fade.gain.value = 0
    ctx.createMediaElementSource(el).connect(fade).connect(muffleNode(ctx))
    deck = { el, fade }
    decks.set(track, deck)
  }
  return deck
}

function play(deck: Deck): void {
  void deck.el.play().then(
    () => (blocked = false),
    // A pause cutting a start short is fine; only a refusal waits for a gesture.
    (e: unknown) => (blocked = e instanceof DOMException && e.name === 'NotAllowedError'),
  )
}

/** Fades `track` in and whatever played before out, over the crossfade. */
function switchTo(ctx: AudioContext, track: TrackId): void {
  const now = ctx.currentTime
  const previous = current && decks.get(current)
  if (previous) {
    previous.fade.gain.cancelScheduledValues(now)
    previous.fade.gain.setValueAtTime(previous.fade.gain.value, now)
    previous.fade.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS)
    window.clearTimeout(previous.stopTimer)
    previous.stopTimer = window.setTimeout(() => previous.el.pause(), CROSSFADE_SECONDS * 1000)
  }
  current = track
  const deck = deckFor(ctx, track)
  window.clearTimeout(deck.stopTimer)
  deck.fade.gain.cancelScheduledValues(now)
  deck.fade.gain.setValueAtTime(deck.fade.gain.value, now)
  deck.fade.gain.linearRampToValueAtTime(1, now + CROSSFADE_SECONDS)
  play(deck)
}

function applyMuffle(ctx: AudioContext, on: boolean): void {
  if (!muffle || on === muffled) return
  muffled = on
  const t = MUFFLE_SECONDS / 3
  muffle.filter.frequency.setTargetAtTime(
    on ? MUFFLE_CUTOFF_HZ : OPEN_CUTOFF_HZ,
    ctx.currentTime,
    t,
  )
  muffle.gain.gain.setTargetAtTime(on ? MUFFLE_GAIN : 1, ctx.currentTime, t)
}

/** Brings the music in line with the store: the right track, muffled or not. Silent before unlock. */
export function syncMusic(): void {
  const ctx = audioContext()
  if (!ctx || !busNode('music')) return
  const s = useGame.getState()
  const track = trackFor(s)
  if (track !== current) switchTo(ctx, track)
  applyMuffle(ctx, isMuffled(s))
}

/**
 * Plays the background music (`sim/musicPlan`): a looping track per day
 * part, the title and the summary, crossfaded as the store changes. Each
 * track is streamed rather than decoded whole, and picks up where it left off.
 * Changes come only from store updates (the clock's 10-minute steps, the
 * screen, the summary, the guide), never per frame. Call `syncMusic` once
 * audio is unlocked to start it.
 */
export function startMusic(): () => void {
  const unsubscribe = useGame.subscribe((s, prev) => {
    if (
      s.screen !== prev.screen ||
      s.clock !== prev.clock ||
      s.customers !== prev.customers ||
      s.helpOpen !== prev.helpOpen ||
      s.rotatePrompt !== prev.rotatePrompt
    )
      syncMusic()
  })

  // Some browsers only start a stream inside a gesture; if one refused, the next tap or key starts it.
  const retry = () => {
    const deck = current && decks.get(current)
    if (blocked && deck) play(deck)
  }
  for (const e of RETRY_EVENTS) window.addEventListener(e, retry, true)

  // A hidden tab suspends the mixer; pause the stream too, so it doesn't run on unheard.
  const onVisibility = () => {
    const deck = current && decks.get(current)
    if (!deck) return
    if (document.hidden) deck.el.pause()
    else play(deck)
  }
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    unsubscribe()
    for (const e of RETRY_EVENTS) window.removeEventListener(e, retry, true)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
