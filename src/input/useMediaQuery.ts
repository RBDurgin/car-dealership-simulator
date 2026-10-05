import { useCallback, useSyncExternalStore } from 'react'

/** Landscape phones and small windows: the HUD tightens up (matches `hud.css`). */
export const COMPACT = '(max-height: 500px), (max-width: 760px)'
/** A finger is the main pointer: tap targets grow and hints talk about taps. */
export const COARSE = '(pointer: coarse)'
/** A touch device held upright, which the game doesn't lay out for. */
export const PORTRAIT_TOUCH = '(orientation: portrait) and (pointer: coarse)'

/** Whether `query` matches right now; false where there's no `matchMedia`. */
export function matchesMedia(query: string): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
}

/** Whether `query` matches, re-rendering when that changes (rotation, resizing). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => matchesMedia(query))
}
