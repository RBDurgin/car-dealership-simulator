import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Customer } from '../sim/customers'
import { DESK_PHONE_ID, KIOSK_ID, OFFICE_COMPUTER_ID } from '../sim/layout'
import {
  sellerWaiting,
  toAppraise,
  TUTORIALS,
  wantsDriveNow,
  type WorldTarget,
} from '../sim/tutorials'
import { useGame } from '../state/store'
import { customerPos, grid, layout, playerPos, vehiclePos } from './runtime'

type PropTarget = 'computer' | 'kiosk' | 'desk' | 'phone'

/** Each prop target's prop, found in the live layout (it moves with the expansions). */
const PROP_IDS: Record<PropTarget, string> = {
  computer: OFFICE_COMPUTER_ID,
  kiosk: KIOSK_ID,
  desk: 'manager-desk',
  phone: DESK_PHONE_ID,
}

/** A customer the player could greet: waiting, nobody with them, here to buy. */
const greetable = (c: Customer) =>
  c.phase === 'waiting' && c.handlerId === null && !c.selling && !c.service

/** The customers each moving target follows, and whether it's their car (by customer id) or them. */
const FOLLOWS: Record<
  Exclude<WorldTarget, PropTarget>,
  { pick: (c: Customer) => boolean; car?: true }
> = {
  customer: { pick: greetable },
  seller: { pick: sellerWaiting },
  driveShopper: { pick: wantsDriveNow },
  vehicle: { pick: toAppraise, car: true },
}

/** Height of the arrow's tip over the floor, and how far it bobs. */
const HEIGHT = 2.2
const BOB = 0.25

/** Where the nearest customer `pick` takes stands (or, with `car`, their car is), or null. */
function nearest(
  pick: (c: Customer) => boolean,
  car: boolean | undefined,
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let bestD = Infinity
  for (const c of useGame.getState().customers) {
    if (!pick(c)) continue
    const p = car ? vehiclePos.get(c.id)?.pos : customerPos.get(c.id)
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
  if (!(target in PROP_IDS)) return <FollowMarker {...FOLLOWS[target as keyof typeof FOLLOWS]} />
  const prop = layout.props.find((p) => p.id === PROP_IDS[target as PropTarget])
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

/** The arrow over the nearest customer (or car) of a kind, hidden while there's none. */
function FollowMarker({ pick, car }: { pick: (c: Customer) => boolean; car?: boolean }) {
  const holder = useRef<Group>(null)
  useFrame(() => {
    const g = holder.current
    if (!g) return
    const at = nearest(pick, car)
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
