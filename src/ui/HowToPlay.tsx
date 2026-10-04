import { useGame, STARTING_CASH } from '../state/store'
import { CONTROLS } from './controls'
import { formatMoney } from './format'

/** A short guide: shown when a new game starts, and again on `?` or from the title screen. */
export function HowToPlay() {
  const open = useGame((s) => s.helpOpen)
  if (!open) return null

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary how-to-play" role="dialog" aria-label="How to play">
        <div className="info-kicker">How to play</div>
        <h2>Run the lot</h2>
        <section>
          <h3>The goal</h3>
          <p>
            Sell cars, build a loyal client base and grow your cash. You start with{' '}
            {formatMoney(STARTING_CASH)} and a lot full of cars.
          </p>
        </section>
        <section>
          <h3>The day</h3>
          <p>
            Doors open at 9:00 and close at 18:00. Customers browse the lot, then wait for help and
            lose patience if nobody comes. Each day ends with a summary, and your progress is saved
            then.
          </p>
        </section>
        <section>
          <h3>Making a sale</h3>
          <p>
            Click a customer to <b>Greet</b> them, make an <b>Offer</b> on the car they like, and if
            they accept, <b>Close deal</b> at your desk. Walking away or Esc ends the conversation.
          </p>
        </section>
        <section>
          <h3>Staff</h3>
          <p>
            Press <kbd>H</kbd> to hire from the day&apos;s applicants. A receptionist keeps waiting
            customers patient. Everyone on the payroll is paid at closing.
          </p>
        </section>
        <section>
          <h3>Controls</h3>
          <div className="how-controls">
            {CONTROLS.map(([key, label]) => (
              <div key={key} className="control">
                <kbd>{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
        <button
          className="btn btn-primary"
          autoFocus
          onClick={() => useGame.getState().toggleHelp(false)}
        >
          Let&apos;s go
        </button>
      </div>
    </div>
  )
}
