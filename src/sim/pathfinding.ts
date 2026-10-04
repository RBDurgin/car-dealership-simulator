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
  const f = new Float64Array(n)
  const parent = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const isGoal = new Uint8Array(n)
  for (const t of targets) isGoal[grid.index(t.tx, t.tz)] = 1
  const open: number[] = []
  // Admissible with several goals: the distance to the closest one.
  const h = (x: number, z: number) => {
    let best = Infinity
    for (const t of targets) best = Math.min(best, octile(x, z, t.tx, t.tz))
    return best
  }

  const s = grid.index(start.tx, start.tz)
  g[s] = 0
  f[s] = h(start.tx, start.tz)
  open.push(s)

  while (open.length > 0) {
    let best = 0
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[best]]) best = i
    const cur = open[best]
    open[best] = open[open.length - 1]
    open.pop()

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
        f[ni] = cost + h(nx, nz)
        parent[ni] = cur
        if (!open.includes(ni)) open.push(ni)
      }
    }
  }
  return null
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
