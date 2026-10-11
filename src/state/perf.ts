import type { StoreApi } from 'zustand'

/**
 * Counts for the `?perf` overlay (`scene/PerfOverlay.tsx`): store `set()`
 * calls and the time spent in the listeners added through
 * `useGame.subscribe` (audio, autosave, tips and the rest; components'
 * selectors subscribe to the inner store and aren't timed). Only installed
 * with the flag, before anything subscribes, so a normal game pays nothing.
 */
export interface StoreCounts {
  /** `set()` calls that changed the state (each one runs every listener). */
  sets: number
  /** Total ms spent in listeners. */
  listenerMs: number
  /** Listeners subscribed now through `useGame.subscribe`. */
  listeners: number
}

export const storeCounts: StoreCounts = { sets: 0, listenerMs: 0, listeners: 0 }

/** How often the overlay takes a reading, in seconds. */
export const PERF_REFRESH_S = 0.5

const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)

/** `?perf` in the URL (or the older `?fps`) turns on the overlay and these counts. */
export const PERF = params.has('perf') || params.has('fps')

/**
 * `?perf=busy`: a new game starts on the busy late-game day of
 * `state/perfScenario.ts`, and nothing is saved (`main.tsx`).
 */
export const PERF_BUSY = params.get('perf') === 'busy'

/**
 * Wraps `store.subscribe` so each listener is timed, and counts the sets.
 * Call it once, before the first `subscribe`.
 */
export function instrumentStore<T>(store: StoreApi<T>): void {
  const subscribe = store.subscribe
  subscribe(() => {
    storeCounts.sets++
  })
  store.subscribe = (listener) => {
    storeCounts.listeners++
    const unsubscribe = subscribe((state, prev) => {
      const t = performance.now()
      listener(state, prev)
      storeCounts.listenerMs += performance.now() - t
    })
    return () => {
      storeCounts.listeners--
      unsubscribe()
    }
  }
}

/** One reading of the overlay, refreshed a couple of times a second. */
export interface PerfSample {
  fps: number
  /** Frame time percentiles over the last couple of seconds, in ms. */
  p50: number
  p95: number
  /** The last frame's draw calls and triangles, shadow passes included. */
  calls: number
  triangles: number
  /** Geometries and textures the renderer holds. */
  geometries: number
  textures: number
  setsPerSecond: number
  /** ms spent in store listeners per second. */
  listenerMs: number
  listeners: number
  /** People in the world (the player too), visitors' cars and `<Html>` badges. */
  walkers: number
  vehicles: number
  html: number
}

/** The overlay's last reading, null before its first; read by the `@perf` e2e scenario. */
export const perfReading: { latest: PerfSample | null } = { latest: null }

/** A day's readings at one game speed, summed for averages. */
export interface SpeedTotals {
  speed: number
  samples: number
  fps: number
  p95: number
  calls: number
  maxCalls: number
  triangles: number
  setsPerSecond: number
  listenerMs: number
  walkers: number
  html: number
}

/**
 * The readings taken while day `day` was being played (not paused, not
 * over), by game speed, and the renderer's geometries and textures at the
 * first and last of them, to show whether they climb. Shown at the end of
 * the day by `ui/PerfReport.tsx`.
 */
export interface PerfDay {
  day: number
  bySpeed: SpeedTotals[]
  first: { geometries: number; textures: number }
  last: { geometries: number; textures: number }
  /** The largest JS heap read today in MB, where the browser tells (Chromium only). */
  heapMB: number | null
}

export const perfDay: { current: PerfDay | null } = { current: null }

/** Adds one reading taken on `day` at `speed`; a new day starts afresh. */
export function recordPerf(
  sample: PerfSample,
  day: number,
  speed: number,
  heapMB: number | null = null,
): PerfDay {
  const memory = { geometries: sample.geometries, textures: sample.textures }
  const prev = perfDay.current
  const today: PerfDay =
    prev && prev.day === day
      ? prev
      : { day, bySpeed: [], first: memory, last: memory, heapMB: null }
  today.last = memory
  if (heapMB !== null) today.heapMB = Math.max(today.heapMB ?? 0, heapMB)
  let t = today.bySpeed.find((x) => x.speed === speed)
  if (!t) {
    t = {
      speed,
      samples: 0,
      fps: 0,
      p95: 0,
      calls: 0,
      maxCalls: 0,
      triangles: 0,
      setsPerSecond: 0,
      listenerMs: 0,
      walkers: 0,
      html: 0,
    }
    today.bySpeed.push(t)
    today.bySpeed.sort((a, b) => a.speed - b.speed)
  }
  t.samples++
  t.fps += sample.fps
  t.p95 += sample.p95
  t.calls += sample.calls
  t.maxCalls = Math.max(t.maxCalls, sample.calls)
  t.triangles += sample.triangles
  t.setsPerSecond += sample.setsPerSecond
  t.listenerMs += sample.listenerMs
  t.walkers += sample.walkers
  t.html += sample.html
  perfDay.current = today
  return today
}
