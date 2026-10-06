import { audioContext, busNode } from './engine'

/** Short recorded sounds, decoded once and replayed from memory. */
export type SfxId = 'click'

const FILES: Record<SfxId, string> = {
  click: 'sfx/click.ogg',
}

const BASE = `${import.meta.env.BASE_URL}audio/`

/** Null once a file has failed to fetch or decode; that sound then stays silent. */
const cache = new Map<SfxId, Promise<AudioBuffer | null>>()

function load(ctx: AudioContext, id: SfxId): Promise<AudioBuffer | null> {
  let buffer = cache.get(id)
  if (!buffer) {
    buffer = fetch(BASE + FILES[id])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null)
    cache.set(id, buffer)
  }
  return buffer
}

/** Fetches and decodes sounds ahead of their first use. Does nothing before audio is unlocked. */
export function preloadSfx(ids: readonly SfxId[] = Object.keys(FILES) as SfxId[]): void {
  const ctx = audioContext()
  if (ctx) for (const id of ids) void load(ctx, id)
}

/**
 * Plays `id` once on the sfx bus at `volume` (0–1, before the bus's own).
 * Silent before audio is unlocked; a sound still loading plays when it's ready.
 */
export function playSfx(id: SfxId, volume = 1): void {
  const ctx = audioContext()
  const bus = busNode('sfx')
  if (!ctx || !bus) return
  void load(ctx, id).then((buffer) => {
    if (!buffer || ctx.state !== 'running') return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(gain).connect(bus)
    source.start()
  })
}
