import {
  ACHIEVEMENTS,
  GROUP_LABELS,
  type AchievementGroup,
  type AchievementId,
} from '../sim/achievements'
import { difficultyLabel, type Difficulty } from '../sim/difficulty'

const GROUPS = Object.keys(GROUP_LABELS) as AchievementGroup[]

const MEDALS: Record<Difficulty, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }

/** How an earned achievement shows: the level's medal and when. */
export interface EarnedView {
  level: Difficulty
  when: string
}

/** The level's medal, labelled for screen readers. */
export function LevelMedal({ level }: { level: Difficulty }) {
  const label = `Earned on ${difficultyLabel(level)}`
  return (
    <span className="achievement-medal" role="img" aria-label={label} title={label}>
      {MEDALS[level]}
    </span>
  )
}

/**
 * Every achievement, grouped: earned ones with a medal for their level and
 * when, the rest greyed with what earns them, and a hidden one "???" until
 * earned. Shared by the Stats tab and the title screen's trophy case.
 */
export function AchievementList({ earned }: { earned: (id: AchievementId) => EarnedView | null }) {
  return (
    <div className="achievement-groups">
      {GROUPS.map((group) => {
        const list = ACHIEVEMENTS.filter((a) => a.group === group)
        if (list.length === 0) return null
        return (
          <section key={group}>
            <h3>{GROUP_LABELS[group]}</h3>
            <ul className="achievement-list">
              {list.map((a) => {
                const got = earned(a.id)
                const secret = a.hidden && !got
                return (
                  <li key={a.id} className={got ? 'achievement' : 'achievement achievement-locked'}>
                    <span className="achievement-icon">
                      {got ? <LevelMedal level={got.level} /> : secret ? '❔' : '🔒'}
                    </span>
                    <span>
                      <b>{secret ? '???' : a.title}</b>
                      <span className="achievement-text">
                        {secret ? 'A secret achievement' : a.text}
                      </span>
                      {got && <span className="achievement-when">{got.when}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
