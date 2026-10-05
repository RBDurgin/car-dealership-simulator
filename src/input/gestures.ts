// Pure touch-gesture rules: no DOM, React or three.js, so they're unit tested like sim/.

/** Where and when a pointer went down or up. `t` is in milliseconds. */
export interface PointerSample {
  x: number
  y: number
  t: number
}

/** A tap may drift this far (in CSS pixels) between down and up. */
export const TAP_MAX_MOVE = 10
/** A press held longer than this (in ms) is not a tap. */
export const TAP_MAX_MS = 500

/**
 * True if a press was a tap: one finger, released close to where it went
 * down, and quickly. `maxPointers` is the most fingers down at once during the
 * press, so a pinch that ends with one finger lifting never counts.
 */
export function classifyTap(
  start: PointerSample,
  end: PointerSample,
  maxPointers: number,
): boolean {
  if (maxPointers !== 1) return false
  if (end.t - start.t > TAP_MAX_MS) return false
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_MAX_MOVE
}

/** Smallest and largest zoom change one pinch step may make, so a jittery frame can't jump. */
const MIN_STEP = 0.5
const MAX_STEP = 2

/**
 * Zoom factor for a pinch moving from `prevDist` to `dist` (the distance
 * between the two fingers): spreading the fingers zooms in (> 1). Returns 1 if
 * either distance is degenerate.
 */
export function pinchZoom(prevDist: number, dist: number): number {
  if (!(prevDist > 0) || !(dist > 0)) return 1
  return Math.min(Math.max(dist / prevDist, MIN_STEP), MAX_STEP)
}
