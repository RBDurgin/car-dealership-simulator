import { Grid } from './grid'

export const GRID_WIDTH = 40
export const GRID_HEIGHT = 30
export const SPAWN_TILE = { tx: 20, tz: 15 }

export interface Rect {
  tx: number
  tz: number
  w: number
  h: number
}

// Temporary obstacle field for exercising movement; 1c replaces it with the dealership layout.
export const OBSTACLES: Rect[] = [
  { tx: 23, tz: 8, w: 1, h: 9 }, // long wall
  { tx: 13, tz: 18, w: 7, h: 1 },
  { tx: 12, tz: 8, w: 3, h: 3 },
  { tx: 26, tz: 18, w: 2, h: 2 },
  { tx: 8, tz: 12, w: 1, h: 1 },
  { tx: 8, tz: 14, w: 1, h: 1 },
  // Closed box: the interior is unreachable
  { tx: 29, tz: 5, w: 5, h: 1 },
  { tx: 29, tz: 9, w: 5, h: 1 },
  { tx: 29, tz: 6, w: 1, h: 3 },
  { tx: 33, tz: 6, w: 1, h: 3 },
]

export function createGrid(): Grid {
  const grid = new Grid(GRID_WIDTH, GRID_HEIGHT)
  for (const r of OBSTACLES) grid.blockRect(r.tx, r.tz, r.w, r.h)
  return grid
}
