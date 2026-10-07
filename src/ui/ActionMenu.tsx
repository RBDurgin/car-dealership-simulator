import { COARSE, COMPACT, useMediaQuery } from '../input/useMediaQuery'
import { useEffect, useRef } from 'react'
import { actionBlocker } from '../sim/deal'
import { ACTIONS, type ActionId, type Interactable } from '../sim/interactables'
import { suggestedAsk, suggestedBuy } from '../sim/negotiation'
import { findInteractable } from '../scene/runtime'
import { useGame } from '../state/store'
import { formatMoney } from './format'

const RADIUS = 58
/** Fingers need taller buttons (`hud.css`), so the ring spreads out to fit them. */
const TOUCH_RADIUS = 72
const MARGIN = 90
/** A landscape phone is only ~375px tall: keep the ring nearer the edges. */
const COMPACT_MARGIN = 70

/** Button text: an offer names the suggested ask (or, to a seller, the suggested offer). */
function labelFor(action: ActionId, it: Interactable): string {
  if (action !== 'offer') return ACTIONS[action].label
  const s = useGame.getState()
  const c = s.customers.find((x) => x.id === it.id)
  if (c?.selling) return `Offer ${formatMoney(suggestedBuy(c))}`
  const car = s.inventory.find((x) => x.id === c?.targetCarId)
  return c && car ? `Ask ${formatMoney(suggestedAsk(c, car))}` : ACTIONS.offer.label
}

/** Sims-style pie menu: action buttons arranged on a ring around the click point. */
export function ActionMenu() {
  const menu = useGame((s) => s.menu)
  // Re-render when customers change, so a customer's menu follows their phase.
  const customers = useGame((s) => s.customers)
  // And when staff come and go: the office desk changes hands with the finance manager.
  const roster = useGame((s) => s.roster)
  // And when a car is sold or washed.
  const inventory = useGame((s) => s.inventory)
  const ref = useRef<HTMLDivElement>(null)
  const radius = useMediaQuery(COARSE) ? TOUCH_RADIUS : RADIUS
  const margin = useMediaQuery(COMPACT) ? COMPACT_MARGIN : MARGIN

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

  const x = Math.min(Math.max(menu.x, margin), window.innerWidth - margin)
  const y = Math.min(Math.max(menu.y, margin), window.innerHeight - margin)
  const n = it.actions.length
  return (
    <div ref={ref} className="pie" style={{ left: x, top: y }}>
      <div className="pie-title">{it.name}</div>
      {it.actions.map((id, i) => {
        // Start at the top and go clockwise.
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
        // Unavailable actions stay clickable: requestAction explains why they can't run.
        const blocked = actionBlocker(id, it.id, customers, roster, inventory) !== null
        return (
          <button
            key={id}
            className={blocked ? 'pie-item pie-item-blocked' : 'pie-item'}
            style={{ left: Math.cos(angle) * radius, top: Math.sin(angle) * radius }}
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
