import { useEffect, useMemo } from 'react'
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three'
import type { CarModel } from '../sim/layout'
import { GRID_HEIGHT, GRID_WIDTH } from '../sim/layout'
import { bannerText, type Rival } from '../sim/rival'
import { useGame } from '../state/store'
import { StaticCar } from './Props'

/**
 * Nazma's lot across the road: scenery past the grid's south edge, placed in
 * world space with no tiles, so pathfinding and the crowd never see it. Static
 * meshes with shared materials and no shadows; the sign and banner are canvas
 * textures. Nothing here handles the pointer, so clicks fall through to the
 * ground (which ignores them off the grid). Hidden until he announces it, a
 * building site until he opens, and boarded up while he's closed.
 */

/** The lot's north-west corner: across the road from the driveway, at the road's far edge. */
const ORIGIN_X = 5 - GRID_WIDTH / 2
const ORIGIN_Z = GRID_HEIGHT / 2
const WIDTH = 28
const DEPTH = 14
/** His own sidewalk along the road. */
const WALK = 1.6
/** The gap in his front fence, under the banner. */
const GATE = { x0: 12, x1: 16 }
const FENCE_H = 1.1
/** His showroom, at the back on the east side. */
const BUILDING = { x0: 15, x1: 26, z0: 8.5, z1: 13.2, h: 3.6 }
/** A building site is lower, in bare block, inside scaffolding. */
const SITE_H = 2

/** Parking spaces, front row first, nose to the road: his own stock, then what he stole. */
const STALLS: [number, number][] = [
  [3, 5],
  [6, 5],
  [9, 5],
  [19, 5],
  [22, 5],
  [25, 5],
  [3, 10.5],
  [6, 10.5],
  [9, 10.5],
]
const OWN_STOCK: CarModel[] = ['sedan', 'suv', 'hatchback-sports', 'truck', 'van']

const mat = (color: string, roughness = 0.85, metalness = 0) =>
  new MeshStandardMaterial({ color, roughness, metalness })
const ASPHALT = mat('#4b4e54', 0.95)
const SIDEWALK = mat('#b9b4a8', 0.95)
const FENCE = mat('#9aa1a8', 0.6, 0.4)
const WALL = mat('#e6dccb')
const BLOCK = mat('#a9a49b')
const GLASS = mat('#35546e', 0.2, 0.5)
const TRIM = mat('#ea580c', 0.6)
const PLANKS = mat('#8a6a48')
const POLE = mat('#5b6168', 0.5, 0.5)
const CONE = mat('#f97316', 0.7)
const BOARD = mat('#1f1f1f', 0.7)

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

/** Frees `tex` once it's replaced or unmounted. */
function useDisposed(tex: CanvasTexture): CanvasTexture {
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

function useNameTexture(name: string): CanvasTexture {
  const tex = useMemo(
    () =>
      canvasTexture(768, 192, (ctx) => {
        const { width, height } = ctx.canvas
        ctx.fillStyle = '#1f1f1f'
        ctx.fillRect(0, 0, width, height)
        ctx.strokeStyle = '#f97316'
        ctx.lineWidth = 10
        ctx.strokeRect(12, 12, width - 24, height - 24)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 80px system-ui, sans-serif'
        ctx.fillText(name.toUpperCase(), width / 2, 82, width - 60)
        ctx.fillStyle = '#fb923c'
        ctx.font = '600 32px system-ui, sans-serif'
        ctx.fillText('NEW  ·  USED  ·  LOW LOW PRICES', width / 2, 150, width - 60)
      }),
    [name],
  )
  return useDisposed(tex)
}

function useBannerTexture(text: string, closed: boolean): CanvasTexture {
  const tex = useMemo(
    () =>
      canvasTexture(512, 112, (ctx) => {
        const { width, height } = ctx.canvas
        ctx.fillStyle = closed ? '#7f1d1d' : '#ea580c'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#fde68a'
        ctx.fillRect(0, 0, width, 8)
        ctx.fillRect(0, height - 8, width, 8)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 64px system-ui, sans-serif'
        ctx.fillText(text, width / 2, height / 2 + 2, width - 32)
      }),
    [text, closed],
  )
  return useDisposed(tex)
}

/** A box from (x0, z0) to (x1, z1) in lot coordinates, `h` high, standing at `y`. */
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

/** A board `w` by `h` at (x, y, z), its texture on both faces (seen from the road and from the camera). */
function Board({
  x,
  y,
  z,
  w,
  h,
  map,
}: {
  x: number
  y: number
  z: number
  w: number
  h: number
  map: CanvasTexture
}) {
  return (
    <group position={[x, y, z]}>
      <mesh material={BOARD}>
        <boxGeometry args={[w, h, 0.08]} />
      </mesh>
      {[0, Math.PI].map((rot) => (
        <mesh key={rot} rotation-y={rot} position-z={rot === 0 ? 0.041 : -0.041}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={map} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/** The fence round the sides and back, and the front either side of the gate. */
function Fence() {
  const t = 0.08
  return (
    <>
      <Block x0={0} x1={GATE.x0} z0={WALK} z1={WALK + t} h={FENCE_H} material={FENCE} />
      <Block x0={GATE.x1} x1={WIDTH} z0={WALK} z1={WALK + t} h={FENCE_H} material={FENCE} />
      <Block x0={0} x1={t} z0={WALK} z1={DEPTH} h={FENCE_H} material={FENCE} />
      <Block x0={WIDTH - t} x1={WIDTH} z0={WALK} z1={DEPTH} h={FENCE_H} material={FENCE} />
      <Block x0={0} x1={WIDTH} z0={DEPTH - t} z1={DEPTH} h={FENCE_H} material={FENCE} />
    </>
  )
}

/** The offer banner over the gate, on two poles. */
function Banner({ rival }: { rival: Rival }) {
  const map = useBannerTexture(bannerText(rival), rival.status === 'closed')
  const poleH = 3.1
  return (
    <>
      {[GATE.x0 - 0.15, GATE.x1 + 0.15].map((x) => (
        <Block
          key={x}
          x0={x - 0.07}
          x1={x + 0.07}
          z0={WALK}
          z1={WALK + 0.14}
          h={poleH}
          material={POLE}
        />
      ))}
      <Board
        x={(GATE.x0 + GATE.x1) / 2}
        y={poleH - 0.55}
        z={WALK + 0.07}
        w={GATE.x1 - GATE.x0}
        h={0.875}
        map={map}
      />
    </>
  )
}

/** His showroom: walls, glass to the road (boarded while closed), an orange fascia and his name on the roof. */
function Showroom({ rival }: { rival: Rival }) {
  const map = useNameTexture(rival.name)
  const b = BUILDING
  const signW = b.x1 - b.x0 - 1.5
  return (
    <>
      <Block {...b} material={WALL} />
      <Block
        x0={b.x0 + 0.8}
        x1={b.x1 - 0.8}
        z0={b.z0 - 0.05}
        z1={b.z0}
        h={2.4}
        y={0.1}
        material={rival.status === 'closed' ? PLANKS : GLASS}
      />
      <Block
        x0={b.x0 - 0.05}
        x1={b.x1 + 0.05}
        z0={b.z0 - 0.1}
        z1={b.z1 + 0.05}
        h={0.5}
        y={b.h - 0.5}
        material={TRIM}
      />
      <Board
        x={(b.x0 + b.x1) / 2}
        y={b.h + 0.95}
        z={(b.z0 + b.z1) / 2}
        w={signW}
        h={signW / 4}
        map={map}
      />
      {[b.x0 + 1, b.x1 - 1].map((x) => (
        <Block
          key={x}
          x0={x - 0.06}
          x1={x + 0.06}
          z0={(b.z0 + b.z1) / 2 - 0.06}
          z1={(b.z0 + b.z1) / 2 + 0.06}
          h={0.3}
          y={b.h}
          material={POLE}
        />
      ))}
    </>
  )
}

/** While announced: a low block shell in scaffolding, and cones across the gate. */
function BuildingSite() {
  const b = BUILDING
  const poleH = SITE_H + 1.6
  return (
    <>
      <Block x0={b.x0} x1={b.x1} z0={b.z0} z1={b.z1} h={SITE_H} material={BLOCK} />
      {[b.x0 - 0.3, (b.x0 + b.x1) / 2, b.x1 + 0.3].flatMap((x) =>
        [b.z0 - 0.3, b.z1 + 0.3].map((z) => (
          <Block
            key={`${x},${z}`}
            x0={x - 0.05}
            x1={x + 0.05}
            z0={z - 0.05}
            z1={z + 0.05}
            h={poleH}
            material={POLE}
          />
        )),
      )}
      {[b.z0 - 0.3, b.z1 + 0.3].map((z) => (
        <Block
          key={z}
          x0={b.x0 - 0.35}
          x1={b.x1 + 0.35}
          z0={z - 0.04}
          z1={z + 0.04}
          h={0.08}
          y={poleH - 0.6}
          material={POLE}
        />
      ))}
      {[12.6, 14, 15.4].map((x) => (
        <mesh key={x} position={[x, 0.3, WALK + 0.6]} material={CONE}>
          <coneGeometry args={[0.18, 0.6, 8]} />
        </mesh>
      ))}
    </>
  )
}

/** Nazma's lot, as `rival.status` says: nothing, a building site, open with stock, or boarded up. */
export function RivalLot() {
  const rival = useGame((s) => s.rival)
  if (rival.status === 'unopened') return null
  const open = rival.status === 'open'
  const cars = open ? [...OWN_STOCK, ...rival.stolen].slice(0, STALLS.length) : []
  return (
    <group position={[ORIGIN_X, 0, ORIGIN_Z]}>
      <mesh rotation-x={-Math.PI / 2} position={[WIDTH / 2, 0.012, WALK / 2]} material={SIDEWALK}>
        <planeGeometry args={[WIDTH, WALK]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[WIDTH / 2, 0.01, (WALK + DEPTH) / 2]}
        material={ASPHALT}
      >
        <planeGeometry args={[WIDTH, DEPTH - WALK]} />
      </mesh>
      <Fence />
      <Banner rival={rival} />
      {rival.status === 'announced' ? <BuildingSite /> : <Showroom rival={rival} />}
      {cars.map((model, i) => (
        <group key={i} position={[STALLS[i][0], 0, STALLS[i][1]]} rotation-y={Math.PI}>
          <StaticCar model={model} />
        </group>
      ))}
    </group>
  )
}
