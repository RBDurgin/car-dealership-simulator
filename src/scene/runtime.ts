import { Reservations, type Agent } from '../sim/crowd'
import { PLAYER_ID } from '../sim/customers'
import { spotsInUse } from '../sim/driving'
import { customerInteractable, deskActions, employeeActions, personInteractable } from '../sim/deal'
import type { Tile, Vec2 } from '../sim/grid'
import { expansionsUp } from '../sim/expansions'
import { improvementFootprints, installed, type ImprovementId } from '../sim/improvements'
import {
  approachTilesFor,
  buildInteractables,
  carName,
  type Interactable,
} from '../sim/interactables'
import { applyToGrid, availableCars, carProp, type InventoryCar } from '../sim/inventory'
import { nearestStandable, PLAYER_RADIUS } from '../sim/movement'
import { NAZMA_ID } from '../sim/nazma'
import {
  buildLayout,
  createGrid,
  CUSTOMER_PARKING,
  DESK_CHAIR_ID,
  GUEST_CHAIR_ID,
  parkedCarRect,
  SALES_DESKS,
  SPAWN_TILE,
  type ExpansionId,
  type Rect,
} from '../sim/layout'
import { vehicleOwnerId } from '../sim/sellers'
import { POSTS } from '../sim/staff'
import { useGame } from '../state/store'

/** Expansions the layout was last built with. */
let groundNow: ExpansionId[] = expansionsUp(useGame.getState())

/**
 * The dealership as it stands today. Rebuilt in place (`regrounded`) the
 * morning an expansion goes up; components that draw from it redraw through
 * `useGround`.
 */
export const layout = buildLayout(groundNow)

// Mutable per-frame state shared between scene components. Deliberately not in the
// zustand store: these change every frame and must never trigger React renders.
export const grid = createGrid(layout)

export const interactables = new Map<string, Interactable>()

/** Improvements up today, which block their footprints. */
let upNow: ImprovementId[] = []

/**
 * Customer-parking spaces with a car parked in them (a visitor's, or one we
 * bought today), which block its footprint.
 */
let parkedSpots = new Set<number>()

/**
 * Starts the grid again from the layout, with the parked cars back on it.
 * Runs each morning, before `syncWorld` puts the stock and improvements back,
 * so ground that changed overnight is walkable (or not) from the start of the day.
 */
function resetGrid(): void {
  grid.copyFrom(createGrid(layout))
  for (const n of parkedSpots) grid.setRectBlocked(parkedCarRect(CUSTOMER_PARKING[n]), true)
}

/**
 * Blocks/frees car and improvement footprints and rebuilds the interactables
 * to match. Improvements are only ever added.
 */
function syncWorld(inventory: readonly InventoryCar[], improvements: ImprovementId[]): void {
  applyToGrid(grid, inventory)
  upNow = improvements
  for (const rect of improvementFootprints(improvements)) grid.setRectBlocked(rect, true)
  // Rebuild everything, not just the cars: a freed footprint can open up new
  // approach tiles for its neighbours.
  interactables.clear()
  const props = [...layout.props, ...availableCars(inventory).map(carProp)]
  for (const [id, it] of buildInteractables(grid, props)) interactables.set(id, it)
}

const spawn = grid.tileToWorld(SPAWN_TILE.tx, SPAWN_TILE.tz)
export const playerPos = { x: spawn.x, z: spawn.z }

const upOn = (s: ReturnType<typeof useGame.getState>) => installed(s.improvements, s.clock.day)

/** Builds the layout again if the expansions up have changed. True if it did. */
function regrounded(ground: ExpansionId[]): boolean {
  if (ground.length === groundNow.length && ground.every((id) => groundNow.includes(id))) {
    return false
  }
  groundNow = ground
  Object.assign(layout, buildLayout(ground))
  return true
}

syncWorld(useGame.getState().inventory, upOn(useGame.getState()))
// Runs synchronously inside the store update, before React re-renders anything.
useGame.subscribe((s, prev) => {
  const up = upOn(s)
  const raised = up.filter((id) => !upNow.includes(id))
  const morning = s.clock.day !== prev.clock.day
  if (!morning && s.inventory === prev.inventory && raised.length === 0) return
  // New ground only ever opens up, so nobody needs stepping out of it.
  if (regrounded(expansionsUp(s)) || morning) resetGrid()
  syncWorld(s.inventory, up)
  // A car delivered or an improvement put up overnight where the player ended
  // the day steps them out. Only new ones: the player sits on a blocked chair tile.
  const known = new Set(prev.inventory.map((c) => c.id))
  const added = [
    ...s.inventory.filter((c) => !known.has(c.id)).map((c) => c.rect),
    ...improvementFootprints(raised),
  ]
  if (added.some((rect) => touches(rect, playerPos))) {
    Object.assign(playerPos, nearestStandable(grid, playerPos))
  }
})

useGame.subscribe((s, prev) => {
  if (s.customers === prev.customers && s.purchases === prev.purchases) return
  const parked = new Set([
    ...spotsInUse(s.customers.filter((c) => c.vehicle?.parked)),
    ...s.purchases.map((p) => p.spot),
  ])
  if (parked.size === parkedSpots.size && [...parked].every((n) => parkedSpots.has(n))) return
  CUSTOMER_PARKING.forEach((space, n) => {
    if (parked.has(n) === parkedSpots.has(n)) return
    const rect = parkedCarRect(space)
    grid.setRectBlocked(rect, parked.has(n))
    if (parked.has(n) && touches(rect, playerPos)) {
      Object.assign(playerPos, nearestStandable(grid, playerPos))
    }
  })
  parkedSpots = parked
})

/** Whether someone standing at `pos` overlaps the tiles of `rect`. */
function touches(rect: Rect, pos: Vec2): boolean {
  return [-PLAYER_RADIUS, PLAYER_RADIUS].some((ox) =>
    [-PLAYER_RADIUS, PLAYER_RADIUS].some((oz) => {
      const { tx, tz } = grid.worldToTile(pos.x + ox, pos.z + oz)
      return tx >= rect.tx && tx < rect.tx + rect.w && tz >= rect.tz && tz < rect.tz + rect.h
    }),
  )
}

/**
 * Where each customer in the world is standing, by customer id. Owned and moved by
 * scene/Customers; the store never sees positions.
 */
export const customerPos = new Map<string, Vec2>()

/**
 * Browsing customers standing at a car, looking it over (rather than walking
 * between cars). Owned by scene/Customers; less skilled salespeople wait for this.
 */
export const customersAtCar = new Set<string>()

/** Where each employee on the lot is standing, by employee id. Owned by scene/Staff. */
export const staffPos = new Map<string, Vec2>()

/**
 * Visitors' cars in the world, by their customer's id: where each one's
 * centre is, which way it faces, and whether it's on the move. Owned by
 * scene/DrivenCar. A moving car counts as people along its length, so walkers
 * step around it.
 */
export const vehiclePos = new Map<string, { pos: Vec2; heading: number; moving: boolean }>()

/** Points along a moving car, either side of its centre, that walkers keep clear of. */
const CAR_BODY_OFFSETS = [-1, 0, 1]

/**
 * Walkers the store doesn't know about: passers-by (scene/Pedestrians), a
 * couple's companion (scene/Customers), the owner (scene/Owner) and Nazma
 * (scene/Nazma). Here only
 * so everyone else keeps their distance.
 */
export const ambientPos = new Map<string, Vec2>()

/**
 * A passer-by who just walked in, by their new customer id: where they were
 * on the sidewalk and the end they were heading for. scene/Customers picks
 * them up from here instead of a sidewalk end, and they leave the way they
 * were going.
 */
export const walkInSpawns = new Map<string, { pos: Vec2; heading: number; exit: Tile }>()

/**
 * Everyone standing in the world (customers, staff, passers-by, the player), for walkers to
 * keep their distance from. Anyone seated is left out: chairs block their tile,
 * so nobody can walk into them anyway.
 */
export function crowdAgents(): Agent[] {
  const agents: Agent[] = []
  const add = (id: string, pos: Vec2) => {
    const t = grid.worldToTile(pos.x, pos.z)
    if (grid.isWalkable(t.tx, t.tz)) agents.push({ id, pos })
  }
  add(PLAYER_ID, playerPos)
  for (const [id, pos] of customerPos) add(id, pos)
  for (const [id, pos] of staffPos) add(id, pos)
  for (const [id, pos] of ambientPos) add(id, pos)
  for (const [id, car] of vehiclePos) {
    if (!car.moving) continue
    const fx = Math.sin(car.heading)
    const fz = Math.cos(car.heading)
    CAR_BODY_OFFSETS.forEach((d, i) =>
      add(`${id}:car${i}`, { x: car.pos.x + fx * d, z: car.pos.z + fz * d }),
    )
  }
  return agents
}

/** Goal tiles walkers have claimed, so they spread out around a car instead of stacking. */
export const reservations = new Reservations()
// The spots by the office chairs, sales desks and staff posts are kept clear of browsers.
const SEATS = [
  GUEST_CHAIR_ID,
  DESK_CHAIR_ID,
  ...Object.values(POSTS),
  ...SALES_DESKS.flatMap((d) => [d.chairId, d.guestChairId]),
]
for (const id of SEATS) {
  const chair = id && layout.props.find((p) => p.id === id)
  if (!chair) continue
  const tiles = approachTilesFor(grid, chair.rect).map((t) => grid.index(t.tx, t.tz))
  reservations.hold(tiles, `seat:${id}`)
}

/**
 * An action target by id: a prop or car, a seller's parked car, or a customer, employee or Nazma approached
 * from where they're standing right now. Undefined if it's gone.
 */
export function findInteractable(id: string): Interactable | undefined {
  const game = useGame.getState()
  const it = interactables.get(id)
  // The finance manager works from the desk chair while they're on shift.
  if (it && id === DESK_CHAIR_ID) return { ...it, actions: deskActions(game.roster) }
  if (it) return it
  const c = game.customers.find((x) => x.id === id)
  const cPos = customerPos.get(id)
  if (c && cPos) return customerInteractable(grid, c, grid.worldToTile(cPos.x, cPos.z))
  const e = game.roster.find((x) => x.id === id)
  const ePos = staffPos.get(id)
  if (e && ePos) {
    const tile = grid.worldToTile(ePos.x, ePos.z)
    return personInteractable(grid, e, 'employee', tile, employeeActions(e, game.roster))
  }
  // A seller's parked car, to appraise.
  const owner = game.customers.find((x) => x.id === vehicleOwnerId(id))
  if (owner?.vehicle?.parked) {
    const rect = parkedCarRect(CUSTOMER_PARKING[owner.vehicle.spot])
    return {
      id,
      kind: 'car',
      name: `${owner.name}'s ${carName(owner.vehicle.car.model)}`,
      rect,
      facing: CUSTOMER_PARKING[owner.vehicle.spot].facing,
      approachTiles: approachTilesFor(grid, rect),
      actions: owner.selling || owner.trade ? ['appraise'] : [],
    }
  }
  const nPos = id === NAZMA_ID ? ambientPos.get(id) : undefined
  if (nPos && game.nazma?.status === 'onLot') {
    const tile = grid.worldToTile(nPos.x, nPos.z)
    return personInteractable(grid, { id, name: 'Nazma' }, 'nazma', tile, ['confront'])
  }
  return undefined
}

/**
 * Camera yaw in radians: `yaw` is the current (eased) value, `yawTarget` where it's
 * heading. 0 = camera on +z looking toward -z. `focus` is the ground point it
 * looks at, easing after the player.
 */
export const cameraState = {
  yaw: useGame.getState().viewYaw,
  yawTarget: useGame.getState().viewYaw,
  focus: { x: playerPos.x, z: playerPos.z },
}

/** Turns the view a quarter turn: 1 = counter-clockwise (Q), -1 = clockwise (E). */
export function rotateView(dir: 1 | -1): void {
  cameraState.yawTarget += (dir * Math.PI) / 2
  useGame.getState().setViewYaw(cameraState.yawTarget)
}

/** Precise running game time. The store only sees it in 10-minute steps. */
export const gameTime = { ...useGame.getState().clock }

/** World-space center and size of a tile rect. */
export function rectBounds(r: Rect) {
  const a = grid.tileToWorld(r.tx, r.tz)
  return { x: a.x + (r.w - 1) / 2, z: a.z + (r.h - 1) / 2, w: r.w, h: r.h }
}
