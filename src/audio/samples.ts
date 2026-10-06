import type { SfxCue } from '../sim/sfxEvents'
import { audioContext, busNode } from './engine'

/** Short sounds, decoded (or made) once and replayed from memory. */
export type SfxId = SfxCue

/** Recorded sounds, from Kenney's packs (see public/audio/LICENSE.md). */
const FILES: Record<Exclude<SfxId, 'spray'>, string> = {
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

const ALL_IDS = [...Object.keys(FILES), 'spray'] as SfxId[]

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

function load(ctx: AudioContext, id: SfxId): Promise<AudioBuffer | null> {
  let buffer = cache.get(id)
  if (!buffer) {
    buffer =
      id === 'spray'
        ? Promise.resolve(sprayBuffer(ctx))
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
