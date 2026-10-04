import { create } from 'zustand'

export interface MoveOrder {
  id: number
  tx: number
  tz: number
}

// Discrete events only. Per-frame values live in refs / scene/runtime.ts.
interface GameState {
  moveOrder: MoveOrder | null
  showGrid: boolean
  issueMoveOrder: (tx: number, tz: number) => void
  clearMoveOrder: () => void
  toggleGrid: () => void
}

let nextOrderId = 1

export const useGame = create<GameState>((set) => ({
  moveOrder: null,
  showGrid: false,
  issueMoveOrder: (tx, tz) => set({ moveOrder: { id: nextOrderId++, tx, tz } }),
  clearMoveOrder: () => set({ moveOrder: null }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
}))
