import { COOKOUT, isAppreciationDay } from '../sim/appreciation'
import { Reservations, SpatialHash, type Agent } from '../sim/crowd'
import { PLAYER_ID } from '../sim/customers'
import { spotsInUse } from '../sim/driving'
import { customerInteractable, deskActions, employeeActions, personInteractable } from '../sim/deal'
import type { Tile, Vec2 } from '../sim/grid'
import { expansionsUp } from '../sim/expansions'
import { improvementFootprints, type ImprovementId } from '../sim/improvements'
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
  MANAGER_DESK,
  parkedCarRect,
  SALES_DESKS,
  SERVICE_SPOTS,
  SPAWN_TILE,
  type ExpansionId,
  type Rect,
} from '../sim/layout'
import { vehicleOwnerId } from '../sim/sellers'
import { bayCount, RECON_MAX } from '../sim/service'
import { POSTS } from '../sim/staff'
import { groundUp, upNow as upToday } from '../state/selectors'
import { useGame } from '../state/store'
import { sameFields, subscribeTo } from '../state/subscribe'

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
 * so ground that changed overnight is walkable (or not) from the start of the
 * day. On client appreciation day the cookout blocks its ground.
 */
function resetGrid(): void {
  grid.copyFrom(createGrid(layout))
  for (const n of parkedSpots) grid.setRectBlocked(parkedCarRect(CUSTOMER_PARKING[n]), true)
  for (const n of serviceSpotsTaken) grid.setRectBlocked(parkedCarRect(SERVICE_SPOTS[n]), true)
  // The cookout stands on the forecourt all of client appreciation day.
  const s = useGame.getState()
  if (isAppreciationDay(s.appreciation, s.clock.day)) grid.setRectBlocked(COOKOUT, true)
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

/**
 * The player is in a test drive car (or off the map in it): hidden, and out
 * of the crowd, with the shopper `with` (whose voice comes from the player's
 * spot). Set by scene/Player each frame. `playerPos` stays by the car's
 * door, so the camera waits on the lot.
 */
export const riding: { player: boolean; with: string | null } = { player: false, with: null }

/**
 * Test drives on the road, by their customer's id: game minutes left until
 * the car is back, and the drive's length. Kept by scene/DrivenCar for the
 * HUD's drive bar.
 */
export const driveClock = new Map<string, { left: number; total: number }>()

/** Builds the layout again if the expansions up have changed. True if it did. */
function regrounded(ground: ExpansionId[]): boolean {
  if (ground.length === groundNow.length && ground.every((id) => groundNow.includes(id))) {
    return false
  }
  groundNow = ground
  Object.assign(layout, buildLayout(ground))
  return true
}

syncWorld(useGame.getState().inventory, upToday(useGame.getState()))
// Runs synchronously inside the store update, before React re-renders anything.
subscribeTo(
  (s) => s,
  (s, prev) => {
    const up = upToday(s)
    const raised = up.filter((id) => !upNow.includes(id))
    const morning = s.clock.day !== prev.clock.day
    if (!morning && s.inventory === prev.inventory && raised.length === 0) return
    // New ground only ever opens up, so nobody needs stepping out of it.
    const rebuilt = regrounded(groundUp(s))
    if (rebuilt || morning) resetGrid()
    syncWorld(s.inventory, up)
    if (rebuilt) holdSeats()
    // A car delivered, back from the shop or an improvement put up overnight
    // where the player stands steps them out. Only new ones: the player sits on
    // a blocked chair tile.
    const before = new Map(prev.inventory.map((c) => [c.id, c.status]))
    const added = [
      ...s.inventory
        .filter((c) => c.status === 'available' && before.get(c.id) !== 'available')
        .map((c) => c.rect),
      ...improvementFootprints(raised),
    ]
    if (added.some((rect) => touches(rect, playerPos))) {
      Object.assign(playerPos, nearestStandable(grid, playerPos))
    }
  },
  (a, b) => a.clock.day === b.clock.day && sameFields(a, b, ['inventory', 'improvements']),
)

subscribeTo(
  (s) => s,
  (s) => {
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
  },
  (a, b) => sameFields(a, b, ['customers', 'purchases']),
)

/**
 * Service spaces with a client's car standing in them (not off in a bay),
 * which block its footprint like customer parking.
 */
let serviceSpotsTaken = new Set<number>()

subscribeTo(
  (s) => s,
  (s) => {
    const inBay = new Set(
      s.serviceJobs.filter((j) => j.status === 'inBay').map((j) => j.customerId),
    )
    const taken = new Set(
      [...s.customers, ...s.serviceAway].flatMap((c) =>
        c.service?.parked && !inBay.has(c.id) ? [c.service.spot] : [],
      ),
    )
    SERVICE_SPOTS.forEach((space, n) => {
      if (taken.has(n) === serviceSpotsTaken.has(n)) return
      const rect = parkedCarRect(space)
      grid.setRectBlocked(rect, taken.has(n))
      if (taken.has(n) && touches(rect, playerPos)) {
        Object.assign(playerPos, nearestStandable(grid, playerPos))
      }
    })
    serviceSpotsTaken = taken
  },
  (a, b) => sameFields(a, b, ['customers', 'serviceAway', 'serviceJobs']),
)

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

/**
 * Service clients standing at the garage's counter, waiting to be checked in.
 * Owned by scene/Customers; the service advisor checks in only those who are there.
 */
export const atCounter = new Set<string>()

/**
 * Service clients whose car is standing in its service space (not driving,
 * not in a bay). Owned by scene/DrivenCar; a client collecting waits for it.
 */
export const serviceCarsHome = new Set<string>()

/**
 * The garage's lifts: the bays with a client's car standing on them (from
 * scene/DrivenCar, which raises the car with the lift) and each lift's
 * height (from scene/Garage).
 */
export const lifts = { cars: new Set<number>(), heights: [] as number[] }

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

/** Counts frames (GameClock bumps it first thing each frame), so the crowd is gathered once a frame. */
let frameNo = 0
export function nextFrame(): void {
  frameNo++
}

/** The crowd as last gathered, its frame, and the objects reused to gather it. */
const crowd: Agent[] = []
let crowdFrame = -1
const agentPool: Agent[] = []
const carPoints: Vec2[] = []
const carIds = new Map<string, string[]>()
const crowdHash = new SpatialHash()

/**
 * Everyone standing in the world (customers, staff, passers-by, the player), for walkers to
 * keep their distance from. Anyone seated is left out: chairs block their tile,
 * so nobody can walk into them anyway. Gathered once a frame, into an array
 * that's reused: each entry holds the walker's own position, so it moves with
 * them through the frame, while a moving car's points stay where the car was
 * when the frame's crowd was gathered.
 */
export function crowdAgents(): readonly Agent[] {
  if (crowdFrame === frameNo) return crowd
  crowdFrame = frameNo
  crowd.length = 0
  let points = 0
  const add = (id: string, pos: Vec2) => {
    // As `grid.worldToTile`, without making a tile.
    const tx = Math.floor(pos.x + grid.width / 2)
    const tz = Math.floor(pos.z + grid.height / 2)
    if (!grid.isWalkable(tx, tz)) return
    const a = (agentPool[crowd.length] ??= { id, pos })
    a.id = id
    a.pos = pos
    crowd.push(a)
  }
  if (!riding.player) add(PLAYER_ID, playerPos)
  for (const [id, pos] of customerPos) add(id, pos)
  for (const [id, pos] of staffPos) add(id, pos)
  for (const [id, pos] of ambientPos) add(id, pos)
  for (const [id, car] of vehiclePos) {
    if (!car.moving) continue
    const fx = Math.sin(car.heading)
    const fz = Math.cos(car.heading)
    const ids = carIds.get(id) ?? CAR_BODY_OFFSETS.map((_, i) => `${id}:car${i}`)
    carIds.set(id, ids)
    CAR_BODY_OFFSETS.forEach((d, i) => {
      const p = (carPoints[points++] ??= { x: 0, z: 0 })
      p.x = car.pos.x + fx * d
      p.z = car.pos.z + fz * d
      add(ids[i], p)
    })
  }
  for (const id of carIds.keys()) if (!vehiclePos.has(id)) carIds.delete(id)
  crowdHash.build(crowd)
  return crowd
}

/**
 * Those in the crowd who might be within `reach` of `pos`, into `out`: the
 * frame's crowd, looked up by cell (see `SpatialHash`).
 */
export function crowdNear(pos: Vec2, reach: number, out: Agent[]): Agent[] {
  crowdAgents()
  return crowdHash.near(pos, reach, out)
}

/** Goal tiles walkers have claimed, so they spread out around a car instead of stacking. */
export const reservations = new Reservations()
// The spots by the office chairs, sales desks and staff posts are kept clear of browsers.
const SEATS = [
  GUEST_CHAIR_ID,
  DESK_CHAIR_ID,
  MANAGER_DESK.chairId,
  MANAGER_DESK.guestChairId,
  ...Object.values(POSTS),
  ...SALES_DESKS.flatMap((d) => [d.chairId, d.guestChairId]),
]

/** Holds the spots by every chair standing today: again when the wing's desks go up. */
function holdSeats(): void {
  for (const id of SEATS) {
    const chair = id && layout.props.find((p) => p.id === id)
    if (!chair) continue
    const tiles = approachTilesFor(grid, chair.rect).map((t) => grid.index(t.tx, t.tz))
    reservations.hold(tiles, `seat:${id}`)
  }
}
holdSeats()

/** Whether car `id` is a used one the garage could do up. */
function canRecondition(game: ReturnType<typeof useGame.getState>, id: string): boolean {
  const car = game.inventory.find((c) => c.id === id)
  return !!car?.used && car.used.condition < RECON_MAX && bayCount(expansionsUp(game)) > 0
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
  // A worn used car can go to the service garage once there is one.
  if (it?.kind === 'car' && canRecondition(game, id)) {
    return { ...it, actions: [...it.actions, 'recondition'] }
  }
  if (it) return it
  const c = game.customers.find((x) => x.id === id)
  const cPos = customerPos.get(id)
  if (c && cPos) {
    return customerInteractable(grid, c, grid.worldToTile(cPos.x, cPos.z), game.serviceJobs)
  }
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
  // A car out for a test drive, standing in its space while they walk to it.
  const out = game.inventory.find((c) => c.id === id && c.status === 'out')
  if (out) {
    return {
      id,
      kind: 'car',
      name: `The ${carName(out.model)}`,
      rect: out.rect,
      facing: out.facing,
      approachTiles: approachTilesFor(grid, out.rect),
      actions: ['ride'],
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
