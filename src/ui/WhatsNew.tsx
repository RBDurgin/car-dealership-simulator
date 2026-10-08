import { useEffect } from 'react'
import { longDate } from '../sim/calendar'
import type { SaveData } from '../sim/save'
import { groupByPhase, UPDATES, updatesSince } from '../sim/whatsNew'
import { useGame } from '../state/store'

/** Phase groups shown open; older ones are folded. */
const OPEN_GROUPS = 2
/** Past this many groups, point to How to play for the full picture. */
const MANY_GROUPS = 6
/** What "Latest updates" shows when there's nothing new. */
const LATEST_COUNT = 3

/**
 * What's new, over the title screen: the updates since `save` was written, or
 * the last few when it's up to date (or there's no save).
 */
export function WhatsNew({ save, onClose }: { save: SaveData | null; onClose: () => void }) {
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

  const news = save ? updatesSince(save.news) : []
  const fresh = news.length > 0
  const groups = groupByPhase(fresh ? news : UPDATES.slice(-LATEST_COUNT).reverse())

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary whats-new" role="dialog" aria-label="What's new">
        <div className="info-kicker">What&apos;s new</div>
        <h2>{fresh ? 'Since you last played' : 'Latest updates'}</h2>
        {fresh && save && (
          <p className="title-save whats-new-since">
            {longDate(save.day + 1)} · saved{' '}
            {new Date(save.savedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </p>
        )}
        <div className="whats-new-list">
          {groups.map((g, i) => (
            <details key={g.phase} open={i < OPEN_GROUPS}>
              <summary>
                Phase {g.phase} · {g.updates.map((u) => u.title).join(', ')}
              </summary>
              {g.updates.map((u) => (
                <ul key={u.id}>
                  {u.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ))}
            </details>
          ))}
          {groups.length > MANY_GROUPS && (
            <p className="whats-new-more">
              A lot has changed. <b>How to play</b> on the title screen has the full picture.
            </p>
          )}
        </div>
        <button className="btn btn-primary" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
