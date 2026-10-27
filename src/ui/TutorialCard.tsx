import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { TUTORIALS, wordingFor } from '../sim/tutorials'
import { useGame } from '../state/store'

/**
 * A walkthrough's card, when a feature first comes up: what it is in a few
 * bullets, and Walk me through it, Later (kept in the guide's Tutorials tab)
 * or Don't show these. The game waits while it's up.
 */
export function TutorialCard() {
  const id = useGame((s) => s.tutorialCard)
  const touch = useMediaQuery(COARSE)
  if (!id) return null
  const t = TUTORIALS[id]
  const game = useGame.getState()
  return (
    <div className="modal-backdrop">
      <div className="panel day-summary tutorial-card" role="dialog" aria-label={t.title}>
        <div className="info-kicker">New</div>
        <h2>{t.title}</h2>
        <ul className="tutorial-bullets">
          {t.card.map((line, i) => (
            <li key={i}>{wordingFor(line, touch)}</li>
          ))}
        </ul>
        <button className="btn btn-primary" autoFocus onClick={() => game.startTutorial(id)}>
          Walk me through it
        </button>
        <button className="btn" onClick={() => game.laterTutorial()}>
          Later
          <span className="title-save">Find it in How to play, under Tutorials</span>
        </button>
        <button className="btn" onClick={() => game.setTutorialsOn(false)}>
          Don&apos;t show these
          <span className="title-save">Turn them back on in the sound and settings panel</span>
        </button>
      </div>
    </div>
  )
}
