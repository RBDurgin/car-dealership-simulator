import { useEffect, useRef } from 'react'
import { ACTIONS } from '../sim/interactables'
import { interactables } from '../scene/runtime'
import { useGame } from '../state/store'

const RADIUS = 58
const MARGIN = 90

/** Sims-style pie menu: action buttons arranged on a ring around the click point. */
export function ActionMenu() {
  const menu = useGame((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)

  // Any press outside the menu closes it. Capture phase, so it runs before the
  // canvas handlers and a click on another object can open a fresh menu.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) useGame.getState().closeMenu()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [menu])

  const it = menu && interactables.get(menu.targetId)
  if (!menu || !it) return null

  const x = Math.min(Math.max(menu.x, MARGIN), window.innerWidth - MARGIN)
  const y = Math.min(Math.max(menu.y, MARGIN), window.innerHeight - MARGIN)
  const n = it.actions.length
  return (
    <div ref={ref} className="pie" style={{ left: x, top: y }}>
      <div className="pie-title">{it.name}</div>
      {it.actions.map((id, i) => {
        // Start at the top and go clockwise.
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
        return (
          <button
            key={id}
            className="pie-item"
            style={{ left: Math.cos(angle) * RADIUS, top: Math.sin(angle) * RADIUS }}
            onClick={() => useGame.getState().requestAction(it.id, id)}
          >
            {ACTIONS[id].label}
          </button>
        )
      })}
    </div>
  )
}
