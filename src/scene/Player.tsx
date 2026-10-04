import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'
import { useWasd } from '../input/useWasd'
import type { Vec2 } from '../sim/grid'
import { hasLineOfSight, moveWithCollision, PLAYER_RADIUS, PLAYER_SPEED } from '../sim/movement'
import { findPath, smoothPath } from '../sim/pathfinding'
import { useGame } from '../state/store'
import { cameraState, grid, playerPos } from './runtime'

const TURN_RATE = 14

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + diff * (1 - Math.exp(-lambda * dt))
}

export function Player() {
  const group = useRef<Group>(null)
  const waypoints = useRef<Vec2[]>([])
  const heading = useRef(0)
  const plannedId = useRef<number | null>(null)
  const axes = useWasd()
  const moveOrder = useGame((s) => s.moveOrder)

  // A new click order: plan a path from wherever the player currently is.
  useEffect(() => {
    if (!moveOrder) {
      waypoints.current = []
      plannedId.current = null
      return
    }
    plannedId.current = moveOrder.id
    const start = grid.worldToTile(playerPos.x, playerPos.z)
    const tiles = findPath(grid, start, { tx: moveOrder.tx, tz: moveOrder.tz })
    if (!tiles) {
      useGame.getState().clearMoveOrder()
      return
    }
    const wps = smoothPath(grid, tiles).map((t) => grid.tileToWorld(t.tx, t.tz))
    // Skip the start tile's center when we can walk straight to the next waypoint.
    if (wps.length > 1 && hasLineOfSight(grid, playerPos, wps[1], PLAYER_RADIUS)) wps.shift()
    waypoints.current = wps
  }, [moveOrder])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const step = PLAYER_SPEED * dt
    let dx = 0
    let dz = 0

    const { forward, right } = axes.current
    if (forward !== 0 || right !== 0) {
      // Any movement key cancels a click path.
      if (waypoints.current.length > 0 || useGame.getState().moveOrder) {
        waypoints.current = []
        useGame.getState().clearMoveOrder()
      }
      const s = Math.sin(cameraState.yaw)
      const c = Math.cos(cameraState.yaw)
      // Camera-relative: forward points away from the camera, right is screen-right.
      const vx = -s * forward + c * right
      const vz = -c * forward - s * right
      const len = Math.hypot(vx, vz)
      dx = (vx / len) * step
      dz = (vz / len) * step
    } else if (waypoints.current.length > 0) {
      const wp = waypoints.current[0]
      const tx = wp.x - playerPos.x
      const tz = wp.z - playerPos.z
      const dist = Math.hypot(tx, tz)
      if (dist <= step) {
        dx = tx
        dz = tz
        waypoints.current.shift()
      } else {
        dx = (tx / dist) * step
        dz = (tz / dist) * step
      }
    }

    if (dx !== 0 || dz !== 0) {
      const next = moveWithCollision(grid, playerPos, dx, dz)
      const moved = Math.hypot(next.x - playerPos.x, next.z - playerPos.z)
      playerPos.x = next.x
      playerPos.z = next.z
      if (moved > 1e-6) {
        heading.current = dampAngle(heading.current, Math.atan2(dx, dz), TURN_RATE, dt)
      } else if (waypoints.current.length > 0) {
        // Pinned against geometry while following a path: give up rather than get stuck.
        waypoints.current = []
      }
    }

    // Path finished (or abandoned): drop the order so the marker disappears.
    const order = useGame.getState().moveOrder
    if (
      order &&
      order.id === plannedId.current &&
      waypoints.current.length === 0 &&
      dx === 0 &&
      dz === 0
    ) {
      useGame.getState().clearMoveOrder()
    }

    const g = group.current
    if (g) {
      g.position.set(playerPos.x, 0, playerPos.z)
      g.rotation.y = heading.current
    }
  })

  return (
    <group ref={group}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <capsuleGeometry args={[PLAYER_RADIUS, 0.6, 6, 12]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      {/* nose so the facing direction is visible */}
      <mesh position={[0, 0.8, PLAYER_RADIUS]} castShadow>
        <boxGeometry args={[0.2, 0.15, 0.2]} />
        <meshStandardMaterial color="#fde68a" />
      </mesh>
    </group>
  )
}
