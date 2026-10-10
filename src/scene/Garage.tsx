import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type Group } from 'three'
import type { InventoryCar } from '../sim/inventory'
import { GARAGE_SIGN, SERVICE_BAYS, type ServiceBay } from '../sim/layout'
import type { ServiceJob } from '../sim/service'
import { useGame } from '../state/store'
import { CarBody } from './Props'
import { lifts, rectBounds } from './runtime'
import { useGround } from './useUpNow'

/** How high a lift raises a car, and how fast (units a second). */
const LIFT_UP = 0.9
const LIFT_SPEED = 0.5
/** Where the roll-up doors sit, rolled up over their openings. */
const DOOR_DRUM_Y = 2.2

// Shared by every bay: the garage is a handful of meshes, none casting shadows.
const STEEL = new MeshStandardMaterial({ color: '#5d636b', metalness: 0.6, roughness: 0.45 })
const LIFT_YELLOW = new MeshStandardMaterial({ color: '#e0b43a', roughness: 0.6 })
const DOOR = new MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.3, roughness: 0.5 })
const POST = new MeshStandardMaterial({ color: '#3a3f46', roughness: 0.6 })

const swallowClick = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

/** "SERVICE" in white on blue, like the dealership's own sign. */
function useServiceTexture(): CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 160
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1e3a5f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#e8c547'
    ctx.lineWidth = 8
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 96px system-ui, sans-serif'
    ctx.fillText('SERVICE', canvas.width / 2, canvas.height / 2 + 4, canvas.width - 60)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [])
}

/** A pole sign by the garage, facing the street. */
function ServiceSign() {
  const texture = useServiceTexture()
  const b = rectBounds(GARAGE_SIGN)
  const boardW = 1.8
  const boardH = boardW * (160 / 512)
  const poleH = 2.6
  return (
    <group position={[b.x, 0, b.z]} onPointerDown={swallowClick} onPointerUp={swallowClick}>
      <mesh position-y={poleH / 2} material={POST}>
        <cylinderGeometry args={[0.06, 0.08, poleH, 8]} />
      </mesh>
      <mesh position-y={poleH + boardH / 2}>
        <boxGeometry args={[boardW, boardH, 0.08]} />
        <meshStandardMaterial attach="material-0" color="#1e3a5f" />
        <meshStandardMaterial attach="material-1" color="#1e3a5f" />
        <meshStandardMaterial attach="material-2" color="#1e3a5f" />
        <meshStandardMaterial attach="material-3" color="#1e3a5f" />
        <meshStandardMaterial attach="material-4" map={texture} />
        <meshStandardMaterial attach="material-5" map={texture} />
      </mesh>
    </group>
  )
}

/**
 * One bay: the lift's base and posts, its arms (which rise with a car on
 * them, moved in `useFrame`), the car itself, and the roll-up door rolled up
 * over its opening.
 */
function Bay({ index, bay, car }: { index: number; bay: ServiceBay; car: InventoryCar | null }) {
  const lift = useRef<Group>(null)
  const b = rectBounds(bay.rect)
  const door = rectBounds(bay.door)
  // Posts stand either side of the car, across its width.
  const across = bay.facing % 2 === 0 ? 'x' : 'z'
  const half = (across === 'x' ? b.w : b.h) / 2 - 0.08
  const posts: [number, number][] =
    across === 'x'
      ? [
          [-half, 0],
          [half, 0],
        ]
      : [
          [0, -half],
          [0, half],
        ]
  useFrame((_, delta) => {
    const g = lift.current
    if (!g) return
    // Up with one of our cars on it, or a client's standing on it (scene/DrivenCar).
    const target = car || lifts.cars.has(index) ? LIFT_UP : 0
    const step = Math.min(LIFT_SPEED * delta, Math.abs(target - g.position.y))
    g.position.y += Math.sign(target - g.position.y) * step
    lifts.heights[index] = g.position.y
  })
  return (
    <group onPointerDown={swallowClick} onPointerUp={swallowClick}>
      <group position={[b.x, 0, b.z]}>
        {/* The base plate the car drives onto. */}
        <mesh position-y={0.02} material={STEEL}>
          <boxGeometry args={[b.w - 0.3, 0.04, b.h - 0.2]} />
        </mesh>
        {posts.map(([x, z], i) => (
          <mesh key={i} position={[x, 1.1, z]} material={LIFT_YELLOW}>
            <boxGeometry args={[0.14, 2.2, 0.14]} />
          </mesh>
        ))}
        <group ref={lift}>
          {/* The arms under the car, raised with it. */}
          <mesh position-y={0.08} material={LIFT_YELLOW}>
            <boxGeometry
              args={across === 'x' ? [b.w - 0.3, 0.06, 0.18] : [0.18, 0.06, b.h - 0.3]}
            />
          </mesh>
          {car && (
            <group position-y={0.11} rotation-y={(bay.facing * Math.PI) / 2}>
              <CarBody
                model={car.model}
                cleanliness={car.cleanliness}
                condition={car.used?.condition ?? 1}
              />
            </group>
          )}
        </group>
      </group>
      {/* The roll-up door, rolled up into its drum. */}
      <mesh position={[door.x, DOOR_DRUM_Y, door.z]} rotation-z={Math.PI / 2} material={DOOR}>
        <cylinderGeometry args={[0.16, 0.16, door.w, 12]} />
      </mesh>
    </group>
  )
}

/** The stock car being worked on in bay `bay`, if any. */
function carInBay(
  bay: number,
  jobs: readonly ServiceJob[],
  inventory: readonly InventoryCar[],
): InventoryCar | null {
  const job = jobs.find((j) => j.status === 'inBay' && j.bay === bay)
  return (job?.carId && inventory.find((c) => c.id === job.carId)) || null
}

/**
 * The service garage, once it's built: its walls, floor, counter and chairs
 * come from the layout; this adds the lifts, our own cars on them (a client's
 * is drawn by scene/DrivenCar, raised with the lift), the roll-up
 * doors and the SERVICE sign.
 */
export function Garage() {
  const ground = useGround()
  const jobs = useGame((s) => s.serviceJobs)
  const inventory = useGame((s) => s.inventory)
  if (!ground.includes('service-bay')) return null
  return (
    <>
      {SERVICE_BAYS.map((bay, i) => (
        <Bay key={i} index={i} bay={bay} car={carInBay(i, jobs, inventory)} />
      ))}
      <ServiceSign />
    </>
  )
}
