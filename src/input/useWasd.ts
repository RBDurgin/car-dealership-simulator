import { useEffect, useRef, type RefObject } from 'react'

export interface MoveAxes {
  /** +1 forward (W / Up), -1 back (S / Down) */
  forward: number
  /** +1 right (D / Right), -1 left (A / Left) */
  right: number
}

const KEYS: Record<string, keyof MoveAxes | undefined> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'forward',
  ArrowDown: 'forward',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyA: 'right',
  ArrowLeft: 'right',
}
const NEGATIVE = new Set(['KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft'])

/** Tracks held movement keys. Returns a ref so reading it per frame causes no re-renders. */
export function useWasd(): RefObject<MoveAxes> {
  const axes = useRef<MoveAxes>({ forward: 0, right: 0 })

  useEffect(() => {
    const held = new Set<string>()
    const recompute = () => {
      const a = { forward: 0, right: 0 }
      for (const code of held) {
        const axis = KEYS[code]
        if (axis) a[axis] += NEGATIVE.has(code) ? -1 : 1
      }
      axes.current = {
        forward: Math.sign(a.forward),
        right: Math.sign(a.right),
      }
    }
    const down = (e: KeyboardEvent) => {
      // A focused slider (the sound settings) takes the arrow keys itself.
      if (!KEYS[e.code] || e.target instanceof HTMLInputElement) return
      e.preventDefault()
      held.add(e.code)
      recompute()
    }
    const up = (e: KeyboardEvent) => {
      if (held.delete(e.code)) recompute()
    }
    const reset = () => {
      held.clear()
      recompute()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
    }
  }, [])

  return axes
}
