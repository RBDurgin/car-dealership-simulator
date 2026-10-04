import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import type { Group } from 'three'
import { useWasd } from '../input/useWasd'
import { isTimedActionDone, type ActiveAction } from '../sim/actions'
import { angleDiff, dampAngle, stepAlongPath, toWaypoints } from '../sim/agent'
import { SEAT_HEIGHT, type CharacterAnim } from '../sim/characters'
import { inConversation } from '../sim/deal'
import type { Vec2 } from '../sim/grid'
import { interactableCenter, pathToInteractable } from '../sim/interactables'
import { moveWithCollision, PLAYER_SPEED } from '../sim/movement'
import { findPath } from '../sim/pathfinding'
import { useGame, type MoveOrder } from '../state/store'
import { Character } from './Character'
import { cameraState, findInteractable, grid, playerPos } from './runtime'

const TURN_RATE = 14
/** How closely the player must face an object before the action starts. */
const FACE_TOLERANCE = 0.15
const ARRIVE_EPSILON = 0.05

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
  /** Sat down to close a deal; the paperwork starts once the customer sits too. */
  const awaitingSignature = useRef<number | null>(null)
  const anim = useRef<CharacterAnim>('idle')
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
    awaitingSignature.current = null
    standUp()

    const game = useGame.getState()
    const start = grid.worldToTile(playerPos.x, playerPos.z)
    if (activeAction) {
      const it = findInteractable(activeAction.targetId)
      const tiles = it && pathToInteractable(grid, start, it)
      if (!it || !tiles) {
        game.cancelAction()
        game.showNotice("Can't reach that from here.")
        return
      }
      const last = tiles[tiles.length - 1]
      waypoints.current = toWaypoints(grid, tiles, playerPos)
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
      waypoints.current = toWaypoints(grid, tiles, playerPos)
    }
  }, [moveOrder, activeAction])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const game = useGame.getState()
    let dx = 0
    let dz = 0
    let moved = 0

    // Movement keys do nothing behind the title screen.
    const { forward, right } = game.screen === 'title' ? { forward: 0, right: 0 } : axes.current
    if (forward !== 0 || right !== 0) {
      // Any movement key stands the player up and cancels a click path, an action
      // or a conversation.
      standUp()
      const talking = inConversation(game.customers)
      if (waypoints.current.length > 0 || game.moveOrder || game.activeAction || talking) {
        waypoints.current = []
        approach.current = null
        game.walkAway()
      }
      const s = Math.sin(cameraState.yaw)
      const c = Math.cos(cameraState.yaw)
      // Camera-relative: forward points away from the camera, right is screen-right.
      const vx = -s * forward + c * right
      const vz = -c * forward - s * right
      const len = Math.hypot(vx, vz)
      const step = PLAYER_SPEED * dt
      dx = (vx / len) * step
      dz = (vz / len) * step
      const next = moveWithCollision(grid, playerPos, dx, dz)
      moved = Math.hypot(next.x - playerPos.x, next.z - playerPos.z)
      playerPos.x = next.x
      playerPos.z = next.z
    } else if (waypoints.current.length > 0) {
      // Gives up on the path by itself if pinned against geometry.
      const s = stepAlongPath(grid, playerPos, waypoints.current, PLAYER_SPEED, dt)
      dx = s.dx
      dz = s.dz
      moved = s.moved
      playerPos.x = s.x
      playerPos.z = s.z
    }
    if (moved > 1e-6) {
      heading.current = dampAngle(heading.current, Math.atan2(dx, dz), TURN_RATE, dt)
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
          if (a?.action === 'sit' || a?.action === 'closeDeal') {
            const it = findInteractable(a.targetId)!
            seat.current = { stand: { x: playerPos.x, z: playerPos.z } }
            playerPos.x = ap.faceTo.x
            playerPos.z = ap.faceTo.z
            heading.current = (it.facing * Math.PI) / 2
          }
          if (a?.action === 'closeDeal') awaitingSignature.current = ap.actionId
          else game.arriveAction(ap.actionId)
        }
      }
    }
    if (awaitingSignature.current !== null && game.customers.some((c) => c.phase === 'signing')) {
      game.arriveAction(awaitingSignature.current)
      awaitingSignature.current = null
    }

    const a = game.activeAction
    if (a && isTimedActionDone(a, performance.now())) game.completeAction(a.id)

    const g = group.current
    if (g) {
      g.position.set(playerPos.x, 0, playerPos.z)
      g.rotation.y = heading.current
    }
    const b = body.current
    if (b) b.position.y = seat.current ? SEAT_HEIGHT : 0
    anim.current = seat.current ? 'sit' : moved > 1e-6 ? 'sprint' : 'idle'
  })

  return (
    <group ref={group}>
      <group ref={body}>
        <Suspense fallback={null}>
          <Character variant="salesperson" anim={anim} moveSpeed={PLAYER_SPEED} />
        </Suspense>
      </group>
    </group>
  )
}
