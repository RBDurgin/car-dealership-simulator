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

/**
 * Button text: an offer names the suggested ask (or, to a seller, the
 * suggested offer), a recommendation the extra work and its price.
 */
function labelFor(action: ActionId, it: Interactable): string {
  const s = useGame.getState()
  if (action === 'recommend') {
    const c = s.customers.find((x) => x.id === it.id)
    const f = s.serviceJobs.find((j) => j.id === c?.service?.jobId)?.finding
    return f ? `${f.label}, ${formatMoney(f.labor + f.parts)}` : ACTIONS.recommend.label
  }
  if (action !== 'offer') return ACTIONS[action].label
  const c = s.customers.find((x) => x.id === it.id)
  if (c?.selling) return `Offer ${formatMoney(suggestedBuy(c))}`
  const car = s.inventory.find((x) => x.id === c?.targetCarId)
  return c && car ? `Ask ${formatMoney(suggestedAsk(c, car))}` : ACTIONS.offer.label
}

/** One button of the menu. */
interface MenuItem {
  id: ActionId
  label: string
  /** Unavailable actions stay clickable: requestAction explains why they can't run. */
  blocked: boolean
}

/** What the menu on `targetId` shows now: its name and buttons, or null if there's nothing to do. */
function menuFor(targetId: string): { it: Interactable; items: MenuItem[] } | null {
  const it = findInteractable(targetId)
  if (!it || it.actions.length === 0) return null
  const s = useGame.getState()
  const items = it.actions.map((id) => ({
    id,
    label: labelFor(id, it),
    blocked: actionBlocker(id, it.id, s.customers, s.roster, s.inventory, s.serviceJobs) !== null,
  }))
  return { it, items }
}

/** The menu as text, so it re-renders only when what it shows changes. */
function menuKey(targetId: string): string {
  const m = menuFor(targetId)
  if (!m) return ''
  return [m.it.name, ...m.items.map((x) => `${x.id}:${x.label}:${x.blocked}`)].join('|')
}

/**
 * Sims-style pie menu: action buttons arranged on a ring around the click
 * point. Selects nothing else while it's closed; open, it re-renders only when
 * its buttons change (a customer's phase, a car sold or washed, the office desk
 * changing hands, extra work offered on a service client's car).
 */
export function ActionMenu() {
  const menu = useGame((s) => s.menu)
  useGame((s) => (s.menu ? menuKey(s.menu.targetId) : null))
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

  const shown = menu && menuFor(menu.targetId)
  if (!menu || !shown) return null
  const { it, items } = shown

  const x = Math.min(Math.max(menu.x, margin), window.innerWidth - margin)
  const y = Math.min(Math.max(menu.y, margin), window.innerHeight - margin)
  const n = items.length
  return (
    <div ref={ref} className="pie" style={{ left: x, top: y }}>
      <div className="pie-title">{it.name}</div>
      {items.map(({ id, label, blocked }, i) => {
        // Start at the top and go clockwise.
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
        return (
          <button
            key={id}
            className={blocked ? 'pie-item pie-item-blocked' : 'pie-item'}
            style={{ left: Math.cos(angle) * radius, top: Math.sin(angle) * radius }}
            aria-disabled={blocked}
            onClick={() => useGame.getState().requestAction(it.id, id)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
