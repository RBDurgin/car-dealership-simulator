import { ACTIONS, type ActionId } from './interactables'

/**
 * The player's current action. There is a single slot: a new request replaces
 * whatever is running. Phase 2 can grow this into a real queue.
 *
 *   request ──► approaching ──arrive──► performing ──complete──► (idle)
 *                    │                      │
 *                    └──────cancel──────────┴──────────────────► (idle)
 *
 * Instant actions skip `performing` and finish on arrival.
 */
export type ActionPhase = 'approaching' | 'performing'

export interface ActiveAction {
  id: number
  targetId: string
  action: ActionId
  phase: ActionPhase
  /** Wall-clock ms when `performing` began. */
  startedAt: number | null
}

export type ActionEvent =
  | { type: 'request'; id: number; targetId: string; action: ActionId }
  | { type: 'arrive'; id: number; now: number }
  | { type: 'complete'; id: number }
  | { type: 'cancel' }

export interface ActionResult {
  next: ActiveAction | null
  /** The action that just finished successfully, so its effect can be applied. */
  finished: ActiveAction | null
}

const unchanged = (cur: ActiveAction | null): ActionResult => ({ next: cur, finished: null })

export function reduceAction(cur: ActiveAction | null, ev: ActionEvent): ActionResult {
  switch (ev.type) {
    case 'request':
      return {
        next: {
          id: ev.id,
          targetId: ev.targetId,
          action: ev.action,
          phase: 'approaching',
          startedAt: null,
        },
        finished: null,
      }
    case 'arrive': {
      if (!cur || cur.id !== ev.id || cur.phase !== 'approaching') return unchanged(cur)
      const performing: ActiveAction = { ...cur, phase: 'performing', startedAt: ev.now }
      if (ACTIONS[cur.action].mode === 'instant') return { next: null, finished: performing }
      return { next: performing, finished: null }
    }
    case 'complete':
      // Stale completions (from an action that was since replaced) are ignored,
      // and hold actions only end by cancelling.
      if (!cur || cur.id !== ev.id || cur.phase !== 'performing') return unchanged(cur)
      if (ACTIONS[cur.action].mode === 'hold') return unchanged(cur)
      return { next: null, finished: cur }
    case 'cancel':
      return { next: null, finished: null }
  }
}

/** True once a timed action has run its duration. */
export function isTimedActionDone(a: ActiveAction, now: number): boolean {
  const def = ACTIONS[a.action]
  return (
    def.mode === 'timed' &&
    a.phase === 'performing' &&
    a.startedAt !== null &&
    now - a.startedAt >= (def.durationMs ?? 0)
  )
}
