import { RoundedBox, useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Box3, CanvasTexture, SRGBColorSpace, Vector3, type Mesh, type Object3D } from 'three'
import { availableCars, carProp, type InventoryCar } from '../sim/inventory'
import { DEALERSHIP_NAME, PROPS, type Prop, type PropModel } from '../sim/layout'
import { PLAYER_RADIUS } from '../sim/movement'
import { useGame } from '../state/store'
import { Interactable } from './Interactable'
import { interactables, playerPos, rectBounds } from './runtime'

const BASE = `${import.meta.env.BASE_URL}models`
const CAR_SCALE = 0.95
const FURNITURE_SCALE = 1.4
const PLATFORM_HEIGHT = 0.12

interface ModelDef {
  url: string
  scale: number
  /** Extra yaw so the model's front faces +z at facing 0. */
  yaw?: number
}

const car = (name: string): ModelDef => ({ url: `${BASE}/cars/${name}.glb`, scale: CAR_SCALE })
const furniture = (name: string, yaw = 0): ModelDef => ({
  url: `${BASE}/furniture/${name}.glb`,
  scale: FURNITURE_SCALE,
  yaw,
})

const MODELS: Record<Exclude<PropModel, 'sign'>, ModelDef> = {
  sedan: car('sedan'),
  'sedan-sports': car('sedan-sports'),
  suv: car('suv'),
  'suv-luxury': car('suv-luxury'),
  'hatchback-sports': car('hatchback-sports'),
  van: car('van'),
  truck: car('truck'),
  desk: furniture('desk'),
  deskCorner: furniture('deskCorner'),
  chairDesk: furniture('chairDesk'),
  chairCushion: furniture('chairCushion'),
  pottedPlant: furniture('pottedPlant'),
  plantSmall1: furniture('plantSmall1'),
  kitchenCoffeeMachine: furniture('kitchenCoffeeMachine'),
  kitchenCabinet: furniture('kitchenCabinet'),
  loungeSofa: furniture('loungeSofa'),
  tableCoffeeSquare: furniture('tableCoffeeSquare'),
  computerScreen: furniture('computerScreen'),
  bookcaseClosedWide: furniture('bookcaseClosedWide'),
  trashcan: furniture('trashcan'),
}

for (const def of Object.values(MODELS)) useGLTF.preload(def.url)

/** Clones a GLB scene and recenters it so its footprint is centered on x/z and it rests on y=0. */
function useCenteredModel(url: string): Object3D {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root)
    const c = box.getCenter(new Vector3())
    root.position.set(-c.x, -box.min.y, -c.z)
    return root
  }, [scene])
}

function Model({ def }: { def: ModelDef }) {
  const object = useCenteredModel(def.url)
  return (
    <group rotation-y={def.yaw ?? 0} scale={def.scale}>
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

function Sign({ width }: { width: number }) {
  const texture = useSignTexture()
  const boardW = width - 0.2
  const boardH = boardW / 3
  const boardY = 2.3
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * boardW) / 2.6, boardY / 2, 0]} castShadow>
          <boxGeometry args={[0.14, boardY, 0.14]} />
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
            <meshStandardMaterial map={texture} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const swallowClick = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

function PropView({ prop }: { prop: Prop }) {
  const content = <PropContent prop={prop} />
  return interactables.has(prop.id) ? (
    <Interactable id={prop.id}>{content}</Interactable>
  ) : (
    <group onPointerDown={swallowClick}>{content}</group>
  )
}

function PropContent({ prop }: { prop: Prop }) {
  const b = rectBounds(prop.rect)
  const turned = prop.facing % 2 === 1
  const y = (prop.elevation ?? 0) + (prop.platform ? PLATFORM_HEIGHT : 0)
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
      <group position-y={y} rotation-y={(prop.facing * Math.PI) / 2}>
        {prop.model === 'sign' ? (
          <Sign width={turned ? b.h : b.w} />
        ) : (
          <Model def={MODELS[prop.model]} />
        )}
      </group>
    </group>
  )
}

/** Restocking a car on top of the player would trap them inside its footprint. */
function playerClearOf(car: InventoryCar): boolean {
  const b = rectBounds(car.rect)
  return (
    Math.abs(playerPos.x - b.x) >= b.w / 2 + PLAYER_RADIUS ||
    Math.abs(playerPos.z - b.z) >= b.h / 2 + PLAYER_RADIUS
  )
}

function useDevRestockKey() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && !e.repeat) useGame.getState().devRestock(playerClearOf)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Cars in stock. Re-renders only when the inventory changes (a sale or restock). */
function Cars() {
  const inventory = useGame((s) => s.inventory)
  const props = useMemo(() => availableCars(inventory).map(carProp), [inventory])
  useDevRestockKey()
  return (
    <>
      {props.map((p) => (
        <PropView key={p.id} prop={p} />
      ))}
    </>
  )
}

export function Props() {
  return (
    <>
      {PROPS.map((p) => (
        <PropView key={p.id} prop={p} />
      ))}
      <Cars />
    </>
  )
}
