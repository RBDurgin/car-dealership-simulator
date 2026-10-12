import { useEffect } from 'react'
import { ACHIEVEMENTS } from '../sim/achievements'
import { BEST_KEYS, caseCount, type BestEver, type TrophyCase as Case } from '../sim/trophyCase'
import { useGame } from '../state/store'
import { AchievementList } from './AchievementList'
import { formatMoney } from './format'

const BEST_LABELS: Record<keyof BestEver, string> = {
  day: 'Best day',
  week: 'Best week',
  month: 'Best month',
  deal: 'Biggest deal',
  streak: 'Longest streak',
}

const bestValue = (key: keyof BestEver, v: number) =>
  key === 'streak' ? `${v} day${v === 1 ? '' : 's'} in a row` : formatMoney(v)

const realDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/**
 * The device-wide trophy case, over the title screen: every achievement
 * earned in any game on this device, with the hardest level's medal, and the
 * best records of any run. Reset trophies empties it, after a confirm.
 */
export function TrophyCase({
  trophies,
  onClose,
  onReset,
}: {
  trophies: Case
  onClose: () => void
  onReset: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      // The guide or the sound panel may be open on top; Esc closes those first.
      const { helpOpen, audioOpen } = useGame.getState()
      if (!helpOpen && !audioOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const count = caseCount(trophies)
  const anyBest = BEST_KEYS.some((k) => trophies.best[k] > 0)
  const reset = () => {
    if (window.confirm('Reset trophies? Every achievement and record in the case will be lost.')) {
      onReset()
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary whats-new trophy-case" role="dialog" aria-label="Trophies">
        <div className="info-kicker">Trophy case</div>
        <h2>
          {count} / {ACHIEVEMENTS.length}
        </h2>
        <p className="title-save whats-new-since">Every game played on this device.</p>
        <div className="whats-new-list">
          {anyBest && (
            <section>
              <h3>Best ever</h3>
              <dl className="stock-summary">
                {BEST_KEYS.filter((k) => trophies.best[k] > 0).map((k) => [
                  <dt key={`${k}-t`}>{BEST_LABELS[k]}</dt>,
                  <dd key={`${k}-d`}>{bestValue(k, trophies.best[k])}</dd>,
                ])}
              </dl>
            </section>
          )}
          <AchievementList
            earned={(id) => {
              const e = trophies.earned[id]
              return e ? { level: e.level, when: `First ${realDate(e.first)}` } : null
            }}
          />
          {count > 0 || anyBest ? (
            <button className="link-button trophy-reset" onClick={reset}>
              Reset trophies
            </button>
          ) : null}
        </div>
        <button className="btn btn-primary" autoFocus onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
