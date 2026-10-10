import { useFrame } from '@react-three/fiber'
import { Suspense, useRef, type ReactNode, type RefObject } from 'react'
import { BoxGeometry, CylinderGeometry, Group, MeshStandardMaterial, SphereGeometry } from 'three'
import type { CharacterAnim, CharacterVariant } from '../sim/characters'
import type { Vec2 } from '../sim/grid'
import { SEAT_HEIGHT } from '../sim/layout'
import { Character } from './Character'

/**
 * A low-poly motorcycle, nose to +z, drawn from a handful of boxes and
 * cylinders with shared geometry and materials (only the tank's paint differs
 * per bike). No shadows. It follows `bike.at` every frame and turns its wheels
 * by how far it moved, so a paused game or a parked bike keeps them still.
 */

/** A bike's place in the world: shared with `runtime.vehiclePos`. */
export interface BikePose {
  at: { pos: Vec2; heading: number; moving: boolean }
}

const WHEEL_RADIUS = 0.26
/** Front and rear axles, either side of the middle. */
const AXLE_Z = 0.5
/** The seat's top is where a seated character's clip expects a chair. */
const SEAT_TOP = SEAT_HEIGHT
/** How far behind the middle the rider sits. */
const RIDER_Z = -0.2

const mat = (color: string, roughness = 0.6, metalness = 0) =>
  new MeshStandardMaterial({ color, roughness, metalness })
const TIRE = mat('#1f2328', 0.95)
const METAL = mat('#9aa3ad', 0.35, 0.7)
const FRAME = mat('#2b2f36', 0.5, 0.4)
const SEAT = mat('#111317', 0.8)
const LAMP = new MeshStandardMaterial({
  color: '#fff6d8',
  emissive: '#fff1c2',
  emissiveIntensity: 0.8,
})
const VISOR = mat('#1b2430', 0.15, 0.6)

const PAINTS = new Map<string, MeshStandardMaterial>()
/** One material per paint colour, shared by every bike (and helmet) in it. */
function paintOf(color: string): MeshStandardMaterial {
  let m = PAINTS.get(color)
  if (!m) PAINTS.set(color, (m = mat(color, 0.35, 0.3)))
  return m
}

const TIRE_GEO = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.12, 14).rotateZ(Math.PI / 2)
const HUB_GEO = new CylinderGeometry(0.1, 0.1, 0.14, 8).rotateZ(Math.PI / 2)
const BOX = new BoxGeometry(1, 1, 1)
const HELMET_GEO = new SphereGeometry(1, 14, 10)

/** A unit box scaled to `size`, at `pos`, tipped forward by `tilt` radians. */
function Part({
  size,
  pos,
  tilt = 0,
  material,
}: {
  size: [number, number, number]
  pos: [number, number, number]
  tilt?: number
  material: MeshStandardMaterial
}) {
  return <mesh geometry={BOX} material={material} position={pos} rotation-x={tilt} scale={size} />
}

function Wheel({ z, spin }: { z: number; spin: RefObject<Group | null> }) {
  return (
    <group ref={spin} position={[0, WHEEL_RADIUS, z]}>
      <mesh geometry={TIRE_GEO} material={TIRE} />
      <mesh geometry={HUB_GEO} material={METAL} />
      {/* A spoke, so you can see it turn. */}
      <Part size={[0.13, WHEEL_RADIUS * 1.6, 0.04]} pos={[0, 0, 0]} material={METAL} />
    </group>
  )
}

/**
 * The bike at `bike.at`, painted `paint`, with `children` (a `Rider`) on its
 * seat.
 */
export function Motorcycle({
  bike,
  paint,
  children,
}: {
  bike: BikePose
  paint: string
  children?: ReactNode
}) {
  const group = useRef<Group>(null)
  const front = useRef<Group>(null)
  const rear = useRef<Group>(null)
  const last = useRef<Vec2>({ ...bike.at.pos })
  const tank = paintOf(paint)

  useFrame(() => {
    const { pos, heading } = bike.at
    const moved = Math.hypot(pos.x - last.current.x, pos.z - last.current.z)
    last.current.x = pos.x
    last.current.z = pos.z
    const turn = moved / WHEEL_RADIUS
    if (front.current) front.current.rotation.x += turn
    if (rear.current) rear.current.rotation.x += turn
    if (group.current) {
      group.current.position.set(pos.x, 0, pos.z)
      group.current.rotation.y = heading
    }
  })

  return (
    <group ref={group} position={[bike.at.pos.x, 0, bike.at.pos.z]} rotation-y={bike.at.heading}>
      <Wheel z={AXLE_Z} spin={front} />
      <Wheel z={-AXLE_Z} spin={rear} />
      {/* Frame from the rear axle up under the seat and on to the steering head. */}
      <Part size={[0.1, 0.1, 0.95]} pos={[0, 0.4, 0]} material={FRAME} />
      <Part size={[0.1, 0.32, 0.1]} pos={[0, 0.38, -0.12]} material={FRAME} />
      {/* Engine block between the wheels, and the exhaust down the right side. */}
      <Part size={[0.24, 0.2, 0.3]} pos={[0, 0.3, 0.08]} material={METAL} />
      <Part size={[0.07, 0.07, 0.6]} pos={[0.16, 0.22, -0.3]} tilt={-0.12} material={METAL} />
      {/* Tank and seat. */}
      <Part size={[0.28, 0.18, 0.36]} pos={[0, SEAT_TOP + 0.02, 0.16]} material={tank} />
      <Part size={[0.24, 0.08, 0.46]} pos={[0, SEAT_TOP - 0.04, RIDER_Z]} material={SEAT} />
      <Part size={[0.2, 0.05, 0.26]} pos={[0, SEAT_TOP - 0.04, -0.52]} material={tank} />
      {/* Forks up to the bars, and the headlamp. */}
      <Part size={[0.06, 0.62, 0.06]} pos={[0, 0.56, 0.42]} tilt={-0.3} material={METAL} />
      <Part size={[0.62, 0.05, 0.05]} pos={[0, 0.88, 0.33]} material={FRAME} />
      <Part size={[0.14, 0.12, 0.08]} pos={[0, 0.74, 0.5]} material={LAMP} />
      {children && <group position={[0, 0, RIDER_Z]}>{children}</group>}
    </group>
  )
}

/** Head height of a seated character (the Kenney minis have big heads). */
const HELMET_Y = 1.02
const HELMET_RADIUS = 0.3

/**
 * Someone riding: their character in the sit clip (set `anim` to `'sit'`),
 * with a helmet on, in `helmet` colour.
 */
export function Rider({
  variant,
  anim,
  tint,
  helmet,
}: {
  variant: CharacterVariant
  anim: RefObject<CharacterAnim>
  tint?: string
  helmet: string
}) {
  return (
    <>
      <Suspense fallback={null}>
        <Character variant={variant} anim={anim} bodyTint={tint} />
      </Suspense>
      <mesh
        geometry={HELMET_GEO}
        material={paintOf(helmet)}
        position={[0, HELMET_Y, 0]}
        scale={[HELMET_RADIUS, HELMET_RADIUS * 0.95, HELMET_RADIUS * 1.05]}
      />
      <Part
        size={[0.42, 0.14, 0.06]}
        pos={[0, HELMET_Y - 0.02, HELMET_RADIUS * 1.02]}
        material={VISOR}
      />
    </>
  )
}
