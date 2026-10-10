import type { SfxCue } from '../sim/sfxEvents'
import { audioContext, busNode } from './engine'

/** Short sounds, decoded (or made) once and replayed from memory. */
export type SfxId = SfxCue

/** Sounds made here rather than read from a file. */
type Synth = 'spray' | 'fanfare' | 'engine' | 'door' | 'wrench' | 'lift'

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

const ALL_IDS = [
  ...Object.keys(FILES),
  'spray',
  'fanfare',
  'engine',
  'door',
  'wrench',
  'lift',
] as SfxId[]

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

const ENGINE_SECONDS = 1.8

/**
 * A car pulling away: a low, lumpy rumble that revs up, settles and fades as
 * it drives off. A few harmonics of the firing note, wobbled so it doesn't
 * sound like an organ, with a little noise. Made here because the packs have
 * no cars in them.
 */
function engineBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(ENGINE_SECONDS * rate), rate)
  const data = buffer.getChannelData(0)
  let phase = 0
  for (let i = 0; i < data.length; i++) {
    const t = i / rate
    // Revs from idle to about 70 Hz, then eases back as it cruises off.
    const hz = t < 0.45 ? 38 + (t / 0.45) * 32 : 70 - Math.min(1, (t - 0.45) / 0.6) * 18
    phase += (2 * Math.PI * hz) / rate
    let tone = 0
    for (let k = 1; k <= 6; k++) tone += Math.sin(k * phase) / k
    const lump = 0.7 + 0.3 * Math.sin(phase * 0.5)
    const envelope = Math.min(1, t / 0.06) * Math.min(1, (ENGINE_SECONDS - t) / 0.9)
    data[i] = (tone * lump * 0.45 + (Math.random() * 2 - 1) * 0.12) * envelope
  }
  return buffer
}

const DOOR_SECONDS = 0.4

/** A car door shutting: the latch's click on top of a dull, quickly damped thump. */
function doorBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(DOOR_SECONDS * rate), rate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const t = i / rate
    const thump = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.07)
    const slam = (Math.random() * 2 - 1) * Math.exp(-t / 0.015) * 0.6
    const latch = t >= 0.035 ? (Math.random() * 2 - 1) * Math.exp(-(t - 0.035) / 0.005) * 0.35 : 0
    data[i] = (thump + slam + latch) * 0.8
  }
  return buffer
}

const WRENCH_SECONDS = 0.9
/** When each click of the ratchet lands, in seconds. */
const RATCHET_CLICKS = [0, 0.09, 0.18, 0.27, 0.5, 0.59, 0.68]

/**
 * A ratchet wrench at work: a run of sharp clicks, each a tick of noise with
 * a short metallic ring (a couple of high, inharmonic partials), in two bursts.
 */
function wrenchBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(WRENCH_SECONDS * rate), rate)
  const data = buffer.getChannelData(0)
  for (const at of RATCHET_CLICKS) {
    const start = Math.floor(at * rate)
    const end = Math.min(data.length, start + Math.floor(0.06 * rate))
    for (let i = start; i < end; i++) {
      const t = (i - start) / rate
      const tick = (Math.random() * 2 - 1) * Math.exp(-t / 0.003)
      const ring =
        (Math.sin(2 * Math.PI * 2900 * t) + 0.6 * Math.sin(2 * Math.PI * 4650 * t)) *
        Math.exp(-t / 0.018)
      data[i] += (tick * 0.7 + ring * 0.35) * 0.8
    }
  }
  return buffer
}

const LIFT_SECONDS = 1.6

/**
 * A hydraulic lift: a pump's hum that rises a little in pitch as it works,
 * with a hiss of fluid, easing in and out.
 */
function liftBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(LIFT_SECONDS * rate), rate)
  const data = buffer.getChannelData(0)
  let phase = 0
  for (let i = 0; i < data.length; i++) {
    const t = i / rate
    phase += (2 * Math.PI * (110 + 30 * (t / LIFT_SECONDS))) / rate
    const hum = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase)
    const hiss = (Math.random() * 2 - 1) * 0.15
    const envelope = Math.min(1, t / 0.15) * Math.min(1, (LIFT_SECONDS - t) / 0.3)
    data[i] = (hum * 0.35 + hiss) * envelope
  }
  return buffer
}

const SYNTHS: Record<Synth, (ctx: AudioContext) => AudioBuffer> = {
  spray: sprayBuffer,
  fanfare: fanfareBuffer,
  engine: engineBuffer,
  door: doorBuffer,
  wrench: wrenchBuffer,
  lift: liftBuffer,
}

/** Lowpass cutoffs (Hz) that take the fizz off made-up sounds. */
const LOWPASS: Partial<Record<SfxId, number>> = { engine: 900, door: 2500, lift: 1200 }

function load(ctx: AudioContext, id: SfxId): Promise<AudioBuffer | null> {
  let buffer = cache.get(id)
  if (!buffer) {
    buffer =
      id in SYNTHS
        ? Promise.resolve(SYNTHS[id as Synth](ctx))
        : fetch(BASE + FILES[id as Exclude<SfxId, Synth>])
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
    const cutoff = LOWPASS[id]
    if (cutoff) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
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
