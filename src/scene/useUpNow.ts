import { useShallow } from 'zustand/react/shallow'
import { expansionsUp } from '../sim/expansions'
import { installed, type ImprovementId } from '../sim/improvements'
import type { ExpansionId } from '../sim/layout'
import { useGame } from '../state/store'

/** Improvements up today. Re-renders only when that list changes. */
export function useUpNow(): ImprovementId[] {
  return useGame(useShallow((s) => installed(s.improvements, s.clock.day)))
}

/**
 * Expansions up today. Re-renders only when that list changes, by which time
 * `scene/runtime` has rebuilt `layout` with them.
 */
export function useGround(): ExpansionId[] {
  return useGame(useShallow(expansionsUp))
}
