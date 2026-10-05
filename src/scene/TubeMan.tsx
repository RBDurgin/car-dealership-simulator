import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import { IMPROVEMENT_FOOTPRINTS, installed } from '../sim/improvements'
import { useGame } from '../state/store'
import { rectBounds } from './runtime'

const BODY = { segments: 6, length: 0.5, radius: 0.24 }
const ARM = { segments: 3, length: 0.42, radius: 0.1 }
const BASE_HEIGHT = 0.45
const COLORS = ['#e63946', '#ffb703']

type Chain = 'body' | 'left' | 'right'
/** Each chain's hinge groups, bottom first. There's only ever one tube man. */
const HINGES: Record<Chain, Group[]> = { body: [], left: [], right: [] }

/**
 * A run of tube segments, each hinged at the top of the one below. Every
 * hinge's group lands in `HINGES[chain]`, bottom first, for `useFrame` to bend.
 */
function Tube({
  segments,
  length,
  radius,
  chain,
  children,
}: {
  segments: number
  length: number
  radius: number
  chain: Chain
  /** Hung off the top of the last segment. */
  children?: React.ReactNode
}) {
  let top: React.ReactNode = children
  for (let i = segments - 1; i >= 0; i--) {
    const inner = top
    top = (
      <group
        ref={(g) => {
          if (g) HINGES[chain][i] = g
        }}
        position-y={i === 0 ? 0 : length}
      >
        <mesh position-y={length / 2} castShadow>
          <cylinderGeometry args={[radius, radius * 1.05, length, 10]} />
          <meshStandardMaterial color={COLORS[i % 2]} roughness={0.6} />
        </mesh>
        {inner}
      </group>
    )
  }
  return <>{top}</>
}

function Head() {
  return (
    <group position-y={BODY.length + 0.2}>
      <mesh castShadow>
        <sphereGeometry args={[0.26, 14, 10]} />
        <meshStandardMaterial color={COLORS[0]} roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.1, 0.06, 0.22]}>
          <mesh>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position-z={0.05}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
        </group>
      ))}
      {/* A tuft of hair. */}
      {[-0.4, 0, 0.4].map((tilt) => (
        <mesh key={tilt} position-y={0.28} rotation-z={tilt} castShadow>
          <coneGeometry args={[0.06, 0.25, 6]} />
          <meshStandardMaterial color={COLORS[1]} />
        </mesh>
      ))}
    </group>
  )
}

const ARMS = ['left', 'right'] as const

const swallowClick = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

/**
 * The wacky inflatable tube man, once he's up: a blower with a tube body and
 * two tube arms, flailing in `useFrame` (nothing goes through the store).
 * Every so often the air dips and he folds over before shooting back up.
 */
export function TubeMan() {
  const up = useGame((s) => installed(s.improvements, s.clock.day).includes('tube-man'))

  useFrame(({ clock }) => {
    if (!up) return
    const t = clock.elapsedTime
    // The air dips every few seconds: the body droops and sways wider.
    const dip = Math.max(0, Math.sin(t * 0.55)) ** 6
    const sway = 0.14 + 0.5 * dip
    HINGES.body.forEach((g, i) => {
      const k = i / BODY.segments
      g.rotation.x = sway * Math.sin(t * 3.1 + i * 0.9) * (0.4 + k)
      g.rotation.z =
        sway * 0.8 * Math.sin(t * 2.3 + i * 1.3 + 1) * (0.4 + k) + (i > 2 ? dip * 0.35 : 0)
    })
    ARMS.forEach((chain, side) => {
      const s = side === 0 ? -1 : 1
      HINGES[chain].forEach((g, i) => {
        const phase = t * (4.2 + side * 0.7) + i * 1.1
        // The first hinge holds the arm out sideways; the rest flap.
        g.rotation.z = (i === 0 ? -s * (1.2 - dip * 0.8) : 0) + s * 0.7 * Math.sin(phase)
        g.rotation.x = 0.5 * Math.sin(phase * 0.8 + side)
      })
    })
  })

  if (!up) return null
  const b = rectBounds(IMPROVEMENT_FOOTPRINTS['tube-man']!)
  return (
    <group position={[b.x, 0, b.z]} onPointerDown={swallowClick} onPointerUp={swallowClick}>
      {/* The blower. */}
      <mesh position-y={BASE_HEIGHT / 2} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.36, BASE_HEIGHT, 14]} />
        <meshStandardMaterial color="#3d4148" roughness={0.5} metalness={0.3} />
      </mesh>
      <group position-y={BASE_HEIGHT}>
        <Tube {...BODY} chain="body">
          {/* Shoulders: arms hang off the last body segment, under the head. */}
          {ARMS.map((chain, side) => (
            <group
              key={chain}
              position={[(side === 0 ? -1 : 1) * BODY.radius, BODY.length * 0.75, 0]}
            >
              <Tube {...ARM} chain={chain} />
            </group>
          ))}
          <Head />
        </Tube>
      </group>
    </group>
  )
}
