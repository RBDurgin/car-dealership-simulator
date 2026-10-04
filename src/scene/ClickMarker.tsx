import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'
import { useGame } from '../state/store'
import { grid } from './runtime'

export function ClickMarker() {
  const order = useGame((s) => s.moveOrder)
  const ring = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    ring.current?.scale.setScalar(1 + 0.12 * Math.sin(clock.elapsedTime * 8))
  })

  if (!order) return null
  const { x, z } = grid.tileToWorld(order.tx, order.tz)
  return (
    <mesh ref={ring} key={order.id} position={[x, 0.03, z]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.3, 0.42, 32]} />
      <meshBasicMaterial color="#fde047" />
    </mesh>
  )
}
