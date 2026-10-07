import type { SfxCue } from '../sim/sfxEvents'
import { audioContext, busNode } from './engine'

/** Short sounds, decoded (or made) once and replayed from memory. */
export type SfxId = SfxCue

/** Sounds made here rather than read from a file. */
type Synth = 'spray' | 'fanfare'

/** Recorded sounds, from Kenney's packs (see public/audio/LICENSE.md). */
const FILES: Record<Exclude<SfxId, Synth>, string> = {
  click: 'sfx/click.ogg',
  sale: 'sfx/sale.ogg',
  coin: 'sfx/coin.ogg',
  chime: 'sfx/chime.ogg',
  pop: 'sfx/pop.ogg',
  paper: 'sfx/paper.ogg',
  bell: 'sfx/bell.ogg',
  stamp: 'sfx/stamp.ogg',
  thud: 'sfx/thud.ogg',
  open: 'sfx/open.ogg',
  close: 'sfx/close.ogg',
  scuff: 'sfx/scuff.ogg',
  shoo: 'sfx/shoo.ogg',
}

const ALL_IDS = [...Object.keys(FILES), 'spray', 'fanfare'] as SfxId[]

const BASE = `${import.meta.env.BASE_URL}audio/`

/** Null once a file has failed to fetch or decode; that sound then stays silent. */
const cache = new Map<SfxId, Promise<AudioBuffer | null>>()

const SPRAY_SECONDS = 1.2

/**
 * A pressure washer's hiss: noise that swells in, sputters a little and tails
 * off. Made here because none of the packs has water in it.
 */
function sprayBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(SPRAY_SECONDS * rate), rate)
  const data = buffer.getChannelData(0)
  let flutter = 1
  for (let i = 0; i < data.length; i++) {
    const t = i / rate
    const swell = Math.min(1, t / 0.08) * Math.min(1, (SPRAY_SECONDS - t) / 0.4)
    // A slowly wandering level, so the stream sounds uneven like water rather than static.
    if (i % 256 === 0) flutter = 0.6 + Math.random() * 0.4
    data[i] = (Math.random() * 2 - 1) * swell * flutter
  }
  return buffer
}

/** A sale weekend's fanfare: a quick rising arpeggio and a held chord, in C major. */
const FANFARE_NOTES = [
  { at: 0, hz: [523.25], len: 0.12 },
  { at: 0.12, hz: [659.25], len: 0.12 },
  { at: 0.24, hz: [783.99], len: 0.12 },
  { at: 0.36, hz: [523.25, 659.25, 783.99, 1046.5], len: 0.7 },
]
const FANFARE_SECONDS = 1.1

/**
 * Brassy-ish notes from a few odd harmonics, each with a quick attack and a
 * decay. Made here because the packs' jingles are already the bell and the sale.
 */
function fanfareBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(FANFARE_SECONDS * rate), rate)
  const data = buffer.getChannelData(0)
  for (const note of FANFARE_NOTES) {
    const start = Math.floor(note.at * rate)
    const end = Math.min(data.length, start + Math.floor((note.len + 0.15) * rate))
    for (let i = start; i < end; i++) {
      const t = (i - start) / rate
      const envelope = Math.min(1, t / 0.015) * Math.exp(-t / (note.len * 0.6))
      let sample = 0
      for (const hz of note.hz) {
        const phase = 2 * Math.PI * hz * t
        sample += Math.sin(phase) + 0.4 * Math.sin(3 * phase) + 0.2 * Math.sin(5 * phase)
      }
      data[i] += (sample / note.hz.length) * envelope * 0.5
    }
  }
  return buffer
}

function load(ctx: AudioContext, id: SfxId): Promise<AudioBuffer | null> {
  let buffer = cache.get(id)
  if (!buffer) {
    buffer =
      id === 'spray'
        ? Promise.resolve(sprayBuffer(ctx))
        : id === 'fanfare'
          ? Promise.resolve(fanfareBuffer(ctx))
          : fetch(BASE + FILES[id])
              .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
              .then((data) => ctx.decodeAudioData(data))
              .catch(() => null)
    cache.set(id, buffer)
  }
  return buffer
}

/** Fetches and decodes sounds ahead of their first use. Does nothing before audio is unlocked. */
export function preloadSfx(ids: readonly SfxId[] = ALL_IDS): void {
  const ctx = audioContext()
  if (ctx) for (const id of ids) void load(ctx, id)
}

/**
 * Plays `id` once on the sfx bus at `volume` (0–1, before the bus's own),
 * panned by `pan` (−1 left … 1 right). Silent before audio is unlocked; a
 * sound still loading plays when it's ready.
 */
export function playSfx(id: SfxId, volume = 1, pan = 0): void {
  const ctx = audioContext()
  const bus = busNode('sfx')
  if (!ctx || !bus) return
  void load(ctx, id).then((buffer) => {
    if (!buffer || ctx.state !== 'running') return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = volume
    let head: AudioNode = source
    if (id === 'spray') {
      // Water's hiss sits high; the low rumble of plain noise sounds like wind.
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 3500
      filter.Q.value = 0.8
      head = head.connect(filter)
    }
    if (pan !== 0) {
      const panner = ctx.createStereoPanner()
      panner.pan.value = pan
      head = head.connect(panner)
    }
    head.connect(gain).connect(bus)
    source.start()
  })
}
