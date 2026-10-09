import type { Grid, Tile } from './grid'
import { hasLineOfSight } from './movement'

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx)
  const dz = Math.abs(az - bz)
  return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)
}

/**
 * 8-directional A*. A diagonal step is only allowed when both orthogonal
 * neighbours are walkable (no corner cutting). Returns tiles from start to goal
 * inclusive, or null if the goal is blocked or unreachable.
 */
export function findPath(
  grid: Grid,
  start: Tile,
  goal: Tile,
  extraCost?: (index: number) => number,
): Tile[] | null {
  return findPathToAny(grid, start, [goal], extraCost)
}

/**
 * A* to whichever goal is cheapest to reach. Blocked goals are ignored; returns
 * null if no goal is reachable. The path ends on the chosen goal. `extraCost`
 * adds to the cost of stepping onto a tile (by index), e.g. to steer around people.
 */
export function findPathToAny(
  grid: Grid,
  start: Tile,
  goals: Tile[],
  extraCost?: (index: number) => number,
): Tile[] | null {
  const targets = goals.filter((t) => grid.isWalkable(t.tx, t.tz))
  if (!grid.inBounds(start.tx, start.tz) || targets.length === 0) return null

  const n = grid.width * grid.height
  const g = new Float64Array(n).fill(Infinity)
  const parent = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const isGoal = new Uint8Array(n)
  for (const t of targets) isGoal[grid.index(t.tx, t.tz)] = 1
  const open = new OpenHeap()
  // Admissible with several goals: the distance to the closest one.
  const h = (x: number, z: number) => {
    let best = Infinity
    for (const t of targets) best = Math.min(best, octile(x, z, t.tx, t.tz))
    return best
  }

  const s = grid.index(start.tx, start.tz)
  g[s] = 0
  open.push(s, h(start.tx, start.tz))

  while (open.size > 0) {
    const cur = open.pop()
    // A tile is pushed again each time its cost improves; the older entries are stale.
    if (closed[cur]) continue

    if (isGoal[cur]) {
      const path: Tile[] = []
      for (let i = cur; i !== -1; i = parent[i]) {
        path.push({ tx: i % grid.width, tz: Math.floor(i / grid.width) })
      }
      return path.reverse()
    }
    closed[cur] = 1

    const cx = cur % grid.width
    const cz = Math.floor(cur / grid.width)
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx
      const nz = cz + dz
      if (!grid.isWalkable(nx, nz)) continue
      if (dx !== 0 && dz !== 0 && !(grid.isWalkable(cx + dx, cz) && grid.isWalkable(cx, cz + dz))) {
        continue
      }
      const ni = grid.index(nx, nz)
      if (closed[ni]) continue
      const cost = g[cur] + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) + (extraCost?.(ni) ?? 0)
      if (cost < g[ni]) {
        g[ni] = cost
        parent[ni] = cur
        open.push(ni, cost + h(nx, nz))
      }
    }
  }
  return null
}

/**
 * A binary min-heap of tile indices keyed by f. No decrease-key: a tile whose
 * cost improves is pushed again, and the search skips it once it's closed.
 */
class OpenHeap {
  private items = new Int32Array(64)
  private keys = new Float64Array(64)
  size = 0

  push(item: number, key: number): void {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2)
      const keys = new Float64Array(this.size * 2)
      items.set(this.items)
      keys.set(this.keys)
      this.items = items
      this.keys = keys
    }
    let i = this.size++
    while (i > 0) {
      const up = (i - 1) >> 1
      if (this.keys[up] <= key) break
      this.items[i] = this.items[up]
      this.keys[i] = this.keys[up]
      i = up
    }
    this.items[i] = item
    this.keys[i] = key
  }

  /** Takes the item with the smallest key. Only call while `size > 0`. */
  pop(): number {
    const top = this.items[0]
    const last = --this.size
    const item = this.items[last]
    const key = this.keys[last]
    let i = 0
    for (;;) {
      let child = 2 * i + 1
      if (child >= last) break
      if (child + 1 < last && this.keys[child + 1] < this.keys[child]) child++
      if (this.keys[child] >= key) break
      this.items[i] = this.items[child]
      this.keys[i] = this.keys[child]
      i = child
    }
    this.items[i] = item
    this.keys[i] = key
    return top
  }
}

/** Greedy string-pulling: drops waypoints whenever a straight, clearance-safe line exists. */
export function smoothPath(grid: Grid, path: Tile[]): Tile[] {
  if (path.length <= 2) return path
  const pts = path.map((t) => grid.tileToWorld(t.tx, t.tz))
  const out: Tile[] = [path[0]]
  let a = 0
  while (a < path.length - 1) {
    let b = path.length - 1
    while (b > a + 1 && !hasLineOfSight(grid, pts[a], pts[b])) b--
    out.push(path[b])
    a = b
  }
  return out
}
