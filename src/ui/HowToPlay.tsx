import { FINANCE_FEE, SALES_COMMISSION } from '../sim/staff'
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
          <p>
            Clean cars sell better. Cars gather dust overnight (faster out on the lot) and every
            time a customer looks one over. Inspect a car to see if it&apos;s clean, dusty or dirty,
            and click it to <b>Wash car</b>.
          </p>
        </section>
        <section>
          <h3>Staff</h3>
          <p>
            Press <kbd>H</kbd> to hire from the day&apos;s applicants. Salespeople sell on their
            own: they greet customers, make offers and sign buyers at their own desk, or hand them
            to finance. They earn {Math.round(SALES_COMMISSION * 100)}% of each car they sell, and
            the better they are, the more often customers say yes. Seasoned salespeople greet
            customers as they arrive; newer ones wait until a customer is looking at a car. They
            leave alone a customer you&apos;re walking over to, and you can&apos;t greet someone
            they&apos;re helping (a tick over their head). A receptionist keeps waiting customers
            patient. A finance manager sits at your office desk: lead a buyer there, click them and
            choose <b>Hand off to finance</b>, and you&apos;re free to sell to the next customer
            while they do the paperwork. Buyers wait in the lounge if finance is busy. A lot porter
            washes the dirtiest cars for you, all day long. Everyone on the payroll is paid at
            closing, and the finance manager also earns {formatMoney(FINANCE_FEE)} per deal they
            sign.
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
