import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Customer } from '../sim/customers'
import { KIOSK_ID, OFFICE_COMPUTER_ID } from '../sim/layout'
import { TUTORIALS, type WorldTarget } from '../sim/tutorials'
import { useGame } from '../state/store'
import { customerPos, grid, layout, playerPos } from './runtime'

/** Each prop target's prop, found in the live layout (it moves with the expansions). */
const PROP_IDS: Record<Exclude<WorldTarget, 'customer'>, string> = {
  computer: OFFICE_COMPUTER_ID,
  kiosk: KIOSK_ID,
  desk: 'manager-desk',
}

/** Height of the arrow's tip over the floor, and how far it bobs. */
const HEIGHT = 2.2
const BOB = 0.25

/** A customer the player could greet: waiting, nobody with them, here to buy. */
const greetable = (c: Customer) =>
  c.phase === 'waiting' && c.handlerId === null && !c.selling && !c.service

/** Where the nearest customer waiting to be greeted stands, or null. */
function nearestWaiting(): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let bestD = Infinity
  for (const c of useGame.getState().customers) {
    if (!greetable(c)) continue
    const p = customerPos.get(c.id)
    if (!p) continue
    const d = (p.x - playerPos.x) ** 2 + (p.z - playerPos.z) ** 2
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/**
 * A bobbing arrow over the thing in the world a walkthrough's step points at.
 * It bobs (and follows a customer) in `useFrame` on refs and never touches the store.
 */
export function CoachMarker() {
  const target = useGame((s) => (s.coach ? TUTORIALS[s.coach.id].steps[s.coach.step]?.world : null))
  if (!target) return null
  if (target === 'customer') return <CustomerMarker />
  const prop = layout.props.find((p) => p.id === PROP_IDS[target])
  if (!prop) return null
  const { x, z } = grid.tileToWorld(
    prop.rect.tx + (prop.rect.w - 1) / 2,
    prop.rect.tz + (prop.rect.h - 1) / 2,
  )
  return (
    <group position={[x, 0, z]}>
      <Arrow />
    </group>
  )
}

/** The arrow over the nearest customer waiting to be greeted, hidden while there's none. */
function CustomerMarker() {
  const holder = useRef<Group>(null)
  useFrame(() => {
    const g = holder.current
    if (!g) return
    const at = nearestWaiting()
    g.visible = !!at
    if (at) g.position.set(at.x, 0, at.z)
  })
  return (
    <group ref={holder} visible={false}>
      <Arrow />
    </group>
  )
}

function Arrow() {
  const arrow = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (arrow.current) arrow.current.position.y = HEIGHT + BOB * Math.sin(clock.elapsedTime * 4)
  })
  return (
    <group ref={arrow} position-y={HEIGHT}>
      {/* Point down: a cone's tip is at +y, so it's turned over. */}
      <mesh rotation-x={Math.PI} position-y={0.25}>
        <coneGeometry args={[0.28, 0.5, 4]} />
        <meshBasicMaterial color="#fde047" />
      </mesh>
      <mesh position-y={0.75}>
        <boxGeometry args={[0.16, 0.5, 0.16]} />
        <meshBasicMaterial color="#fde047" />
      </mesh>
    </group>
  )
}
