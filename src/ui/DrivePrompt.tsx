import type { Customer } from '../sim/customers'
import { bestTopic, FIT_REACTIONS, TOPIC_LABELS, topicFit } from '../sim/talkingPoints'
import { levelTuning, useGame } from '../state/store'

/**
 * A test drive's talking points (Phase 20b): 3 topics to point out (keys
 * 1–3), above the drive bar. It doesn't pause the game. Once one is picked,
 * how the buyer took it shows until the next prompt. On Easy the best topic
 * is marked.
 */
export function DrivePrompt({ c }: { c: Customer }) {
  const hint = useGame((s) => levelTuning(s).dealHint)
  const car = useGame((s) => s.inventory.find((x) => x.id === c.drive?.carId))
  const drive = c.drive
  if (!drive || !car) return null
  if (drive.offered) {
    const best = hint ? bestTopic(c, car, drive.offered) : null
    return (
      <div className="drive-prompt" role="group" aria-label="Point out">
        <div className="drive-prompt-title">Point out…</div>
        <div className="drive-topics">
          {drive.offered.map((topic, i) => {
            const label = TOPIC_LABELS[topic]
            const good = best === topic && topicFit(c, car, topic) === 'good'
            return (
              <button
                key={topic}
                className={`btn drive-topic${good ? ' drive-topic-best' : ''}`}
                title={`${label.name} (${i + 1})`}
                onClick={() => useGame.getState().pickTopic(i)}
              >
                <span className="drive-topic-icon" aria-hidden>
                  {label.icon}
                </span>
                <span>{label.name}</span>
                <kbd className="drive-topic-key">{i + 1}</kbd>
                {good && <span className="warmth-chip warmth-hot">Best</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  const last = drive.points[drive.points.length - 1]
  if (!last?.topic) return null
  return (
    <div className={`drive-reaction drive-reaction-${last.fit}`} role="status">
      {TOPIC_LABELS[last.topic].name}: {FIT_REACTIONS[last.fit]}
    </div>
  )
}
