import { RoundedBox, useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  AdditiveBlending,
  Box3,
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
} from 'three'
import type { Vec2 } from '../sim/grid'
import { improvementProps, installed, slotTier, swappedModel } from '../sim/improvements'
import { availableCars, carProp, type InventoryCar } from '../sim/inventory'
import {
  DEALERSHIP_NAME,
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
}

const car = (name: string): ModelDef => ({ url: `${BASE}/cars/${name}.glb`, scale: CAR_SCALE })
const furniture = (name: string, opts: { yaw?: number; fit?: boolean } = {}): ModelDef => ({
  url: `${BASE}/furniture/${name}.glb`,
  scale: FURNITURE_SCALE,
  ...opts,
})

const MODELS: Record<Exclude<PropModel, 'sign' | 'forSaleSign'>, ModelDef> = {
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
  plantSmall1: furniture('plantSmall1'),
  kitchenCoffeeMachine: furniture('kitchenCoffeeMachine'),
  kitchenCabinet: furniture('kitchenCabinet'),
  loungeSofa: furniture('loungeSofa', { fit: true }),
  loungeDesignSofa: furniture('loungeDesignSofa', { fit: true }),
  cabinetTelevision: furniture('cabinetTelevision'),
  televisionModern: furniture('televisionModern'),
  kitchenBar: furniture('kitchenBar'),
  stoolBar: furniture('stoolBar'),
  tableCoffeeSquare: furniture('tableCoffeeSquare'),
  computerScreen: furniture('computerScreen'),
  bookcaseClosedWide: furniture('bookcaseClosedWide'),
  trashcan: furniture('trashcan'),
}

for (const def of Object.values(MODELS)) useGLTF.preload(def.url)

/**
 * Clones a GLB scene and recenters it so its footprint is centered on x/z and it
 * rests on y=0. With `ownMaterials` the clone gets its own copies of the
 * materials (which clones otherwise share), so they can be tinted per copy.
 * Also returns the model's unscaled size.
 */
function useCenteredModel(url: string, ownMaterials = false): { object: Object3D; size: Vector3 } {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (ownMaterials && !Array.isArray(mesh.material)) mesh.material = mesh.material.clone()
    })
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root)
    const c = box.getCenter(new Vector3())
    root.position.set(-c.x, -box.min.y, -c.z)
    return { object: root, size: box.getSize(new Vector3()) }
  }, [scene, ownMaterials])
}

/** Paint tint and roughness of a spotless car, and of a filthy one. */
const CLEAN_TINT = new Color('#ffffff')
const DIRTY_TINT = new Color('#8c7a5e')
const CLEAN_ROUGHNESS = 0.55
const DIRTY_ROUGHNESS = 1
/** A worn used car's paint fades toward this, by up to `MAX_FADE` for a wreck. */
const FADED_TINT = new Color('#c9c4ba')
const MAX_FADE = 0.5

/** Calls `fn` with each of a model's own (single) materials. */
function eachMaterial(object: Object3D, fn: (m: MeshStandardMaterial) => void): void {
  object.traverse((o) => {
    const mesh = o as Mesh
    if (mesh.isMesh && !Array.isArray(mesh.material)) fn(mesh.material as MeshStandardMaterial)
  })
}

/**
 * Fades a worn used car's paint by its `condition` (1 for a new car), then
 * dulls it toward a dusty brown as it gets dirtier.
 */
function useDirt(object: Object3D, cleanliness: number | undefined, condition = 1): void {
  useEffect(() => {
    if (cleanliness === undefined) return
    const dirt = 1 - cleanliness
    const base = CLEAN_TINT.clone().lerp(FADED_TINT, (1 - condition) * MAX_FADE)
    eachMaterial(object, (m) => {
      m.color.copy(base).lerp(DIRTY_TINT, dirt)
      m.roughness = CLEAN_ROUGHNESS + (DIRTY_ROUGHNESS - CLEAN_ROUGHNESS) * dirt
    })
  }, [object, cleanliness, condition])
  // The materials are this copy's own: free them with it.
  const isCar = cleanliness !== undefined
  useEffect(() => {
    if (isCar) return () => eachMaterial(object, (m) => m.dispose())
  }, [object, isCar])
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
function Model({
  def,
  footprint,
  cleanliness,
  condition,
}: {
  def: ModelDef
  footprint: Footprint
  cleanliness?: number
  condition?: number
}) {
  const { object, size } = useCenteredModel(def.url, cleanliness !== undefined)
  useDirt(object, cleanliness, condition)
  return (
    <group rotation-y={def.yaw ?? 0} scale={fitScale(size, def, footprint)}>
      <primitive object={object} />
    </group>
  )
}

function useSignTexture(): CanvasTexture {
  return useMemo(() => {
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
    ctx.fillText(DEALERSHIP_NAME.toUpperCase(), canvas.width / 2, 108, maxWidth)
    ctx.fillStyle = '#e8c547'
    ctx.font = '600 40px system-ui, sans-serif'
    ctx.fillText('NEW  ·  USED  ·  SERVICE', canvas.width / 2, 192, maxWidth)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [])
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
const BULB_ON = new MeshStandardMaterial({
  color: '#fff3c4',
  emissive: '#ffd36b',
  emissiveIntensity: 2,
})
const BULB_OFF = new MeshStandardMaterial({ color: '#8a7f63', roughness: 0.4 })

/**
 * Chasing bulbs along the top and bottom edges of a board `w` by `h`, on both faces,
 * leaving the bottom edge clear within `gap` of each post at ±`postX`.
 */
function Bulbs({ w, h, postX, gap }: { w: number; h: number; postX: number; gap: number }) {
  const bulbs = useRef<Mesh[]>([]).current
  const per = Math.floor(w / BULB_SPACING)
  useFrame(({ clock }) => {
    const step = Math.floor(clock.elapsedTime * 6)
    bulbs.forEach((m, i) => (m.material = (i + step) % 3 === 0 ? BULB_ON : BULB_OFF))
  })
  const spots = [-1, 1].flatMap((face) =>
    [-1, 1].flatMap((edge) =>
      Array.from({ length: per }, (_, i) => [
        -w / 2 + BULB_SPACING / 2 + i * (w / per),
        (edge * (h + 0.1)) / 2,
        face * 0.08,
      ]).filter(([x]) => edge > 0 || Math.abs(Math.abs(x) - postX) > gap),
    ),
  )
  return (
    <>
      {spots.map((p, i) => (
        <mesh
          key={i}
          position={p as [number, number, number]}
          material={BULB_OFF}
          ref={(m) => {
            if (m) bulbs[i] = m
          }}
        >
          <sphereGeometry args={[0.06, 8, 6]} />
        </mesh>
      ))}
    </>
  )
}

/** The dealership sign, as the upgrades have it (0 is the one it opened with). */
function Sign({ width }: { width: number }) {
  const texture = useSignTexture()
  const tier = useGame((s) => slotTier(installed(s.improvements, s.clock.day), 'sign'))
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

const swallowClick = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

interface PropViewProps {
  prop: Prop
  cleanliness?: number
  /** A used car's condition, which fades its paint. */
  condition?: number
  /** Its display platform is a turntable (the turntables upgrade). */
  turntable?: boolean
}

function PropView(props: PropViewProps) {
  const { prop } = props
  const content = <PropContent {...props} />
  return interactables.has(prop.id) ? (
    <Interactable id={prop.id}>{content}</Interactable>
  ) : (
    <group onPointerDown={swallowClick} onPointerUp={swallowClick}>
      {content}
    </group>
  )
}

function PropContent({ prop, cleanliness, condition, turntable }: PropViewProps) {
  const b = rectBounds(prop.rect)
  const turned = prop.facing % 2 === 1
  const y = (prop.elevation ?? 0) + (prop.platform ? PLATFORM_HEIGHT : 0)
  const body = (
    <group position-y={y} rotation-y={(prop.facing * Math.PI) / 2}>
      {prop.model === 'sign' ? (
        <Sign width={turned ? b.h : b.w} />
      ) : prop.model === 'forSaleSign' ? (
        <ForSaleSign width={turned ? b.h : b.w} />
      ) : (
        <Model
          def={MODELS[prop.model]}
          footprint={turned ? { w: b.h, h: b.w } : { w: b.w, h: b.h }}
          cleanliness={cleanliness}
          condition={condition}
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
}: {
  model: CarModel
  cleanliness: number
  condition: number
}) {
  return (
    <group onPointerDown={swallowClick} onPointerUp={swallowClick}>
      <Model
        def={MODELS[model]}
        footprint={{ w: 2, h: 3 }}
        cleanliness={cleanliness}
        condition={condition}
      />
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
