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
export function findPath(grid: Grid, start: Tile, goal: Tile): Tile[] | null {
  if (!grid.inBounds(start.tx, start.tz) || !grid.isWalkable(goal.tx, goal.tz)) return null

  const n = grid.width * grid.height
  const g = new Float64Array(n).fill(Infinity)
  const f = new Float64Array(n)
  const parent = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const open: number[] = []

  const s = grid.index(start.tx, start.tz)
  const goalIdx = grid.index(goal.tx, goal.tz)
  g[s] = 0
  f[s] = octile(start.tx, start.tz, goal.tx, goal.tz)
  open.push(s)

  while (open.length > 0) {
    let best = 0
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[best]]) best = i
    const cur = open[best]
    open[best] = open[open.length - 1]
    open.pop()

    if (cur === goalIdx) {
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
      const cost = g[cur] + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1)
      if (cost < g[ni]) {
        g[ni] = cost
        f[ni] = cost + octile(nx, nz, goal.tx, goal.tz)
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
