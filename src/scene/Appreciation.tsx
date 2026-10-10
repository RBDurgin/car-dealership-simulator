import { useEffect, useMemo } from 'react'
import { CanvasTexture, DoubleSide, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { COOKOUT, isAppreciationDay } from '../sim/appreciation'
import { PROPS } from '../sim/layout'
import { useGame } from '../state/store'
import { rectBounds } from './runtime'

/**
 * The cookout on client appreciation day: a grill, two picnic tables and a
 * banner on two poles on the forecourt (`COOKOUT`, which `scene/runtime`
 * blocks for the day), and balloons tied to the dealership sign. Static
 * meshes with shared materials and no shadows; nothing handles the pointer.
 */

const mat = (color: string, roughness = 0.8, metalness = 0) =>
  new MeshStandardMaterial({ color, roughness, metalness })
const GRILL = mat('#26282c', 0.5, 0.6)
const COALS = new MeshStandardMaterial({
  color: '#7c2d12',
  emissive: '#f97316',
  emissiveIntensity: 0.8,
})
const WOOD = mat('#a0703f')
const CLOTH = mat('#dc2626', 0.9)
const PLATE = mat('#f5f5f4', 0.6)
const POLE = mat('#5b6168', 0.5, 0.5)
const STRING = mat('#e5e7eb', 0.9)
const BALLOONS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#ec4899'].map((c) => mat(c, 0.35))

const BANNER_W = 4.2
const BANNER_H = 0.8
const BANNER_Y = 2.1

function useBannerTexture(): CanvasTexture {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 122
    const ctx = canvas.getContext('2d')!
    const { width, height } = canvas
    ctx.fillStyle = '#1d4ed8'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#facc15'
    ctx.fillRect(0, 0, width, 8)
    ctx.fillRect(0, height - 8, width, 8)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 54px system-ui, sans-serif'
    ctx.fillText('CLIENT APPRECIATION DAY', width / 2, height / 2 + 2, width - 40)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

/** A picnic table running north–south, its benches either side. */
function Table({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={Math.PI / 2}>
      <mesh position-y={0.72} material={CLOTH}>
        <boxGeometry args={[1.6, 0.06, 0.7]} />
      </mesh>
      {[-0.65, 0.65].map((dx) => (
        <mesh key={dx} position={[dx, 0.36, 0]} material={WOOD}>
          <boxGeometry args={[0.08, 0.72, 0.6]} />
        </mesh>
      ))}
      {[-0.55, 0.55].map((dz) => (
        <mesh key={dz} position={[0, 0.42, dz]} material={WOOD}>
          <boxGeometry args={[1.6, 0.06, 0.26]} />
        </mesh>
      ))}
      {[-0.4, 0.1, 0.5].map((dx) => (
        <mesh key={dx} position={[dx, 0.76, (dx > 0 ? 1 : -1) * 0.12]} material={PLATE}>
          <cylinderGeometry args={[0.12, 0.12, 0.02, 12]} />
        </mesh>
      ))}
    </group>
  )
}

function Grill({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[-0.25, 0.25].map((dx) =>
        [-0.18, 0.18].map((dz) => (
          <mesh key={`${dx},${dz}`} position={[dx, 0.35, dz]} material={GRILL}>
            <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
          </mesh>
        )),
      )}
      <mesh position-y={0.8} material={GRILL}>
        <boxGeometry args={[0.7, 0.24, 0.5]} />
      </mesh>
      <mesh position-y={0.93} material={COALS}>
        <boxGeometry args={[0.6, 0.03, 0.4]} />
      </mesh>
      <mesh position={[0, 1.05, -0.24]} rotation-x={-0.5} material={GRILL}>
        <boxGeometry args={[0.7, 0.4, 0.04]} />
      </mesh>
    </group>
  )
}

/** A bunch of balloons on strings from a post's foot, floating just under the board. */
function Balloons({ x, z, colors }: { x: number; z: number; colors: number }) {
  const spots: [number, number, number][] = [
    [-0.18, 1.55, 0.05],
    [0.15, 1.7, -0.05],
    [0, 1.4, 0.15],
  ]
  return (
    <group position={[x, 0, z]}>
      {spots.map(([dx, y, dz], i) => (
        <group key={i}>
          <mesh position={[dx / 2, y / 2, dz / 2]} material={STRING}>
            <cylinderGeometry args={[0.008, 0.008, y, 4]} />
          </mesh>
          <mesh
            position={[dx, y + 0.18, dz]}
            scale-y={1.2}
            material={BALLOONS[(i + colors) % BALLOONS.length]}
          >
            <sphereGeometry args={[0.18, 12, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const SIGN = PROPS.find((p) => p.id === 'sign')!

/** Up only on client appreciation day. */
export function Appreciation() {
  const on = useGame((s) => isAppreciationDay(s.appreciation, s.clock.day))
  if (!on) return null
  return <Cookout />
}

function Cookout() {
  const banner = useBannerTexture()
  const b = rectBounds(COOKOUT)
  const sign = rectBounds(SIGN.rect)
  const west = b.x - b.w / 2
  return (
    <>
      <group position={[b.x, 0, b.z]}>
        {[-BANNER_W / 2, BANNER_W / 2].map((dx) => (
          <mesh
            key={dx}
            position={[dx, BANNER_Y / 2 + BANNER_H / 2, -b.h / 2 + 0.2]}
            material={POLE}
          >
            <cylinderGeometry args={[0.05, 0.05, BANNER_Y + BANNER_H, 8]} />
          </mesh>
        ))}
        <mesh position={[0, BANNER_Y, -b.h / 2 + 0.2]}>
          <planeGeometry args={[BANNER_W, BANNER_H]} />
          <meshStandardMaterial map={banner} side={DoubleSide} roughness={0.9} />
        </mesh>
      </group>
      <Grill x={west + 0.7} z={b.z} />
      <Table x={b.x - 0.3} z={b.z + 0.1} />
      <Table x={b.x + 1.5} z={b.z + 0.1} />
      <Balloons x={sign.x - 1.1} z={sign.z + 0.3} colors={0} />
      <Balloons x={sign.x + 1.1} z={sign.z + 0.3} colors={2} />
    </>
  )
}
