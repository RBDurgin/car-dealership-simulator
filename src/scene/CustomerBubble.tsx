import { Html } from '@react-three/drei'
import { bubbleOf, type Bubble } from '../sim/customers'
import { useGame } from '../state/store'

/** Just above a ~1.2 unit tall character's head. */
const BUBBLE_HEIGHT = 1.55

const ICONS: Record<Bubble, string> = {
  waiting: '!',
  impatient: '!',
  considering: '…',
  helped: '✓',
  bought: '$',
  upset: '☹',
}

/**
 * The icon over a customer's head: `!` when they want help (red once impatient),
 * a tick while a salesperson is helping them, `…` while considering an offer, `$` after buying, a frown when they leave upset.
 * Re-renders only when the icon changes.
 */
export function CustomerBubble({ id }: { id: string }) {
  const bubble = useGame((s) => {
    const c = s.customers.find((x) => x.id === id)
    return c ? bubbleOf(c) : null
  })
  if (!bubble) return null
  return (
    <Html position={[0, BUBBLE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className={`bubble bubble-${bubble}`}>{ICONS[bubble]}</div>
    </Html>
  )
}
