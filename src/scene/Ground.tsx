import type { ThreeEvent } from '@react-three/fiber'
import { isTap, isTouch } from '../input/touch'
import { useGame } from '../state/store'
import { grid } from './runtime'

// Larger than the grid so the world's edge stays off screen; clicks outside the grid are ignored.
const SIZE = 160

function moveTo(e: ThreeEvent<PointerEvent>) {
  const { tx, tz } = grid.worldToTile(e.point.x, e.point.z)
  if (grid.isWalkable(tx, tz)) useGame.getState().issueMoveOrder(tx, tz)
}

export function Ground() {
  // A mouse moves on press; a finger on a tap, so a pinch never sends the player off.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0 && !isTouch(e.nativeEvent)) moveTo(e)
  }
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (isTouch(e.nativeEvent) && isTap(e.pointerId)) moveTo(e)
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      receiveShadow
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <planeGeometry args={[SIZE, SIZE]} />
      <meshStandardMaterial color="#6f8f5a" />
    </mesh>
  )
}
