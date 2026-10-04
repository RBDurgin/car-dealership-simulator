import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'
import { useWasd } from '../input/useWasd'
import { isTimedActionDone, type ActiveAction } from '../sim/actions'
import type { Tile, Vec2 } from '../sim/grid'
import { interactableCenter, pathToInteractable } from '../sim/interactables'
import { hasLineOfSight, moveWithCollision, PLAYER_RADIUS, PLAYER_SPEED } from '../sim/movement'
import { findPath, smoothPath } from '../sim/pathfinding'
import { useGame, type MoveOrder } from '../state/store'
import { cameraState, grid, interactables, playerPos } from './runtime'

const TURN_RATE = 14
/** How closely the player must face an object before the action starts. */
const FACE_TOLERANCE = 0.15
const ARRIVE_EPSILON = 0.05
const SEAT_HEIGHT = 0.28
const SEATED_SCALE = 0.72

function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a))
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + angleDiff(current, target) * (1 - Math.exp(-lambda * dt))
}

/** Tile path → world waypoints, skipping the start tile's center when it's not needed. */
function toWaypoints(tiles: Tile[]): Vec2[] {
  const wps = smoothPath(grid, tiles).map((t) => grid.tileToWorld(t.tx, t.tz))
  if (wps.length > 1 && hasLineOfSight(grid, playerPos, wps[1], PLAYER_RADIUS)) wps.shift()
  return wps
}

interface Approach {
  actionId: number
  goal: Vec2
  faceTo: Vec2
}

interface Seat {
  /** Where to stand up to: the approach tile the player sat down from. */
  stand: Vec2
}

/** Which order the current path belongs to, e.g. `move:3` or `action:7`. */
function ownerKey(order: MoveOrder | null, action: ActiveAction | null): string | null {
  if (action) return `action:${action.id}`
  if (order) return `move:${order.id}`
  return null
}

export function Player() {
  const group = useRef<Group>(null)
  const body = useRef<Group>(null)
  const waypoints = useRef<Vec2[]>([])
  const heading = useRef(0)
  const owner = useRef<string | null>(null)
  const approach = useRef<Approach | null>(null)
  const seat = useRef<Seat | null>(null)
  const axes = useWasd()
  const moveOrder = useGame((s) => s.moveOrder)
  const activeAction = useGame((s) => s.activeAction)

  const standUp = () => {
    if (!seat.current) return
    playerPos.x = seat.current.stand.x
    playerPos.z = seat.current.stand.z
    seat.current = null
  }

  // A new move order or action: plan a path from wherever the player is. The store
  // keeps the two mutually exclusive, so whichever is set owns the path.
  useEffect(() => {
    const key = ownerKey(moveOrder, activeAction)
    if (key === owner.current) return // same order, e.g. an action moving to `performing`
    owner.current = key
    waypoints.current = []
    approach.current = null
    standUp()

    const game = useGame.getState()
    const start = grid.worldToTile(playerPos.x, playerPos.z)
    if (activeAction) {
      const it = interactables.get(activeAction.targetId)
      const tiles = it && pathToInteractable(grid, start, it)
      if (!it || !tiles) {
        game.cancelAction()
        game.showNotice("Can't reach that from here.")
        return
      }
      const last = tiles[tiles.length - 1]
      waypoints.current = toWaypoints(tiles)
      approach.current = {
        actionId: activeAction.id,
        goal: grid.tileToWorld(last.tx, last.tz),
        faceTo: interactableCenter(grid, it),
      }
    } else if (moveOrder) {
      const tiles = findPath(grid, start, { tx: moveOrder.tx, tz: moveOrder.tz })
      if (!tiles) {
        game.clearMoveOrder()
        return
      }
      waypoints.current = toWaypoints(tiles)
    }
  }, [moveOrder, activeAction])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const step = PLAYER_SPEED * dt
    const game = useGame.getState()
    let dx = 0
    let dz = 0

    const { forward, right } = axes.current
    if (forward !== 0 || right !== 0) {
      // Any movement key stands the player up and cancels a click path or action.
      standUp()
      if (waypoints.current.length > 0 || game.moveOrder || game.activeAction) {
        waypoints.current = []
        approach.current = null
        game.clearMoveOrder()
        game.cancelAction()
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

    const idle = waypoints.current.length === 0 && dx === 0 && dz === 0
    const order = game.moveOrder
    // Path finished (or abandoned): drop the order so the marker disappears.
    if (idle && order && owner.current === `move:${order.id}`) game.clearMoveOrder()

    // Reached the object (or gave up on the way): turn to face it, then start the action.
    const ap = approach.current
    if (idle && ap) {
      if (Math.hypot(ap.goal.x - playerPos.x, ap.goal.z - playerPos.z) > ARRIVE_EPSILON) {
        approach.current = null
        game.cancelAction()
        game.showNotice("Couldn't get there.")
      } else {
        const face = Math.atan2(ap.faceTo.x - playerPos.x, ap.faceTo.z - playerPos.z)
        heading.current = dampAngle(heading.current, face, TURN_RATE, dt)
        if (Math.abs(angleDiff(heading.current, face)) < FACE_TOLERANCE) {
          approach.current = null
          const a = game.activeAction
          if (a?.action === 'sit') {
            const it = interactables.get(a.targetId)!
            seat.current = { stand: { x: playerPos.x, z: playerPos.z } }
            playerPos.x = ap.faceTo.x
            playerPos.z = ap.faceTo.z
            heading.current = (it.facing * Math.PI) / 2
          }
          game.arriveAction(ap.actionId)
        }
      }
    }

    const a = game.activeAction
    if (a && isTimedActionDone(a, performance.now())) game.completeAction(a.id)

    const g = group.current
    if (g) {
      g.position.set(playerPos.x, 0, playerPos.z)
      g.rotation.y = heading.current
    }
    const b = body.current
    if (b) {
      b.position.y = seat.current ? SEAT_HEIGHT : 0
      b.scale.y = seat.current ? SEATED_SCALE : 1
    }
  })

  return (
    <group ref={group}>
      <group ref={body}>
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
    </group>
  )
}
