import { START_REPUTATION } from '../../sim/reputation'
import { amendDay } from '../../sim/stats'
import type { Kit } from '../core'
import type { GameState } from '../types'

type CareerKeys = 'reputation' | 'earnAchievements' | 'markTipSeen' | 'keepPlaying'

/**
 * Reputation, and what lasts the whole game: the career and rank, the day
 * log, lifetime totals and records, achievements and tips seen. (All but
 * reputation start with `dayOne`; they move when the day is settled.)
 */
export function careerSlice(k: Kit): Pick<GameState, CareerKeys> {
  const { get, set } = k
  return {
    reputation: START_REPUTATION,
    earnAchievements: (ids) => {
      const s = get()
      const fresh = ids.filter(
        (id, i) => ids.indexOf(id) === i && !s.achievements.some((a) => a.id === id),
      )
      if (fresh.length === 0) return fresh
      set({
        achievements: [
          ...s.achievements,
          ...fresh.map((id) => ({ id, day: s.clock.day, level: s.difficulty })),
        ],
      })
      return fresh
    },
    markTipSeen: (id) => {
      const seen = get().tipsSeen
      if (!seen.includes(id)) set({ tipsSeen: [...seen, id] })
    },
    keepPlaying: () => set({ won: true }),
  }
}

/**
 * Money spent from the day summary, after the day was settled, goes on the
 * log's record of the day and the lifetime net.
 */
export function amendLog(k: Kit): void {
  const s = k.get()
  if (!s.dayStats.settled) return
  const amended = amendDay(s.log, s.lifetime, s.dayStats, s.clock.day)
  if (amended.log !== s.log) k.set(amended)
}
