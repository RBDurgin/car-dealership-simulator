import { create } from 'zustand'
import { reduceAction, type ActionEvent, type ActiveAction } from '../sim/actions'
import type { ActionId } from '../sim/interactables'
import { WALL_MODES, type WallMode } from '../sim/walls'

export interface MoveOrder {
  id: number
  tx: number
  tz: number
}

export interface ActionMenu {
  targetId: string
  /** Screen position (CSS px) the menu opens at. */
  x: number
  y: number
}

export interface Notice {
  id: number
  text: string
}

// Discrete events only. Per-frame values live in refs / scene/runtime.ts.
interface GameState {
  moveOrder: MoveOrder | null
  showGrid: boolean
  wallMode: WallMode
  /** Target camera yaw; changes only on a Q/E rotation (the eased value lives in runtime). */
  viewYaw: number
  /** Click-to-move and actions are mutually exclusive: setting one clears the other. */
  activeAction: ActiveAction | null
  hoveredId: string | null
  menu: ActionMenu | null
  /** Car whose info panel is open. */
  inspectedId: string | null
  notice: Notice | null
  issueMoveOrder: (tx: number, tz: number) => void
  clearMoveOrder: () => void
  toggleGrid: () => void
  cycleWallMode: () => void
  setViewYaw: (yaw: number) => void
  setHovered: (id: string | null) => void
  openMenu: (targetId: string, x: number, y: number) => void
  closeMenu: () => void
  requestAction: (targetId: string, action: ActionId) => void
  arriveAction: (id: number) => void
  completeAction: (id: number) => void
  cancelAction: () => void
  /** Esc: close the menu if open, otherwise stop everything the player is doing. */
  cancelAll: () => void
  closeInspect: () => void
  showNotice: (text: string) => void
  clearNotice: (id: number) => void
}

let nextOrderId = 1
let nextActionId = 1
let nextNoticeId = 1

export const useGame = create<GameState>((set, get) => {
  const dispatch = (ev: ActionEvent) => {
    const { next, finished } = reduceAction(get().activeAction, ev)
    set({ activeAction: next })
    if (!finished) return
    if (finished.action === 'inspect') set({ inspectedId: finished.targetId })
    else if (finished.action === 'getCoffee') get().showNotice('Ahh, fresh coffee.')
  }

  return {
    moveOrder: null,
    showGrid: false,
    wallMode: 'cutaway',
    viewYaw: Math.PI / 4,
    activeAction: null,
    hoveredId: null,
    menu: null,
    inspectedId: null,
    notice: null,
    issueMoveOrder: (tx, tz) => {
      dispatch({ type: 'cancel' })
      set({ moveOrder: { id: nextOrderId++, tx, tz }, menu: null })
    },
    clearMoveOrder: () => set({ moveOrder: null }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    cycleWallMode: () =>
      set((s) => ({
        wallMode: WALL_MODES[(WALL_MODES.indexOf(s.wallMode) + 1) % WALL_MODES.length],
      })),
    setViewYaw: (viewYaw) => set({ viewYaw }),
    setHovered: (hoveredId) => {
      if (get().hoveredId !== hoveredId) set({ hoveredId })
    },
    openMenu: (targetId, x, y) => set({ menu: { targetId, x, y } }),
    closeMenu: () => set({ menu: null }),
    requestAction: (targetId, action) => {
      set({ moveOrder: null, menu: null, inspectedId: null })
      dispatch({ type: 'request', id: nextActionId++, targetId, action })
    },
    arriveAction: (id) => dispatch({ type: 'arrive', id, now: performance.now() }),
    completeAction: (id) => dispatch({ type: 'complete', id }),
    cancelAction: () => dispatch({ type: 'cancel' }),
    cancelAll: () => {
      if (get().menu) return set({ menu: null })
      dispatch({ type: 'cancel' })
      set({ moveOrder: null, inspectedId: null })
    },
    closeInspect: () => set({ inspectedId: null }),
    showNotice: (text) => set({ notice: { id: nextNoticeId++, text } }),
    clearNotice: (id) => {
      if (get().notice?.id === id) set({ notice: null })
    },
  }
})
