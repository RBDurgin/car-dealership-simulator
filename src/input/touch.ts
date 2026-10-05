import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { classifyTap, pinchZoom, twistDelta, twistTurn, type PointerSample } from './gestures'

interface Press {
  start: PointerSample
  pos: { x: number; y: number }
  /** Most fingers down at once since this one went down. */
  maxPointers: number
}

// Touch and pen pointers currently down on the canvas, by pointer id.
const active = new Map<number, Press>()
// Whether each lifted pointer was a tap, kept until the next gesture starts.
const verdicts = new Map<number, boolean>()
let pinchDist = 0
const pinchListeners = new Set<(factor: number) => void>()
// Screen angle between the two fingers, and how far they've twisted since the last turn.
let twistAngle = 0
let twistAcc = 0
const twistListeners = new Set<(dir: 1 | -1) => void>()

/** True for touch and pen: they act on a tap (pointerup) and never hover. */
export function isTouch(e: PointerEvent): boolean {
  return e.pointerType === 'touch' || e.pointerType === 'pen'
}

/**
 * Whether the touch that just lifted was a tap. Valid inside pointerup
 * handlers: the canvas listener below runs before R3F's, which sit on the
 * canvas's parent.
 */
export function isTap(pointerId: number): boolean {
  return verdicts.get(pointerId) ?? false
}

/** Calls `fn` with a zoom factor (> 1 = spreading) each time a two-finger pinch moves. */
export function onPinch(fn: (factor: number) => void): () => void {
  pinchListeners.add(fn)
  return () => pinchListeners.delete(fn)
}

/**
 * Calls `fn` each time a two-finger twist goes far enough for a quarter turn:
 * 1 = clockwise on screen, -1 = counter-clockwise.
 */
export function onTwist(fn: (dir: 1 | -1) => void): () => void {
  twistListeners.add(fn)
  return () => twistListeners.delete(fn)
}

function twoFingerDistance(): number {
  const [a, b] = [...active.values()]
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)
}

function twoFingerAngle(): number {
  const [a, b] = [...active.values()]
  return Math.atan2(b.pos.y - a.pos.y, b.pos.x - a.pos.x)
}

/** Tracks touch pointers on the R3F canvas and stops the browser's own gestures there. */
export function useTouchTracking(): void {
  const el = useThree((s) => s.gl.domElement)

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!isTouch(e)) return
      if (active.size === 0) verdicts.clear()
      active.set(e.pointerId, {
        start: { x: e.clientX, y: e.clientY, t: e.timeStamp },
        pos: { x: e.clientX, y: e.clientY },
        maxPointers: 1,
      })
      for (const p of active.values()) p.maxPointers = Math.max(p.maxPointers, active.size)
      if (active.size === 2) {
        pinchDist = twoFingerDistance()
        twistAngle = twoFingerAngle()
        twistAcc = 0
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = active.get(e.pointerId)
      if (!p) return
      p.pos.x = e.clientX
      p.pos.y = e.clientY
      if (active.size !== 2) return
      const dist = twoFingerDistance()
      const factor = pinchZoom(pinchDist, dist)
      pinchDist = dist
      if (factor !== 1) for (const fn of pinchListeners) fn(factor)

      const angle = twoFingerAngle()
      const { turn, rest } = twistTurn(twistAcc + twistDelta(twistAngle, angle))
      twistAngle = angle
      twistAcc = rest
      if (turn !== 0) for (const fn of twistListeners) fn(turn)
    }
    const onUp = (e: PointerEvent) => {
      const p = active.get(e.pointerId)
      if (!p) return
      active.delete(e.pointerId)
      const end = { x: e.clientX, y: e.clientY, t: e.timeStamp }
      verdicts.set(e.pointerId, e.type === 'pointerup' && classifyTap(p.start, end, p.maxPointers))
    }
    // No browser zoom, long-press menu or callout over the game. Cancelling
    // touchend also stops the follow-up click from landing on a menu that
    // just opened under the finger.
    const prevent = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('contextmenu', prevent)
    el.addEventListener('touchend', prevent, { passive: false })
    // iOS Safari ignores user-scalable=no and pinch-zooms the page from anywhere.
    document.addEventListener('gesturestart', prevent)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('contextmenu', prevent)
      el.removeEventListener('touchend', prevent)
      document.removeEventListener('gesturestart', prevent)
      active.clear()
    }
  }, [el])
}
