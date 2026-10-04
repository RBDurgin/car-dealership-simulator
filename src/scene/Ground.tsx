import type { ThreeEvent } from '@react-three/fiber'
import { GRID_HEIGHT, GRID_WIDTH } from '../sim/world'
import { useGame } from '../state/store'
import { grid } from './runtime'

export function Ground() {
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    const { tx, tz } = grid.worldToTile(e.point.x, e.point.z)
    if (grid.isWalkable(tx, tz)) useGame.getState().issueMoveOrder(tx, tz)
  }

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow onPointerDown={onPointerDown}>
      <planeGeometry args={[GRID_WIDTH, GRID_HEIGHT]} />
      <meshStandardMaterial color="#6f8f5a" />
    </mesh>
  )
}
