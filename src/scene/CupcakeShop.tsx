import { useEffect, useMemo } from 'react'
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { GRID_HEIGHT, GRID_WIDTH } from '../sim/layout'

/**
 * Nazma's cupcake shop across the road: scenery past the grid's south edge,
 * placed in world space with no tiles, so pathfinding and the crowd never see
 * it. Static meshes with shared materials and no shadows; the sign is a
 * canvas texture. Nothing here handles the pointer, so clicks fall through to
 * the ground (which ignores them off the grid). There from day 1.
 *
 * Lot coordinates: x east from `ORIGIN_X`, z south from the road's far edge.
 * Nazma steps out at `SHOP_GATE` (tx 18), which is x 13.5 here, on the patio
 * in front of the door.
 */

/** The plot's north-west corner: across the road from the driveway, at the road's far edge. */
const ORIGIN_X = 5 - GRID_WIDTH / 2
const ORIGIN_Z = GRID_HEIGHT / 2
const WIDTH = 28
const DEPTH = 14
/** His own sidewalk along the road. */
const WALK = 1.6
/** The shop, set back behind its patio. */
const SHOP = { x0: 8, x1: 19, z0: 6, z1: 12, h: 3.4 }
/** The door, facing the road, in line with `SHOP_GATE`. */
const DOOR = { x: 13.5, w: 1.4, h: 2.3 }
/** Where the bikes park, out front east of the patio (used from C4). */
const BIKE_SPOT = { x: 21.5, z: 3.2 }
/** The café tables either side of the path to the door. */
const TABLES: [number, number][] = [
  [10.2, 3.8],
  [16.8, 3.8],
]

const mat = (color: string, roughness = 0.85, metalness = 0) =>
  new MeshStandardMaterial({ color, roughness, metalness })
const SIDEWALK = mat('#b9b4a8', 0.95)
const PATIO = mat('#e8d9c4', 0.9)
const GRASS = mat('#7fae6a', 1)
const WALL = mat('#fbe3ec')
const BASE = mat('#c9a6b4')
const ROOF = mat('#f4f1ea', 0.95)
const GLASS = mat('#5b7f99', 0.2, 0.5)
const DOOR_MAT = mat('#a8557a', 0.6)
const STRIPE_A = mat('#f472b6', 0.8)
const STRIPE_B = mat('#fff7fb', 0.8)
const POLE = mat('#5b6168', 0.5, 0.5)
const BOARD = mat('#3b1d2e', 0.7)
const TABLE = mat('#ffffff', 0.5)
const CHAIR = mat('#93c5fd', 0.6)
const WRAPPER = mat('#d97706', 0.8)
const FROSTING = mat('#f9a8d4', 0.7)
const CHERRY = mat('#dc2626', 0.4)
const SPRINKLE = mat('#60a5fa', 0.6)
const PAINT = mat('#f4f1ea', 0.9)
const HEDGE = mat('#4d7c3a', 1)

/** A canvas texture `w` by `h`, drawn by `draw`. */
function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function useSignTexture(): CanvasTexture {
  const tex = useMemo(
    () =>
      canvasTexture(768, 192, (ctx) => {
        const { width, height } = ctx.canvas
        ctx.fillStyle = '#3b1d2e'
        ctx.fillRect(0, 0, width, height)
        ctx.strokeStyle = '#f9a8d4'
        ctx.lineWidth = 10
        ctx.strokeRect(12, 12, width - 24, height - 24)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#fff7fb'
        ctx.font = 'italic bold 88px Georgia, serif'
        ctx.fillText("Nazma's", width / 2, 84, width - 60)
        ctx.fillStyle = '#f9a8d4'
        ctx.font = '600 30px system-ui, sans-serif'
        ctx.fillText('CUPCAKES  ·  COFFEE  ·  SMILES', width / 2, 152, width - 60)
      }),
    [],
  )
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

/** A box from (x0, z0) to (x1, z1) in plot coordinates, `h` high, standing at `y`. */
function Block({
  x0,
  x1,
  z0,
  z1,
  h,
  y = 0,
  material,
}: {
  x0: number
  x1: number
  z0: number
  z1: number
  h: number
  y?: number
  material: MeshStandardMaterial
}) {
  return (
    <mesh position={[(x0 + x1) / 2, y + h / 2, (z0 + z1) / 2]} material={material}>
      <boxGeometry args={[x1 - x0, h, z1 - z0]} />
    </mesh>
  )
}

/** A flat patch on the ground, `y` up to keep it off the patches under it. */
function Patch({
  x0,
  x1,
  z0,
  z1,
  y,
  material,
}: {
  x0: number
  x1: number
  z0: number
  z1: number
  y: number
  material: MeshStandardMaterial
}) {
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[(x0 + x1) / 2, y, (z0 + z1) / 2]}
      material={material}
    >
      <planeGeometry args={[x1 - x0, z1 - z0]} />
    </mesh>
  )
}

/** A striped awning over the shop front, sloping down toward the road. */
function Awning() {
  const s = SHOP
  const stripes = 11
  const w = (s.x1 - s.x0) / stripes
  const depth = 1.5
  const tilt = 0.35
  return (
    <group position={[0, 2.3, s.z0 - depth / 2 + 0.1]} rotation-x={-tilt}>
      {Array.from({ length: stripes }, (_, i) => (
        <mesh
          key={i}
          position={[s.x0 + w * (i + 0.5), 0, 0]}
          material={i % 2 === 0 ? STRIPE_A : STRIPE_B}
        >
          <boxGeometry args={[w, 0.06, depth]} />
        </mesh>
      ))}
    </group>
  )
}

/** The giant cupcake on the roof: a fluted wrapper, a swirl of frosting and a cherry. */
function GiantCupcake({ x, z, y }: { x: number; z: number; y: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position-y={0.55} material={WRAPPER}>
        <cylinderGeometry args={[1.05, 0.8, 1.1, 12]} />
      </mesh>
      <mesh position-y={1.25} material={FROSTING}>
        <sphereGeometry args={[1.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position-y={1.75} material={FROSTING}>
        <coneGeometry args={[0.75, 1, 12]} />
      </mesh>
      <mesh position-y={2.38} material={CHERRY}>
        <sphereGeometry args={[0.22, 10, 8]} />
      </mesh>
      {[0, 1.3, 2.5, 3.7, 4.9].map((a, i) => (
        <mesh
          key={a}
          position={[Math.cos(a) * 0.9, 1.45 + (i % 2) * 0.12, Math.sin(a) * 0.9]}
          rotation-z={a}
          material={SPRINKLE}
        >
          <boxGeometry args={[0.22, 0.06, 0.06]} />
        </mesh>
      ))}
    </group>
  )
}

/** The shop: pastel walls on a darker plinth, glass either side of the door, the sign over the awning. */
function Shop() {
  const map = useSignTexture()
  const s = SHOP
  const signW = 6
  const signH = 0.8
  return (
    <>
      <Block x0={s.x0} x1={s.x1} z0={s.z0} z1={s.z1} h={0.4} material={BASE} />
      <Block x0={s.x0} x1={s.x1} z0={s.z0} z1={s.z1} h={s.h - 0.4} y={0.4} material={WALL} />
      {/* The roof sits a little over the walls' top, so no two faces share a plane. */}
      <Block
        x0={s.x0 - 0.15}
        x1={s.x1 + 0.15}
        z0={s.z0 - 0.15}
        z1={s.z1 + 0.15}
        h={0.2}
        y={s.h}
        material={ROOF}
      />
      {[
        [s.x0 + 0.8, DOOR.x - DOOR.w / 2 - 0.4],
        [DOOR.x + DOOR.w / 2 + 0.4, s.x1 - 0.8],
      ].map(([x0, x1]) => (
        <Block
          key={x0}
          x0={x0}
          x1={x1}
          z0={s.z0 - 0.05}
          z1={s.z0}
          h={1.6}
          y={0.8}
          material={GLASS}
        />
      ))}
      <Block
        x0={DOOR.x - DOOR.w / 2}
        x1={DOOR.x + DOOR.w / 2}
        z0={s.z0 - 0.05}
        z1={s.z0}
        h={DOOR.h}
        y={0.05}
        material={DOOR_MAT}
      />
      <Awning />
      {/* The sign, on the front wall above the awning, its face to the road. */}
      <mesh position={[DOOR.x, 3, s.z0 - 0.06]} material={BOARD}>
        <boxGeometry args={[signW, signH, 0.08]} />
      </mesh>
      <mesh position={[DOOR.x, 3, s.z0 - 0.105]} rotation-y={Math.PI}>
        <planeGeometry args={[signW, signH]} />
        <meshStandardMaterial map={map} roughness={0.7} />
      </mesh>
      <GiantCupcake x={(s.x0 + s.x1) / 2} z={(s.z0 + s.z1) / 2} y={s.h + 0.2} />
    </>
  )
}

/** A round café table with two chairs. */
function CafeTable({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.36} material={POLE}>
        <cylinderGeometry args={[0.05, 0.05, 0.72, 6]} />
      </mesh>
      <mesh position-y={0.74} material={TABLE}>
        <cylinderGeometry args={[0.45, 0.45, 0.05, 14]} />
      </mesh>
      {[-0.75, 0.75].map((dx) => (
        <group key={dx} position-x={dx}>
          <mesh position-y={0.24} material={CHAIR}>
            <boxGeometry args={[0.4, 0.06, 0.4]} />
          </mesh>
          <mesh position={[Math.sign(dx) * 0.18, 0.5, 0]} material={CHAIR}>
            <boxGeometry args={[0.05, 0.5, 0.4]} />
          </mesh>
          <mesh position-y={0.11} material={POLE}>
            <boxGeometry args={[0.05, 0.22, 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Nazma's cupcake shop and its patio, café tables, lawn and the bikes' parking bay. */
export function CupcakeShop() {
  return (
    <group position={[ORIGIN_X, 0, ORIGIN_Z]}>
      <Patch x0={0} x1={WIDTH} z0={0} z1={WALK} y={0.012} material={SIDEWALK} />
      <Patch x0={0} x1={WIDTH} z0={WALK} z1={DEPTH} y={0.01} material={GRASS} />
      <Patch x0={7} x1={20} z0={WALK} z1={SHOP.z0} y={0.014} material={PATIO} />
      {/* The bikes' bay: a painted box on the patio's east side. */}
      {[
        [BIKE_SPOT.x - 1, BIKE_SPOT.x + 1, BIKE_SPOT.z - 1.1, BIKE_SPOT.z - 1.02],
        [BIKE_SPOT.x - 1, BIKE_SPOT.x + 1, BIKE_SPOT.z + 1.02, BIKE_SPOT.z + 1.1],
        [BIKE_SPOT.x + 0.92, BIKE_SPOT.x + 1, BIKE_SPOT.z - 1.1, BIKE_SPOT.z + 1.1],
      ].map(([x0, x1, z0, z1]) => (
        <Patch
          key={`${x0},${z0},${x1}`}
          x0={x0}
          x1={x1}
          z0={z0}
          z1={z1}
          y={0.016}
          material={PAINT}
        />
      ))}
      <Patch
        x0={BIKE_SPOT.x - 1.1}
        x1={BIKE_SPOT.x + 1.1}
        z0={BIKE_SPOT.z - 1.2}
        z1={BIKE_SPOT.z + 1.2}
        y={0.013}
        material={PATIO}
      />
      {/* Hedges either side of the plot's front, leaving the patio open to the road. */}
      <Block x0={0.3} x1={6.5} z0={WALK + 0.2} z1={WALK + 0.8} h={0.7} material={HEDGE} />
      <Block x0={23} x1={WIDTH - 0.3} z0={WALK + 0.2} z1={WALK + 0.8} h={0.7} material={HEDGE} />
      {TABLES.map(([x, z]) => (
        <CafeTable key={x} x={x} z={z} />
      ))}
      <Shop />
    </group>
  )
}
