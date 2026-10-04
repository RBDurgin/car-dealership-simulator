import { OBSTACLES } from '../sim/world'
import { grid } from './runtime'

const HEIGHT = 1.2

export function Obstacles() {
  return (
    <>
      {OBSTACLES.map((r) => {
        const a = grid.tileToWorld(r.tx, r.tz)
        const cx = a.x + (r.w - 1) / 2
        const cz = a.z + (r.h - 1) / 2
        return (
          <mesh
            key={`${r.tx},${r.tz}`}
            position={[cx, HEIGHT / 2, cz]}
            castShadow
            receiveShadow
            // Swallow clicks so they don't fall through to the ground behind the obstacle.
            onPointerDown={(e) => e.stopPropagation()}
          >
            <boxGeometry args={[r.w, HEIGHT, r.h]} />
            <meshStandardMaterial color="#8d8f98" />
          </mesh>
        )
      })}
    </>
  )
}
