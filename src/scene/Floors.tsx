import { useMemo } from 'react'
import { PARKING_SPACES, ZONES, type ZoneKind } from '../sim/layout'
import { rectBounds } from './runtime'

const ZONE_COLORS: Record<ZoneKind, string> = {
  grass: '#6f8f5a',
  asphalt: '#4a4e55',
  concrete: '#b9b4a9',
  sidewalk: '#c8c3b8',
  road: '#33363b',
  showroom: '#e9e7e2',
  office: '#7d8aa0',
  lounge: '#cdb48f',
}

// The street runs past the whole property, so these zones extend to the horizon.
const EXTEND_X: ReadonlySet<ZoneKind> = new Set(['road', 'sidewalk'])
const HORIZON = 160
const STRIPE = 0.08

function Plane({
  x,
  z,
  w,
  h,
  y,
  color,
}: {
  x: number
  z: number
  w: number
  h: number
  y: number
  color: string
}) {
  return (
    <mesh position={[x, y, z]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

/** Side lines of every parking space, deduplicated where neighbours share an edge. */
function useStripes() {
  return useMemo(() => {
    const lines = new Map<string, { x: number; z: number; w: number; h: number }>()
    for (const { rect, facing } of PARKING_SPACES) {
      const b = rectBounds(rect)
      if (facing === 0 || facing === 2) {
        for (const x of [b.x - b.w / 2, b.x + b.w / 2]) {
          lines.set(`x${x},${b.z}`, { x, z: b.z, w: STRIPE, h: b.h })
        }
      } else {
        for (const z of [b.z - b.h / 2, b.z + b.h / 2]) {
          lines.set(`z${b.x},${z}`, { x: b.x, z, w: b.w, h: STRIPE })
        }
      }
    }
    return [...lines.entries()]
  }, [])
}

export function Floors() {
  const stripes = useStripes()
  const road = ZONES.find((z) => z.kind === 'road')
  const roadBounds = road ? rectBounds(road.rect) : null

  return (
    <group>
      {ZONES.map((zone, i) => {
        const b = rectBounds(zone.rect)
        const wide = EXTEND_X.has(zone.kind)
        return (
          <Plane
            key={i}
            x={wide ? 0 : b.x}
            z={b.z}
            w={wide ? HORIZON : b.w}
            h={b.h}
            // Later zones sit a hair higher so overlaps never z-fight.
            y={0.004 + i * 0.002}
            color={ZONE_COLORS[zone.kind]}
          />
        )
      })}

      {stripes.map(([key, s]) => (
        <Plane key={key} {...s} y={0.025} color="#f4f4f0" />
      ))}

      {roadBounds && (
        <>
          {Array.from({ length: HORIZON / 3 }, (_, i) => (
            <Plane
              key={i}
              x={-HORIZON / 2 + i * 3}
              z={roadBounds.z}
              w={1.5}
              h={0.12}
              y={0.025}
              color="#e8c547"
            />
          ))}
          {/* curb between the sidewalk and the road */}
          <mesh position={[0, 0.06, roadBounds.z - roadBounds.h / 2]} receiveShadow>
            <boxGeometry args={[HORIZON, 0.12, 0.18]} />
            <meshStandardMaterial color="#d6d2c8" />
          </mesh>
        </>
      )}
    </group>
  )
}
