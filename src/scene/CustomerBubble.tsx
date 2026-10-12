import { Html } from '@react-three/drei'
import { bubbleOf, type Bubble } from '../sim/customers'
import { customerById } from '../state/selectors'
import { useGame } from '../state/store'

/** Just above a ~1.2 unit tall character's head. */
const BUBBLE_HEIGHT = 1.55

const ICONS: Record<Bubble, string> = {
  waiting: '!',
  client: '★',
  impatient: '!',
  considering: '…',
  counter: '$?',
  helped: '✓',
  bought: '$',
  upset: '☹',
  drive: '🔑',
}

/**
 * The icon over a customer's head: `!` when they want help (a star for someone
 * from the client book, red `!` once impatient),
 * a key when they'd like a test drive, a tick while a salesperson is helping them, `…` while considering an offer, `$?`
 * after they counter, `$` after buying, a frown when they leave upset.
 * Re-renders only when the icon changes.
 */
export function CustomerBubble({ id }: { id: string }) {
  const bubble = useGame((s) => {
    const c = customerById(s, id)
    return c ? bubbleOf(c) : null
  })
  if (!bubble) return null
  return (
    <Html position={[0, BUBBLE_HEIGHT, 0]} center zIndexRange={[1, 0]} pointerEvents="none">
      <div className={`bubble bubble-${bubble}`}>{ICONS[bubble]}</div>
    </Html>
  )
}
