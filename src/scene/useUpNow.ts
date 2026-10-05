import { useShallow } from 'zustand/react/shallow'
import { installed, type ImprovementId } from '../sim/improvements'
import { useGame } from '../state/store'

/** Improvements up today. Re-renders only when that list changes. */
export function useUpNow(): ImprovementId[] {
  return useGame(useShallow((s) => installed(s.improvements, s.clock.day)))
}
