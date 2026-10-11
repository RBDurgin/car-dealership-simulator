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

/** `?perf` in the URL (or the older `?fps`) turns on the overlay and these counts. */
export const PERF =
  typeof window !== 'undefined' &&
  ['perf', 'fps'].some((flag) => new URLSearchParams(window.location.search).has(flag))

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
