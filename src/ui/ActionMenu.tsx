import { useEffect, useRef } from 'react'
import { actionBlocker } from '../sim/deal'
import { ACTIONS, type ActionId, type Interactable } from '../sim/interactables'
import { findInteractable } from '../scene/runtime'
import { useGame } from '../state/store'
import { formatMoney } from './format'

const RADIUS = 58
const MARGIN = 90

/** Button text: offers name their price. */
function labelFor(action: ActionId, it: Interactable): string {
  if (action !== 'offer') return ACTIONS[action].label
  const s = useGame.getState()
  const c = s.customers.find((x) => x.id === it.id)
  const car = s.inventory.find((x) => x.id === c?.targetCarId)
  return car ? `Offer at MSRP (${formatMoney(car.msrp)})` : ACTIONS.offer.label
}

/** Sims-style pie menu: action buttons arranged on a ring around the click point. */
export function ActionMenu() {
  const menu = useGame((s) => s.menu)
  // Re-render when customers change, so a customer's menu follows their phase.
  const customers = useGame((s) => s.customers)
  // And when staff come and go: the office desk changes hands with the finance manager.
  const roster = useGame((s) => s.roster)
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

  const it = menu && findInteractable(menu.targetId)
  if (!menu || !it || it.actions.length === 0) return null

  const x = Math.min(Math.max(menu.x, MARGIN), window.innerWidth - MARGIN)
  const y = Math.min(Math.max(menu.y, MARGIN), window.innerHeight - MARGIN)
  const n = it.actions.length
  return (
    <div ref={ref} className="pie" style={{ left: x, top: y }}>
      <div className="pie-title">{it.name}</div>
      {it.actions.map((id, i) => {
        // Start at the top and go clockwise.
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
        // Unavailable actions stay clickable: requestAction explains why they can't run.
        const blocked = actionBlocker(id, it.id, customers, roster) !== null
        return (
          <button
            key={id}
            className={blocked ? 'pie-item pie-item-blocked' : 'pie-item'}
            style={{ left: Math.cos(angle) * RADIUS, top: Math.sin(angle) * RADIUS }}
            aria-disabled={blocked}
            onClick={() => useGame.getState().requestAction(it.id, id)}
          >
            {labelFor(id, it)}
          </button>
        )
      })}
    </div>
  )
}
