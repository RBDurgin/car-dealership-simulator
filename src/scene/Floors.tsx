import { useEffect, useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { slotTier } from '../sim/improvements'
import { PARKING_SPACES, spaceOpen, type ExpansionId, type ZoneKind } from '../sim/layout'
import { mergePlanes, type FlatRect } from './mergePlanes'
import { layout, rectBounds } from './runtime'
import { useGround, useUpNow } from './useUpNow'
import { useWeather, wetLook } from './useWeather'

const ZONE_COLORS: Record<ZoneKind, string> = {
  grass: '#6f8f5a',
  asphalt: '#4a4e55',
  concrete: '#b9b4a9',
  sidewalk: '#c8c3b8',
  road: '#33363b',
  showroom: '#e9e7e2',
  office: '#7d8aa0',
  lounge: '#cdb48f',
  parcel: '#7d8f55',
  garage: '#8f9296',
}

// The street runs past the whole property, so these zones extend to the horizon.
const EXTEND_X: ReadonlySet<ZoneKind> = new Set(['road', 'sidewalk'])
const HORIZON = 160
/** Floors that are out in the weather, so get wet in the rain. */
const OUTDOOR: ReadonlySet<ZoneKind> = new Set([
  'grass',
  'asphalt',
  'concrete',
  'sidewalk',
  'road',
  'parcel',
])
const STRIPE = 0.08
/** Parking stripes and the road's dashes sit just above the floors. */
const MARKING_Y = 0.025

/** Flat rects of one colour, merged into a single mesh (one draw call), rebuilt only when they change. */
function FlatPlanes({
  rects,
  color,
  wet = false,
}: {
  rects: readonly FlatRect[]
  color: string
  wet?: boolean
}) {
  const geometry = useMemo(() => mergePlanes(rects), [rects])
  useEffect(() => () => geometry?.dispose(), [geometry])
  const look = wetLook(color, wet)
  if (!geometry) return null
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={look.color} roughness={look.roughness} />
    </mesh>
  )
}

/** Pixels per tile of the polished floor's texture. */
const TILE_PX = 64

/** Big glossy tiles with thin grout lines, one per grid tile, for the polished floor upgrade. */
function usePolishedTexture(w: number, h: number): CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TILE_PX
    canvas.height = TILE_PX
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f4f2ee'
    ctx.fillRect(0, 0, TILE_PX, TILE_PX)
    ctx.fillStyle = '#c9c4ba'
    ctx.fillRect(0, 0, TILE_PX, 2)
    ctx.fillRect(0, 0, 2, TILE_PX)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.repeat.set(w, h)
    tex.anisotropy = 8
    return tex
  }, [w, h])
}

/** The showroom floor: plain, or polished tiles once that upgrade is in. */
function ShowroomFloor({
  x,
  z,
  w,
  h,
  y,
}: {
  x: number
  z: number
  w: number
  h: number
  y: number
}) {
  const polished = slotTier(useUpNow(), 'floor') > 0
  const texture = usePolishedTexture(w, h)
  const rects = useMemo(() => [{ x, z, w, h, y }], [x, z, w, h, y])
  if (!polished) return <FlatPlanes rects={rects} color={ZONE_COLORS.showroom} />
  return (
    <mesh position={[x, y, z]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={texture} roughness={0.15} metalness={0.15} />
    </mesh>
  )
}

/** Side lines of every open parking space, deduplicated where neighbours share an edge. */
function useStripes(ground: readonly ExpansionId[]) {
  return useMemo(() => {
    const lines = new Map<string, FlatRect>()
    for (const [i, { rect, facing }] of PARKING_SPACES.entries()) {
      if (!spaceOpen(i, ground)) continue
      const b = rectBounds(rect)
      if (facing === 0 || facing === 2) {
        for (const x of [b.x - b.w / 2, b.x + b.w / 2]) {
          lines.set(`x${x},${b.z}`, { x, z: b.z, w: STRIPE, h: b.h, y: MARKING_Y })
        }
      } else {
        for (const z of [b.z - b.h / 2, b.z + b.h / 2]) {
          lines.set(`z${b.x},${z}`, { x: b.x, z, w: b.w, h: STRIPE, y: MARKING_Y })
        }
      }
    }
    return [...lines.values()]
  }, [ground])
}

/** Every zone's floor but the showroom's, by kind, as the layout has them now. */
function useZoneFloors(ground: readonly ExpansionId[]) {
  return useMemo(() => {
    const byKind = new Map<ZoneKind, FlatRect[]>()
    const showroom: (FlatRect & { key: number })[] = []
    layout.areas.forEach((zone, i) => {
      const b = rectBounds(zone.rect)
      const wide = EXTEND_X.has(zone.kind)
      // Later zones sit a hair higher so overlaps never z-fight.
      const rect = {
        x: wide ? 0 : b.x,
        z: b.z,
        w: wide ? HORIZON : b.w,
        h: b.h,
        y: 0.004 + i * 0.002,
      }
      if (zone.kind === 'showroom') showroom.push({ ...rect, key: i })
      else byKind.set(zone.kind, [...(byKind.get(zone.kind) ?? []), rect])
    })
    const road = layout.areas.find((z) => z.kind === 'road')
    const roadBounds = road ? rectBounds(road.rect) : null
    const dashes: FlatRect[] = roadBounds
      ? Array.from({ length: HORIZON / 3 }, (_, i) => ({
          x: -HORIZON / 2 + i * 3,
          z: roadBounds.z,
          w: 1.5,
          h: 0.12,
          y: MARKING_Y,
        }))
      : []
    return { byKind: [...byKind.entries()], showroom, roadBounds, dashes }
    // `ground` isn't read: the layout is rebuilt in place when the expansions up change.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- rebuilt in place
  }, [ground])
}

/**
 * The floors as the layout has them today, redrawn when an expansion changes
 * it: one mesh per zone colour, one for the parking stripes and one for the
 * road's dashes (18e merged them from about a hundred meshes).
 */
export function Floors() {
  const ground = useGround()
  const stripes = useStripes(ground)
  const { byKind, showroom, roadBounds, dashes } = useZoneFloors(ground)
  const raining = useWeather() === 'rain'

  return (
    <group>
      {byKind.map(([kind, rects]) => (
        <FlatPlanes
          key={kind}
          rects={rects}
          color={ZONE_COLORS[kind]}
          wet={raining && OUTDOOR.has(kind)}
        />
      ))}
      {showroom.map(({ key, ...b }) => (
        <ShowroomFloor key={key} x={b.x} z={b.z} w={b.w} h={b.h} y={b.y} />
      ))}
      <FlatPlanes rects={stripes} color="#f4f4f0" wet={raining} />
      <FlatPlanes rects={dashes} color="#e8c547" wet={raining} />
      {/* curb between the sidewalk and the road */}
      {roadBounds && (
        <mesh position={[0, 0.06, roadBounds.z - roadBounds.h / 2]} receiveShadow>
          <boxGeometry args={[HORIZON, 0.12, 0.18]} />
          <meshStandardMaterial color="#d6d2c8" />
        </mesh>
      )}
    </group>
  )
}
