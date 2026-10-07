import { TUNING } from '../sim/difficulty'
import { tipFor, tipText, type TipId } from '../sim/tips'
import { isPaused, useGame } from './store'

/** Tips that came up while another notice (or the guide) was showing, oldest first. */
let pending: TipId[] = []

/**
 * Guided tips on a level that has them (Easy): watches the store for the
 * first time something happens (see `tipFor`) and shows its tip as a notice
 * once no other notice is up and the game isn't paused, marking it seen.
 */
export function startTips(): () => void {
  pending = []
  return useGame.subscribe((s, prev) => {
    // A new or resumed game starts with nothing waiting.
    if (s.screen !== prev.screen) pending = []
    if (!TUNING[s.difficulty].tips) return
    const id = tipFor(prev, s, [...s.tipsSeen, ...pending])
    if (id) pending.push(id)
    if (pending.length === 0 || s.notice || isPaused(s)) return
    const next = pending.shift()!
    s.markTipSeen(next)
    s.showNotice(tipText(next))
  })
}
