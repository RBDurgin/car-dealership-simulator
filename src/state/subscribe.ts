import { useGame } from './store'
import type { GameState } from './types'

/**
 * Listeners that run their real work only when what they read changes, in
 * place of `useGame.subscribe` (whose listeners run on every `set()`). The
 * checks are by reference and allocate nothing, since they run on every set.
 */

/**
 * Subscribes to one slice of the store: `select` runs on every `set()`, and
 * `onChange` only when what it picks differs from the last pick (`equal`,
 * `Object.is` by default). `onChange` gets the new and the last pick, then the
 * whole state. To watch a few fields without making an object on every set,
 * select the state itself and compare the fields in `equal`.
 *
 * A set made inside another listener reaches every listener before the set
 * that caused it has reached them all; the older one comes after it and is
 * skipped, as the newer has already been seen.
 */
export function subscribeTo<T>(
  select: (s: GameState) => T,
  onChange: (next: T, prev: T, state: GameState) => void,
  equal: (a: T, b: T) => boolean = Object.is,
): () => void {
  let last = select(useGame.getState())
  return useGame.subscribe((s) => {
    if (s !== useGame.getState()) return
    const next = select(s)
    if (equal(next, last)) return
    const prev = last
    last = next
    onChange(next, prev, s)
  })
}

/**
 * Subscribes a diff of two states (`sfxFor`, `reactionsFor`, `tipFor`,
 * `achievementsFor`): `onChange(prev, next)` runs on each change, with the
 * state this listener last saw as `prev`, so a set overtaken by a newer one
 * (see `subscribeTo`) is diffed as part of the newer one, in order. The diffs
 * aren't gated on the fields they read: sets change those 30–86% of the time,
 * and each diff already returns early on what it doesn't need, so checking the
 * fields first cost more than it saved (`docs/PERF.md`, 18c).
 */
export function subscribeDiff(onChange: (prev: GameState, next: GameState) => void): () => void {
  return subscribeTo(
    (s) => s,
    (next, prev) => onChange(prev, next),
  )
}

/** Whether `a` and `b` hold the same value (by reference) in each of `keys`. */
export function sameFields<K extends keyof GameState>(
  a: GameState,
  b: GameState,
  keys: readonly K[],
): boolean {
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}
