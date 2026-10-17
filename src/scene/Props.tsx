import { RoundedBox, useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  AdditiveBlending,
  Box3,
  CanvasTexture,
  CircleGeometry,
  Color,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
} from 'three'
import type { Vec2 } from '../sim/grid'
import { improvementProps, slotTier, swappedModel } from '../sim/improvements'
import { availableCars, carProp, type InventoryCar } from '../sim/inventory'
import { calendarOf, monthLabel } from '../sim/calendar'
import { CAR_MODELS } from '../sim/customers'
import { MODEL_TIER } from '../sim/franchise'
import {
  buildLayout,
  FURNITURE_SCALE,
  platformOpen,
  PLATFORMS,
  type ExpansionId,
  type CarModel,
  type Prop,
  type PropModel,
  type Rect,
} from '../sim/layout'
import { PLAYER_RADIUS } from '../sim/movement'
import { upNow } from '../state/selectors'
import { useGame } from '../state/store'
import { Interactable } from './Interactable'
import { customerPos, interactables, layout, playerPos, rectBounds } from './runtime'
import { useGround, useUpNow } from './useUpNow'

const BASE = `${import.meta.env.BASE_URL}models`
const CAR_SCALE = 0.95
const PLATFORM_HEIGHT = 0.12

interface ModelDef {
  url: string
  scale: number
  /** Extra yaw so the model's front faces +z at facing 0. */
  yaw?: number
  /** Shrink below `scale` where needed so the model stays inside its prop's footprint. */
  fit?: boolean
  /** `'receive'` for small things whose shadow doesn't read: a draw call saved each. */
  shadow?: 'receive'
}

const car = (name: string): ModelDef => ({ url: `${BASE}/cars/${name}.glb`, scale: CAR_SCALE })
const furniture = (
  name: string,
  opts: { yaw?: number; fit?: boolean; shadow?: 'receive' } = {},
): ModelDef => ({
  url: `${BASE}/furniture/${name}.glb`,
  scale: FURNITURE_SCALE,
  ...opts,
})

/** Small furniture: its shadow doesn't read, so it doesn't cast one. */
const SMALL = { shadow: 'receive' } as const

const MODELS: Record<
  Exclude<PropModel, 'sign' | 'forSaleSign' | 'deskPhone' | 'fridge' | 'plaque'>,
  ModelDef
> = {
  sedan: car('sedan'),
  'sedan-sports': car('sedan-sports'),
  suv: car('suv'),
  'suv-luxury': car('suv-luxury'),
  'hatchback-sports': car('hatchback-sports'),
  van: car('van'),
  truck: car('truck'),
  desk: furniture('desk'),
  deskCorner: furniture('deskCorner', { fit: true }),
  chairDesk: furniture('chairDesk'),
  chairCushion: furniture('chairCushion'),
  pottedPlant: furniture('pottedPlant'),
  plantSmall1: furniture('plantSmall1', SMALL),
  kitchenCoffeeMachine: furniture('kitchenCoffeeMachine', SMALL),
  kitchenCabinet: furniture('kitchenCabinet'),
  loungeSofa: furniture('loungeSofa', { fit: true }),
  loungeDesignSofa: furniture('loungeDesignSofa', { fit: true }),
  cabinetTelevision: furniture('cabinetTelevision'),
  televisionModern: furniture('televisionModern', SMALL),
  kitchenBar: furniture('kitchenBar'),
  stoolBar: furniture('stoolBar', SMALL),
  tableCoffeeSquare: furniture('tableCoffeeSquare'),
  computerScreen: furniture('computerScreen', SMALL),
  bookcaseClosedWide: furniture('bookcaseClosedWide'),
  trashcan: furniture('trashcan', SMALL),
}

/**
 * The models day one draws (the first layout's furniture and the cars a
 * Bronze dealer stocks) load with the page. The rest (luxury cars, the
 * wing's and the improvements' furniture) load the first time they're drawn,
 * each in its own Suspense, so nothing else blinks meanwhile.
 */
const DAY_ONE = new Set<PropModel>([
  ...buildLayout().props.map((p) => p.model),
  ...CAR_MODELS.filter((m) => !MODEL_TIER[m]),
])
for (const [model, def] of Object.entries(MODELS)) {
  if (DAY_ONE.has(model as PropModel)) useGLTF.preload(def.url)
}

/**
 * Clones a GLB scene and recenters it so its footprint is centered on x/z and it
 * rests on y=0. Clones share the model's materials; each mesh keeps its own in
 * `userData.base`, for `useDirt` to tint from. Without `shadows` it neither
 * casts nor receives them. Also returns the model's unscaled size.
 */
function useCenteredModel(
  url: string,
  shadows: boolean | 'receive' = true,
): { object: Object3D; size: Vector3 } {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = shadows === true
      mesh.receiveShadow = shadows !== false
      mesh.userData.base = mesh.material
    })
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root)
    const c = box.getCenter(new Vector3())
    root.position.set(-c.x, -box.min.y, -c.z)
    return { object: root, size: box.getSize(new Vector3()) }
  }, [scene, shadows])
}

/** Paint tint and roughness of a spotless car, and of a filthy one. */
const CLEAN_TINT = new Color('#ffffff')
const DIRTY_TINT = new Color('#8c7a5e')
const CLEAN_ROUGHNESS = 0.55
const DIRTY_ROUGHNESS = 1
/** A worn used car's paint fades toward this, by up to `MAX_FADE` for a wreck. */
const FADED_TINT = new Color('#c9c4ba')
const MAX_FADE = 0.5
/**
 * Dirt and wear are drawn in steps, so cars as dirty and as worn as each
 * other share one material: a few dozen at most, never freed, instead of a
 * copy per car.
 */
const DIRT_STEPS = 10
const WEAR_STEPS = 5
const tinted = new Map<string, MeshStandardMaterial>()

/** `base` faded by `condition` (1 for a new car), then dulled toward a dusty brown by dirt. */
function tintedMaterial(
  base: MeshStandardMaterial,
  cleanliness: number,
  condition: number,
): MeshStandardMaterial {
  const dirt = Math.round((1 - cleanliness) * DIRT_STEPS) / DIRT_STEPS
  const wear = Math.round((1 - condition) * WEAR_STEPS) / WEAR_STEPS
  const key = `${base.uuid}:${dirt}:${wear}`
  let m = tinted.get(key)
  if (!m) {
    m = base.clone()
    m.color
      .copy(CLEAN_TINT)
      .lerp(FADED_TINT, wear * MAX_FADE)
      .lerp(DIRTY_TINT, dirt)
    m.roughness = CLEAN_ROUGHNESS + (DIRTY_ROUGHNESS - CLEAN_ROUGHNESS) * dirt
    tinted.set(key, m)
  }
  return m
}

/** Gives a car's meshes the shared material for how dirty and worn it is. */
function useDirt(object: Object3D, cleanliness: number | undefined, condition = 1): void {
  useEffect(() => {
    if (cleanliness === undefined) return
    object.traverse((o) => {
      const mesh = o as Mesh
      const base = mesh.userData.base as MeshStandardMaterial | undefined
      if (mesh.isMesh && base) mesh.material = tintedMaterial(base, cleanliness, condition)
    })
  }, [object, cleanliness, condition])
}

/** Size of a footprint in the model's own frame (before its facing turns it). */
interface Footprint {
  w: number
  h: number
}

/** `def.scale`, or less if that would push a `fit` model past its footprint. */
function fitScale(size: Vector3, def: ModelDef, footprint: Footprint): number {
  if (!def.fit) return def.scale
  const quarterTurned = Math.round((def.yaw ?? 0) / (Math.PI / 2)) % 2 !== 0
  const [w, h] = quarterTurned ? [size.z, size.x] : [size.x, size.z]
  return Math.min(def.scale, footprint.w / w, footprint.h / h)
}

/**
 * A prop's model; cars pass their `cleanliness` to look as dirty as they are,
 * and used cars their `condition` to look as worn.
 */
function Model(props: ModelProps) {
  return (
    <Suspense fallback={null}>
      <LoadedModel {...props} />
    </Suspense>
  )
}

interface ModelProps {
  def: ModelDef
  footprint: Footprint
  cleanliness?: number
  condition?: number
  /** A car with a dent from a test drive. */
  ding?: boolean
}

function LoadedModel({ def, footprint, cleanliness, condition, ding }: ModelProps) {
  const { object, size } = useCenteredModel(def.url, def.shadow ?? true)
  useDirt(object, cleanliness, condition)
  return (
    <group rotation-y={def.yaw ?? 0} scale={fitScale(size, def, footprint)}>
      <primitive object={object} />
      {ding && <Dents size={size} />}
    </group>
  )
}

/** A dent: a dark smudge on the bodywork, shared by every dinged car. */
const DENT_GEOMETRY = new CircleGeometry(1, 12)
const DENT_MATERIAL = new MeshStandardMaterial({
  color: '#2b2b2e',
  roughness: 1,
  transparent: true,
  opacity: 0.75,
  polygonOffset: true,
  polygonOffsetFactor: -2,
})

/**
 * A dent on either flank of a car `size` (model space, nose along z): by the
 * front door on one side and the back wheel on the other, so it shows from
 * any side of the lot.
 */
function Dents({ size }: { size: Vector3 }) {
  const r = size.z * 0.05
  const y = size.y * 0.38
  const x = size.x / 2 - size.x * 0.06
  return (
    <>
      <mesh
        geometry={DENT_GEOMETRY}
        material={DENT_MATERIAL}
        position={[x, y, size.z * 0.12]}
        rotation-y={Math.PI / 2}
        scale={[r, r * 0.7, 1]}
      />
      <mesh
        geometry={DENT_GEOMETRY}
        material={DENT_MATERIAL}
        position={[-x, y, -size.z * 0.22]}
        rotation-y={-Math.PI / 2}
        scale={[r * 0.8, r * 0.6, 1]}
      />
    </>
  )
}

/** The sign's board, with the dealership's name picked at New game. */
function useSignTexture(): CanvasTexture {
  const name = useGame((s) => s.dealershipName)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1e3a5f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#e8c547'
    ctx.lineWidth = 10
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const maxWidth = canvas.width - 80
    ctx.font = 'bold 92px system-ui, sans-serif'
    ctx.fillText(name.toUpperCase(), canvas.width / 2, 108, maxWidth)
    ctx.fillStyle = '#e8c547'
    ctx.font = '600 40px system-ui, sans-serif'
    ctx.fillText('NEW  ·  USED  ·  SERVICE', canvas.width / 2, 192, maxWidth)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [name])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

/** The For Sale board out front of the parcel: red on white, like an estate agent's. */
function useForSaleTexture(): CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f7f5ef'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#c0392b'
    ctx.fillRect(0, 0, canvas.width, 26)
    ctx.fillRect(0, canvas.height - 26, canvas.width, 26)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const maxWidth = canvas.width - 48
    ctx.font = 'bold 104px system-ui, sans-serif'
    ctx.fillText('FOR SALE', canvas.width / 2, 112, maxWidth)
    ctx.fillStyle = '#3d4148'
    ctx.font = '600 34px system-ui, sans-serif'
    ctx.fillText('COMMERCIAL LOT', canvas.width / 2, 192, maxWidth)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [])
}

const FOR_SALE_BOARD_Y = 1.25

/** A board on two wooden posts, the same face on both sides. */
function ForSaleSign({ width }: { width: number }) {
  const texture = useForSaleTexture()
  const boardW = Math.min(width - 0.6, 2)
  const boardH = boardW / 2
  const postH = FOR_SALE_BOARD_Y + boardH / 2
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * boardW) / 2.4, postH / 2, 0]} castShadow>
          <boxGeometry args={[0.1, postH, 0.1]} />
          <meshStandardMaterial color="#8a6a48" />
        </mesh>
      ))}
      <mesh position-y={FOR_SALE_BOARD_Y} castShadow>
        <boxGeometry args={[boardW, boardH, 0.1]} />
        <meshStandardMaterial color="#f7f5ef" />
      </mesh>
      {[0, Math.PI].map((rot) => (
        <group key={rot} rotation-y={rot}>
          <mesh position={[0, FOR_SALE_BOARD_Y, 0.051]}>
            <planeGeometry args={[boardW, boardH]} />
            <meshStandardMaterial map={texture} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** How each tier of the sign is built: the board's height off the ground and how far it overhangs. */
const SIGN_TIERS = [
  { boardY: 2.3, extraWidth: 0, post: 0.14 },
  // Bigger sign: a wider board, up higher.
  { boardY: 3.1, extraWidth: 1.6, post: 0.2 },
  // Lit pylon: higher still, lit from inside with chasing bulbs round the edge.
  { boardY: 4.4, extraWidth: 2.2, post: 0.3 },
]
const BULB_SPACING = 0.32
/** Unlit, so a lit bulb shows at full brightness whatever the light, as the sign's face does. */
const BULB_MATERIAL = new MeshBasicMaterial({ toneMapped: false })
const BULB_GEOMETRY = new SphereGeometry(0.06, 8, 6)
const BULB_ON = new Color('#fff3c4')
const BULB_OFF = new Color('#8a7f63')
/** Steps of the chase a second. */
const CHASE_RATE = 6

/**
 * Chasing bulbs along the top and bottom edges of a board `w` by `h`, on both faces,
 * leaving the bottom edge clear within `gap` of each post at ±`postX`. One
 * instanced mesh, recoloured as the chase steps: one draw call for them all.
 */
function Bulbs({ w, h, postX, gap }: { w: number; h: number; postX: number; gap: number }) {
  const mesh = useRef<InstancedMesh>(null)
  const shown = useRef(-1)
  const per = Math.floor(w / BULB_SPACING)
  const spots = useMemo(
    () =>
      [-1, 1].flatMap((face) =>
        [-1, 1].flatMap((edge) =>
          Array.from({ length: per }, (_, i) => [
            -w / 2 + BULB_SPACING / 2 + i * (w / per),
            (edge * (h + 0.1)) / 2,
            face * 0.08,
          ]).filter(([x]) => edge > 0 || Math.abs(Math.abs(x) - postX) > gap),
        ),
      ),
    [w, h, per, postX, gap],
  )
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const at = new Matrix4()
    spots.forEach(([x, y, z], i) => m.setMatrixAt(i, at.makeTranslation(x, y, z)))
    m.instanceMatrix.needsUpdate = true
    shown.current = -1
  }, [spots])
  useFrame(({ clock }) => {
    const m = mesh.current
    const step = Math.floor(clock.elapsedTime * CHASE_RATE) % 3
    if (!m || step === shown.current) return
    shown.current = step
    for (let i = 0; i < spots.length; i++)
      m.setColorAt(i, (i + step) % 3 === 0 ? BULB_ON : BULB_OFF)
    m.instanceColor!.needsUpdate = true
  })
  return (
    <instancedMesh
      key={spots.length}
      ref={mesh}
      args={[BULB_GEOMETRY, BULB_MATERIAL, spots.length]}
    />
  )
}

/** The dealership sign, as the upgrades have it (0 is the one it opened with). */
function Sign({ width }: { width: number }) {
  const texture = useSignTexture()
  const tier = useGame((s) => slotTier(upNow(s), 'sign'))
  const { boardY, extraWidth, post } = SIGN_TIERS[tier]
  const lit = tier >= 2
  const boardW = width - 0.2 + extraWidth
  const boardH = boardW / 3
  // Posts stay inside the footprint whatever the board's width, and stop under the
  // frame: they're thicker than the board, so any higher pokes through its faces.
  const postX = (width - 0.2) / 2.6
  const postH = boardY - (boardH + 0.1) / 2
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * postX, postH / 2, 0]} castShadow>
          <boxGeometry args={[post, postH, post]} />
          <meshStandardMaterial color="#3d4148" />
        </mesh>
      ))}
      <mesh position-y={boardY} castShadow>
        <boxGeometry args={[boardW + 0.1, boardH + 0.1, 0.12]} />
        <meshStandardMaterial color="#3d4148" />
      </mesh>
      {/* Same face on both sides so it reads from every camera angle. */}
      {[0, Math.PI].map((rot) => (
        <group key={rot} rotation-y={rot}>
          <mesh position={[0, boardY, 0.065]}>
            <planeGeometry args={[boardW, boardH]} />
            {/* Lit from inside: shown at full brightness whatever the light. */}
            {lit ? (
              <meshBasicMaterial map={texture} toneMapped={false} />
            ) : (
              <meshStandardMaterial map={texture} />
            )}
          </mesh>
        </group>
      ))}
      {lit && (
        <group position-y={boardY}>
          <Bulbs w={boardW} h={boardH} postX={postX} gap={post / 2 + 0.06} />
        </group>
      )}
    </group>
  )
}

const PHONE_BODY = new MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6 })
const PHONE_KEYS = new MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.5 })
const PHONE_SCREEN = new MeshStandardMaterial({
  color: '#7fd1a8',
  emissive: '#3c9c72',
  emissiveIntensity: 0.4,
})
/** The keypad's buttons, in rows across the phone's front half. */
const PHONE_KEY_SPOTS = [-0.07, 0, 0.07].flatMap((x) =>
  [0.02, 0.09].map((z) => [x, 0.095, z] as [number, number, number]),
)

/** The office desk phone, made of a few boxes: a base, a keypad, a little screen and the handset. */
function DeskPhone() {
  return (
    <group>
      <mesh position-y={0.04} material={PHONE_BODY}>
        <boxGeometry args={[0.36, 0.08, 0.3]} />
      </mesh>
      {/* Front half sloped toward whoever uses it (+z). */}
      <mesh position={[0, 0.085, 0.05]} rotation-x={0.25} material={PHONE_BODY}>
        <boxGeometry args={[0.3, 0.03, 0.18]} />
      </mesh>
      {PHONE_KEY_SPOTS.map((p, i) => (
        <mesh key={i} position={p} material={PHONE_KEYS}>
          <boxGeometry args={[0.045, 0.02, 0.04]} />
        </mesh>
      ))}
      <mesh position={[0.1, 0.09, -0.04]} material={PHONE_SCREEN}>
        <boxGeometry args={[0.1, 0.015, 0.05]} />
      </mesh>
      {/* The handset, in its cradle along the back. */}
      <group position={[0, 0.11, -0.09]}>
        <mesh material={PHONE_BODY}>
          <boxGeometry args={[0.34, 0.04, 0.08]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.15, 0.02, 0]} material={PHONE_BODY}>
            <boxGeometry args={[0.07, 0.05, 0.1]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

const FRIDGE_BODY = new MeshStandardMaterial({ color: '#e9ecef', roughness: 0.35 })
const FRIDGE_TRIM = new MeshStandardMaterial({ color: '#9aa1a9', roughness: 0.4, metalness: 0.6 })
const FRIDGE_HEIGHT = 1.7
const FRIDGE_SPLIT = 1.1

/** The break room's fridge, made of boxes: a tall white body, two doors and their handles. */
function Fridge() {
  return (
    <group>
      <mesh position-y={FRIDGE_HEIGHT / 2} material={FRIDGE_BODY} castShadow receiveShadow>
        <boxGeometry args={[0.8, FRIDGE_HEIGHT, 0.75]} />
      </mesh>
      {/* The gap between the freezer and fridge doors, on the front (+z). */}
      <mesh position={[0, FRIDGE_SPLIT, 0.376]} material={FRIDGE_TRIM}>
        <boxGeometry args={[0.8, 0.02, 0.01]} />
      </mesh>
      {[FRIDGE_SPLIT + 0.25, FRIDGE_SPLIT - 0.35].map((y) => (
        <mesh key={y} position={[0.3, y, 0.4]} material={FRIDGE_TRIM}>
          <boxGeometry args={[0.04, 0.3, 0.04]} />
        </mesh>
      ))}
    </group>
  )
}

/** Employee of the Month's plaque: the latest winner's name and month, gold on wood. */
function usePlaqueTexture(): CanvasTexture {
  const win = useGame((s) => s.eotm[s.eotm.length - 1] ?? null)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 320
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#6b4a2f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#e8c547'
    ctx.lineWidth = 8
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28)
    ctx.fillStyle = '#e8c547'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const maxWidth = canvas.width - 50
    ctx.font = '600 26px system-ui, sans-serif'
    ctx.fillText('EMPLOYEE', canvas.width / 2, 62, maxWidth)
    ctx.fillText('OF THE MONTH', canvas.width / 2, 94, maxWidth)
    ctx.fillText('★', canvas.width / 2, 140, maxWidth)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 40px system-ui, sans-serif'
    ctx.fillText(win ? win.name : '—', canvas.width / 2, 200, maxWidth)
    if (win) {
      ctx.fillStyle = '#e8c547'
      ctx.font = '500 26px system-ui, sans-serif'
      const date = calendarOf(win.day)
      ctx.fillText(
        `${monthLabel(date.month, true)}, year ${date.year}`,
        canvas.width / 2,
        252,
        maxWidth,
      )
    }
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [win])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

const PLAQUE_WOOD = new MeshStandardMaterial({ color: '#4a3220', roughness: 0.7 })
const PLAQUE_Y = 1.15

/** The plaque on its stand, the same face on both sides so it reads from every camera angle. */
function Plaque() {
  const texture = usePlaqueTexture()
  return (
    // Turned 45° toward the showroom floor, so it reads from the default view.
    <group position-z={-0.15} rotation-y={-Math.PI / 4}>
      <mesh position-y={PLAQUE_Y / 2} material={PLAQUE_WOOD} castShadow>
        <boxGeometry args={[0.08, PLAQUE_Y, 0.08]} />
      </mesh>
      <mesh position-y={0.03} material={PLAQUE_WOOD} receiveShadow>
        <boxGeometry args={[0.5, 0.06, 0.4]} />
      </mesh>
      <mesh position-y={PLAQUE_Y} material={PLAQUE_WOOD} castShadow>
        <boxGeometry args={[0.66, 0.82, 0.06]} />
      </mesh>
      {[0, Math.PI].map((rot) => (
        <group key={rot} rotation-y={rot}>
          <mesh position={[0, PLAQUE_Y, 0.031]}>
            <planeGeometry args={[0.6, 0.75]} />
            <meshStandardMaterial map={texture} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const swallowClick = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

interface PropViewProps {
  prop: Prop
  cleanliness?: number
  /** A used car's condition, which fades its paint. */
  condition?: number
  /** Its display platform is a turntable (the turntables upgrade). */
  turntable?: boolean
  /** A car with a dent from a test drive. */
  ding?: boolean
}

/** Same prop, drawn the same: `carProp` makes a fresh prop for each car whenever the stock changes. */
function samePropView(a: PropViewProps, b: PropViewProps): boolean {
  const p = a.prop
  const q = b.prop
  return (
    (p === q ||
      (p.id === q.id &&
        p.model === q.model &&
        p.rect === q.rect &&
        p.facing === q.facing &&
        !!p.platform === !!q.platform &&
        p.elevation === q.elevation)) &&
    a.cleanliness === b.cleanliness &&
    a.condition === b.condition &&
    a.turntable === b.turntable &&
    a.ding === b.ding
  )
}

/**
 * One prop or car. Memoised, so a change to the stock redraws only the cars
 * it changed (a wash, a smudge, a sale), not all of them.
 */
const PropView = memo(function PropView(props: PropViewProps) {
  const { prop } = props
  const content = <PropContent {...props} />
  return interactables.has(prop.id) ? (
    <Interactable id={prop.id}>{content}</Interactable>
  ) : (
    <group onPointerDown={swallowClick} onPointerUp={swallowClick}>
      {content}
    </group>
  )
}, samePropView)

function PropContent({ prop, cleanliness, condition, turntable, ding }: PropViewProps) {
  const b = rectBounds(prop.rect)
  const turned = prop.facing % 2 === 1
  const y = (prop.elevation ?? 0) + (prop.platform ? PLATFORM_HEIGHT : 0)
  const body = (
    <group position-y={y} rotation-y={(prop.facing * Math.PI) / 2}>
      {prop.model === 'sign' ? (
        <Sign width={turned ? b.h : b.w} />
      ) : prop.model === 'forSaleSign' ? (
        <ForSaleSign width={turned ? b.h : b.w} />
      ) : prop.model === 'deskPhone' ? (
        <DeskPhone />
      ) : prop.model === 'fridge' ? (
        <Fridge />
      ) : prop.model === 'plaque' ? (
        <Plaque />
      ) : (
        <Model
          def={MODELS[prop.model]}
          footprint={turned ? { w: b.h, h: b.w } : { w: b.w, h: b.h }}
          cleanliness={cleanliness}
          condition={condition}
          ding={ding}
        />
      )}
    </group>
  )
  return (
    <group position={[b.x, 0, b.z]}>
      {prop.platform && (
        <RoundedBox
          args={[b.w - 0.25, PLATFORM_HEIGHT, b.h - 0.25]}
          radius={0.05}
          position-y={PLATFORM_HEIGHT / 2}
          receiveShadow
        >
          <meshStandardMaterial color="#c9ced6" metalness={0.3} roughness={0.35} />
        </RoundedBox>
      )}
      {prop.platform && turntable ? (
        <>
          {/* A lit strip round the foot of the platform. */}
          <RoundedBox args={[b.w - 0.1, 0.05, b.h - 0.1]} radius={0.02} position-y={0.025}>
            <meshStandardMaterial
              color="#bfe9ff"
              emissive="#5cc8ff"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </RoundedBox>
          <Sway phase={prop.rect.tx + prop.rect.tz}>{body}</Sway>
        </>
      ) : (
        body
      )}
    </group>
  )
}

/**
 * A car's model on its own, centred on the origin and nose to +z, for a
 * visitor's car on the move (scene/DrivenCar).
 */
export function CarBody({
  model,
  cleanliness,
  condition,
  ding,
}: {
  model: CarModel
  cleanliness: number
  condition: number
  ding?: boolean
}) {
  return (
    <group onPointerDown={swallowClick} onPointerUp={swallowClick}>
      <Model
        def={MODELS[model]}
        footprint={{ w: 2, h: 3 }}
        cleanliness={cleanliness}
        condition={condition}
        ding={ding}
      />
    </group>
  )
}

/**
 * A car's model as scenery: centred on the origin, nose to +z, sharing the
 * model's materials, with no shadows and no click handling (Nazma's stock
 * across the road, in scene/RivalLot).
 */
export function StaticCar({ model }: { model: CarModel }) {
  return (
    <Suspense fallback={null}>
      <LoadedStaticCar model={model} />
    </Suspense>
  )
}

function LoadedStaticCar({ model }: { model: CarModel }) {
  const { object } = useCenteredModel(MODELS[model].url, false)
  return (
    <group scale={CAR_SCALE}>
      <primitive object={object} />
    </group>
  )
}

/** How far (radians) and how fast a turntable swings its car either way. */
const SWAY_ANGLE = 0.22
const SWAY_SPEED = 0.35

/** Swings its children slowly side to side, as a turntable shows off a car. Stays inside the footprint. */
function Sway({ phase, children }: { phase: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = SWAY_ANGLE * Math.sin(clock.elapsedTime * SWAY_SPEED + phase)
    }
  })
  return <group ref={ref}>{children}</group>
}

const STAND_HEIGHT = 2.3
const BEAM_MATERIAL = new MeshStandardMaterial({
  color: '#fff6d8',
  emissive: '#fff1c2',
  emissiveIntensity: 0.6,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
  blending: AdditiveBlending,
})
const UP = new Vector3(0, 1, 0)

/**
 * A light stand in a corner of display `rect`, its head aimed at the middle of
 * the platform with a faint beam. `corner` picks the corner: -1/1 on each axis.
 */
function LightStand({ rect, corner }: { rect: Rect; corner: [number, number] }) {
  const b = rectBounds(rect)
  const x = corner[0] * (b.w / 2 - 0.2)
  const z = corner[1] * (b.h / 2 - 0.2)
  const beam = useMemo(() => {
    const head = new Vector3(x, STAND_HEIGHT, z)
    const target = new Vector3(0, 0.6, 0)
    const toHead = head.clone().sub(target)
    const length = toHead.length()
    toHead.normalize()
    return {
      position: target.clone().add(head).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(UP, toHead),
      length,
      // The lamp head faces down the beam.
      tilt: new Quaternion().setFromUnitVectors(UP, toHead.clone().negate()),
    }
  }, [x, z])
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[x, STAND_HEIGHT / 2, z]} castShadow>
        <cylinderGeometry args={[0.035, 0.06, STAND_HEIGHT, 8]} />
        <meshStandardMaterial color="#2b2e33" metalness={0.6} roughness={0.4} />
      </mesh>
      <group position={[x, STAND_HEIGHT, z]} quaternion={beam.tilt}>
        <mesh>
          <cylinderGeometry args={[0.12, 0.17, 0.3, 12]} />
          <meshStandardMaterial color="#2b2e33" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position-y={0.151} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.15, 16]} />
          <meshBasicMaterial color="#fff6d8" toneMapped={false} />
        </mesh>
      </group>
      {/* The beam: wide at the car, narrow at the lamp. */}
      <mesh position={beam.position} quaternion={beam.quaternion} material={BEAM_MATERIAL}>
        <cylinderGeometry args={[0.15, 0.9, beam.length, 16, 1, true]} />
      </mesh>
    </group>
  )
}

/** The spotlights upgrade: two light stands at opposite corners of each display platform up. */
function Spotlights({ ground }: { ground: readonly ExpansionId[] }) {
  return (
    <>
      {PLATFORMS.map(({ rect }, i) =>
        platformOpen(i, ground) ? (
          <group key={i}>
            <LightStand rect={rect} corner={[-1, 1]} />
            <LightStand rect={rect} corner={[1, -1]} />
          </group>
        ) : null,
      )}
    </>
  )
}

/** Restocking a car on top of someone would trap them inside its footprint. */
function nobodyIn(car: InventoryCar): boolean {
  const b = rectBounds(car.rect)
  const clear = (p: Vec2) =>
    Math.abs(p.x - b.x) >= b.w / 2 + PLAYER_RADIUS || Math.abs(p.z - b.z) >= b.h / 2 + PLAYER_RADIUS
  return clear(playerPos) && [...customerPos.values()].every(clear)
}

function useDevRestockKey() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyR' || e.repeat) return
      if (e.shiftKey) useGame.getState().devUsedCar(nobodyIn)
      else useGame.getState().devRestock(nobodyIn)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * Cars in stock, as dirty as they are. Re-renders only when the inventory
 * changes (a sale or restock, dirt or a wash).
 */
function Cars({ turntables }: { turntables: boolean }) {
  const inventory = useGame((s) => s.inventory)
  const cars = useMemo(
    () => availableCars(inventory).map((car) => ({ prop: carProp(car), car })),
    [inventory],
  )
  useDevRestockKey()
  return (
    <>
      {cars.map(({ prop, car }) => (
        <PropView
          key={prop.id}
          prop={prop}
          cleanliness={car.cleanliness}
          condition={car.used?.condition}
          turntable={turntables}
          ding={car.ding}
        />
      ))}
    </>
  )
}

/** The fixed props (as the improvements up have them), what improvements add, and the cars. */
export function Props() {
  const up = useUpNow()
  // The For Sale sign comes down when the lot is built, and the wing's furniture goes in.
  const ground = useGround()
  return (
    <>
      {layout.props.map((p) => {
        const model = swappedModel(up, p.id)
        return <PropView key={p.id} prop={model ? { ...p, model } : p} />
      })}
      {improvementProps(up).map((p) => (
        <PropView key={p.id} prop={p} />
      ))}
      {slotTier(up, 'lighting') > 0 && <Spotlights ground={ground} />}
      <Cars turntables={slotTier(up, 'platforms') > 0} />
    </>
  )
}
