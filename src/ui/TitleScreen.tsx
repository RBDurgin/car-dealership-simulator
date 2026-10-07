import { useState } from 'react'
import { longDate } from '../sim/calendar'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  difficultyBlurb,
  difficultyLabel,
  type Difficulty,
} from '../sim/difficulty'
import { clearSave, readSave } from '../state/persistence'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/**
 * Shown on load: continue the saved game, if there is one, or start a new one
 * at a level picked in a second step.
 */
export function TitleScreen() {
  const open = useGame((s) => s.screen === 'title')
  const [save] = useState(readSave)
  const [picking, setPicking] = useState(false)
  if (!open) return null

  const newGame = (difficulty: Difficulty) => {
    if (save && !window.confirm(`Start over? Your day ${save.day + 1} save will be lost.`)) return
    clearSave()
    useGame.getState().newGame(difficulty)
  }

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary title-screen" role="dialog" aria-label="Title screen">
        <div className="info-kicker">Car dealership simulator</div>
        {picking ? (
          <>
            <h1>Pick a level</h1>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className={d === DEFAULT_DIFFICULTY ? 'btn btn-primary' : 'btn'}
                autoFocus={d === DEFAULT_DIFFICULTY}
                onClick={() => newGame(d)}
              >
                {difficultyLabel(d)}
                <span className="title-save">{difficultyBlurb(d)}</span>
              </button>
            ))}
            <button className="btn" onClick={() => setPicking(false)}>
              Back
            </button>
          </>
        ) : (
          <>
            <h1>Open for business</h1>
            {save && (
              <button
                className="btn btn-primary"
                autoFocus
                onClick={() => useGame.getState().loadGame(save)}
              >
                Continue
                <span className="title-save">
                  {longDate(save.day + 1)} · {formatMoney(save.cash)} ·{' '}
                  {difficultyLabel(save.difficulty)}
                </span>
              </button>
            )}
            <button
              className={save ? 'btn' : 'btn btn-primary'}
              autoFocus={!save}
              onClick={() => setPicking(true)}
            >
              New game
            </button>
            <button className="btn" onClick={() => useGame.getState().toggleHelp(true)}>
              How to play
            </button>
            <button className="btn" onClick={() => useGame.getState().toggleAudioPanel(true)}>
              Sound
            </button>
          </>
        )}
      </div>
    </div>
  )
}
