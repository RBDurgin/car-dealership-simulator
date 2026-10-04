import { useEffect, useLayoutEffect, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'
import { useGame } from '../state/store'
import { grid } from './runtime'

const WALKABLE = new Color('#22c55e')
const BLOCKED = new Color('#ef4444')

export function DebugGrid() {
  const show = useGame((s) => s.showGrid)
  const mesh = useRef<InstancedMesh>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG' && !e.repeat) useGame.getState().toggleGrid()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!show || !m) return
    const dummy = new Object3D()
    dummy.rotation.x = -Math.PI / 2
    for (let tz = 0; tz < grid.height; tz++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const i = grid.index(tx, tz)
        const { x, z } = grid.tileToWorld(tx, tz)
        dummy.position.set(x, 0.02, z)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        m.setColorAt(i, grid.isWalkable(tx, tz) ? WALKABLE : BLOCKED)
      }
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [show])

  if (!show) return null
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, grid.width * grid.height]}>
      <planeGeometry args={[0.92, 0.92]} />
      <meshBasicMaterial transparent opacity={0.35} depthWrite={false} />
    </instancedMesh>
  )
}
