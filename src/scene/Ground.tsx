import type { ThreeEvent } from '@react-three/fiber'
import { useGame } from '../state/store'
import { grid } from './runtime'

// Larger than the grid so the world's edge stays off screen; clicks outside the grid are ignored.
const SIZE = 160

export function Ground() {
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    const { tx, tz } = grid.worldToTile(e.point.x, e.point.z)
    if (grid.isWalkable(tx, tz)) useGame.getState().issueMoveOrder(tx, tz)
  }

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow onPointerDown={onPointerDown}>
      <planeGeometry args={[SIZE, SIZE]} />
      <meshStandardMaterial color="#6f8f5a" />
    </mesh>
  )
}
