import { useState } from 'react'
import { longDate } from '../sim/calendar'
import { clearSave, readSave } from '../state/persistence'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/** Shown on load: continue the saved game, if there is one, or start a new one. */
export function TitleScreen() {
  const open = useGame((s) => s.screen === 'title')
  const [save] = useState(readSave)
  if (!open) return null

  const newGame = () => {
    if (save && !window.confirm(`Start over? Your day ${save.day + 1} save will be lost.`)) return
    clearSave()
    useGame.getState().newGame()
  }

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary title-screen" role="dialog" aria-label="Title screen">
        <div className="info-kicker">Car dealership simulator</div>
        <h1>Open for business</h1>
        {save && (
          <button
            className="btn btn-primary"
            autoFocus
            onClick={() => useGame.getState().loadGame(save)}
          >
            Continue
            <span className="title-save">
              {longDate(save.day + 1)} · {formatMoney(save.cash)}
            </span>
          </button>
        )}
        <button className={save ? 'btn' : 'btn btn-primary'} autoFocus={!save} onClick={newGame}>
          New game
        </button>
        <button className="btn" onClick={() => useGame.getState().toggleHelp(true)}>
          How to play
        </button>
        <button className="btn" onClick={() => useGame.getState().toggleAudioPanel(true)}>
          Sound
        </button>
      </div>
    </div>
  )
}
