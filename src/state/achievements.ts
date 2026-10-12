import { achievementNotice, achievementsFor, type AchievementId } from '../sim/achievements'
import { isPaused, useGame } from './store'
import { subscribeDiff } from './subscribe'

/** Achievements earned while another notice (or the guide) was up, oldest first. */
let pending: AchievementId[] = []

/**
 * Watches the store for achievements earned during the day (see
 * `achievementsFor`), earns them at once and shows them as one notice once no
 * other notice is up and the game isn't paused. Those a settled day earns are
 * earned in `settleDay` and shown in the summary instead.
 */
export function startAchievements(): () => void {
  pending = []
  return subscribeDiff((prev, s) => {
    if (s.screen !== prev.screen) pending = []
    if (isPaused(s)) return
    const ids = achievementsFor(prev, s, s.achievements)
    if (ids.length > 0) pending.push(...s.earnAchievements(ids))
    // After the change that earned them has had its own say (a sale's notice).
    if (pending.length > 0) queueMicrotask(flush)
  })
}

function flush(): void {
  const s = useGame.getState()
  if (pending.length === 0 || s.notice || isPaused(s)) return
  const shown = pending
  pending = []
  s.showNotice(achievementNotice(shown))
}
