import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { KIOSK_ID, OFFICE_COMPUTER_ID } from '../sim/layout'
import { TUTORIALS, type WorldTarget } from '../sim/tutorials'
import { useGame } from '../state/store'
import { grid, layout } from './runtime'

/** Each world target's prop, found in the live layout (it moves with the expansions). */
const PROP_IDS: Record<WorldTarget, string> = {
  computer: OFFICE_COMPUTER_ID,
  kiosk: KIOSK_ID,
}

/** Height of the arrow's tip over the floor, and how far it bobs. */
const HEIGHT = 2.2
const BOB = 0.25

/**
 * A bobbing arrow over the thing in the world a walkthrough's step points at.
 * It bobs in `useFrame` on a ref and never touches the store.
 */
export function CoachMarker() {
  const target = useGame((s) => (s.coach ? TUTORIALS[s.coach.id].steps[s.coach.step]?.world : null))
  const arrow = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (arrow.current) arrow.current.position.y = HEIGHT + BOB * Math.sin(clock.elapsedTime * 4)
  })

  if (!target) return null
  const prop = layout.props.find((p) => p.id === PROP_IDS[target])
  if (!prop) return null
  const { x, z } = grid.tileToWorld(
    prop.rect.tx + (prop.rect.w - 1) / 2,
    prop.rect.tz + (prop.rect.h - 1) / 2,
  )
  return (
    <group position={[x, 0, z]}>
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
    </group>
  )
}
