import { create } from 'zustand'
import { transactional } from './core'
import { careerSlice } from './slices/career'
import { clientsSlice } from './slices/clients'
import { clockSlice } from './slices/clock'
import { customersSlice } from './slices/customers'
import { daySlice } from './slices/day'
import { economySlice } from './slices/economy'
import { serviceSlice } from './slices/service'
import { staffSlice } from './slices/staff'
import { tutorialsSlice } from './slices/tutorials'
import { uiSlice } from './slices/ui'
import { worldSlice } from './slices/world'
import type { GameState } from './types'

export type {
  ActionMenu,
  ComputerTab,
  GameState,
  MoveOrder,
  Notice,
  ReceptionCall,
  Screen,
} from './types'
export {
  DEV_TIME_SCALES,
  isPaused,
  levelTuning,
  orderInvoice,
  reconBook,
  repScale,
  sceneIdle,
  sellerBonusFor,
  STARTING_CASH,
  winShowing,
} from './derived'
export { bailoutNotice, deliveryNotice, theftNotice } from './notices'

/**
 * The game's one store, built from the slices in `state/slices/`. Their
 * shared helpers are in `state/core.ts`, and each takes the `Kit`: the
 * store's `get`/`set`, batched so one clock step or one morning is stored
 * with one `set`.
 */
export const useGame = create<GameState>((rawSet, rawGet) => {
  const k = transactional(rawSet, rawGet)
  return {
    ...uiSlice(k),
    ...clockSlice(k),
    ...economySlice(k),
    ...customersSlice(k),
    ...staffSlice(k),
    ...serviceSlice(k),
    ...clientsSlice(k),
    ...worldSlice(k),
    ...careerSlice(k),
    ...tutorialsSlice(k),
    ...daySlice(k),
  }
})
