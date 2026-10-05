import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { FLOOR_PLAN_DAILY_RATE, FLOOR_PLAN_LIMIT } from '../sim/floorPlan'
import { INCENTIVE_DISCOUNT } from '../sim/ordering'
import { OWNER_BONUS } from '../sim/owner'
import { FINANCE_FEE, MIN_COMMISSION, SALES_COMMISSION } from '../sim/staff'
import { useGame, STARTING_CASH } from '../state/store'
import { CONTROLS, TOUCH_CONTROLS } from './controls'
import { formatMoney } from './format'

/** A short guide: shown when a new game starts, and again on `?` or from the title screen. */
export function HowToPlay() {
  const open = useGame((s) => s.helpOpen)
  const touch = useMediaQuery(COARSE)
  if (!open) return null
  const click = touch ? 'Tap' : 'Click'
  const controls = touch ? TOUCH_CONTROLS : CONTROLS

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
            lose patience if nobody comes. Some are passers-by who wander in off the sidewalk. Each
            day ends with a summary, and your progress is saved then.
          </p>
        </section>
        <section>
          <h3>Customers</h3>
          <p>
            Not everyone shops the same way, and greeting a customer tells you what kind they are.
            Someone who is <i>just looking</i> browses a lot and rarely buys. Someone who{' '}
            <i>knows what they want</i> heads for one car, won&apos;t wait long, and usually says
            yes. Customers <i>watching every dollar</i> have a tight budget, and couples shop
            together and take their time over each car.
          </p>
        </section>
        <section>
          <h3>The owner</h3>
          <p>
            Every two or three days the owner drops by at opening, walks to the office and sets a
            goal for the day, shown in the top bar. Meet it by closing for a{' '}
            {formatMoney(OWNER_BONUS)} bonus; miss it and you&apos;ll hear about it in the summary.
          </p>
        </section>
        <section>
          <h3>Making a sale</h3>
          <p>
            {click} a customer to <b>Greet</b> them, make an <b>Offer</b> on the car they like, and
            if they accept, <b>Close deal</b> at your desk. Walking away or {touch ? '✕' : 'Esc'}{' '}
            ends the conversation.
          </p>
          <p>
            Every car shows its MSRP and <i>your cost</i>, what the dealership paid for it. The
            difference is your gross profit on the sale. The day summary adds up revenue, the cost
            of the cars sold and gross profit, then takes off wages, commissions and floor plan
            interest for the net.
          </p>
          <p>
            Clean cars sell better. Cars gather dust overnight (faster out on the lot) and every
            time a customer looks one over. Inspect a car to see if it&apos;s clean, dusty or dirty,
            and {click.toLowerCase()} it to <b>Wash car</b>.
          </p>
        </section>
        <section>
          <h3>Buying stock</h3>
          <p>
            Sold cars leave empty spaces. Order new ones at the office computer (
            {click.toLowerCase()} the screen on your desk and choose <b>Order stock</b>),{' '}
            {touch ? (
              <>or tap Stock</>
            ) : (
              <>
                press <kbd>I</kbd> or click Stock
              </>
            )}
            . Cars ordered today are delivered the next morning, showroom platforms first, then the
            lot. You can cancel an order until the day ends. One model each day is on incentive,{' '}
            {Math.round(INCENTIVE_DISCOUNT * 100)}% off its invoice.
          </p>
          <p>
            Pay in <b>cash</b>, or put the car on the <b>floor plan</b>: the bank pays for it (up to{' '}
            {formatMoney(FLOOR_PLAN_LIMIT)} at once) and you pay{' '}
            {(FLOOR_PLAN_DAILY_RATE * 100).toFixed(1)}% of its cost in interest every day it sits in
            stock. When it sells, the bank takes its cost out of the price and you keep the rest.
            You can also <b>Pay off</b> a car from cash to stop the interest.
          </p>
          <p>
            Customers who can&apos;t find the kind of car they want are counted as <i>missed</i> in
            the day summary and the stock panel. Order what people are asking for.
          </p>
        </section>
        <section>
          <h3>Staff</h3>
          <p>
            {touch ? (
              <>Tap Staff</>
            ) : (
              <>
                Press <kbd>H</kbd> or click Staff
              </>
            )}{' '}
            to hire from the day&apos;s applicants. Salespeople sell on their own: they greet
            customers, make offers and sign buyers at their own desk, or hand them to finance. They
            earn {Math.round(SALES_COMMISSION * 100)}% of the gross profit on each car they sell (at
            least {formatMoney(MIN_COMMISSION)}), and the better they are, the more often customers
            say yes. Seasoned salespeople greet customers as they arrive; newer ones wait until a
            customer is looking at a car. They leave alone a customer you&apos;re walking over to,
            and you can&apos;t greet someone they&apos;re helping (a tick over their head). A
            receptionist keeps waiting customers patient. A finance manager sits at your office
            desk: lead a buyer there, {click.toLowerCase()} them and choose{' '}
            <b>Hand off to finance</b>, and you&apos;re free to sell to the next customer while they
            do the paperwork. Buyers wait in the lounge if finance is busy. A lot porter washes the
            dirtiest cars for you, all day long. Everyone on the payroll is paid at closing, and the
            finance manager also earns {formatMoney(FINANCE_FEE)} per deal they sign.
          </p>
        </section>
        <section>
          <h3>Controls</h3>
          <div className="how-controls">
            {controls.map(([key, label]) => (
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
