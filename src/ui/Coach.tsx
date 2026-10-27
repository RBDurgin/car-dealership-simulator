import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { dayOver } from '../sim/clock'
import { stepsOf, TUTORIALS, wordingFor } from '../sim/tutorials'
import { isPaused, useGame } from '../state/store'
import { CoachHighlight } from './CoachHighlight'

/**
 * A walkthrough's guided steps: the step's text, how far along it is, Next
 * (or Skip step, for one that waits for the player) and ✕ to end it. The
 * game runs on; hidden while it's paused or the day is over, keeping its place.
 */
export function Coach() {
  const coach = useGame((s) => s.coach)
  const hidden = useGame((s) => isPaused(s) || dayOver(s))
  const touch = useMediaQuery(COARSE)
  if (!coach || hidden) return null
  const game = useGame.getState()
  const step = TUTORIALS[coach.id].steps[coach.step]
  const steps = stepsOf(coach.id, game)
  const at = steps.indexOf(step) + 1
  return (
    <>
      <div
        className="panel coach"
        role="dialog"
        aria-label="Walkthrough"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <button
          className="close"
          aria-label="End walkthrough"
          title="End walkthrough"
          onClick={() => game.endTutorial()}
        >
          ×
        </button>
        <div className="info-kicker">
          {TUTORIALS[coach.id].title} · Step {at} of {steps.length}
        </div>
        <p className="coach-text">{wordingFor(step.text, touch)}</p>
        <div className="coach-actions">
          {step.done ? (
            <button className="btn btn-small" onClick={() => game.advanceCoach()}>
              Skip step
            </button>
          ) : (
            <button className="btn btn-small btn-primary" onClick={() => game.advanceCoach()}>
              {at === steps.length ? 'Done' : 'Next'}
            </button>
          )}
        </div>
      </div>
      {step.ui && <CoachHighlight key={`${coach.id}-${coach.step}`} anchors={step.ui} />}
    </>
  )
}
