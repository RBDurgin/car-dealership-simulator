import { useEffect, useRef } from 'react'
import type { CoachAnchor } from '../sim/tutorials'

/** Space between the ring and what it rings. */
const PAD = 4

/**
 * A ring around the first HUD element on screen carrying one of `anchors` as
 * its `data-coach`, measured each animation frame while the step is up (panels
 * open, close and scroll under it). It never takes a pointer, so what it rings
 * stays clickable, and it never touches the store.
 */
export function CoachHighlight({ anchors }: { anchors: readonly CoachAnchor[] }) {
  const ring = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = requestAnimationFrame(function draw() {
      const el = ring.current
      if (el) {
        let target: Element | null = null
        for (const a of anchors) {
          target = document.querySelector(`[data-coach="${a}"]`)
          if (target) break
        }
        const box = target?.getBoundingClientRect()
        if (box && box.width > 0) {
          el.style.display = 'block'
          el.style.left = `${box.left - PAD}px`
          el.style.top = `${box.top - PAD}px`
          el.style.width = `${box.width + 2 * PAD}px`
          el.style.height = `${box.height + 2 * PAD}px`
        } else el.style.display = 'none'
      }
      frame = requestAnimationFrame(draw)
    })
    return () => cancelAnimationFrame(frame)
  }, [anchors])
  return <div ref={ring} className="coach-ring" aria-hidden />
}
