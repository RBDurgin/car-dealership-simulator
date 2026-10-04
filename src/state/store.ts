import { create } from 'zustand'
import { WALL_MODES, type WallMode } from '../sim/walls'

export interface MoveOrder {
  id: number
  tx: number
  tz: number
}

// Discrete events only. Per-frame values live in refs / scene/runtime.ts.
interface GameState {
  moveOrder: MoveOrder | null
  showGrid: boolean
  wallMode: WallMode
  /** Target camera yaw; changes only on a Q/E rotation (the eased value lives in runtime). */
  viewYaw: number
  issueMoveOrder: (tx: number, tz: number) => void
  clearMoveOrder: () => void
  toggleGrid: () => void
  cycleWallMode: () => void
  setViewYaw: (yaw: number) => void
}

let nextOrderId = 1

export const useGame = create<GameState>((set) => ({
  moveOrder: null,
  showGrid: false,
  wallMode: 'cutaway',
  viewYaw: Math.PI / 4,
  issueMoveOrder: (tx, tz) => set({ moveOrder: { id: nextOrderId++, tx, tz } }),
  clearMoveOrder: () => set({ moveOrder: null }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  cycleWallMode: () =>
    set((s) => ({
      wallMode: WALL_MODES[(WALL_MODES.indexOf(s.wallMode) + 1) % WALL_MODES.length],
    })),
  setViewYaw: (viewYaw) => set({ viewYaw }),
}))
