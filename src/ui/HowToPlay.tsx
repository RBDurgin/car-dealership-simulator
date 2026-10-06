import { Fragment } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { FLOOR_PLAN_DAILY_RATE, FLOOR_PLAN_LIMIT } from '../sim/floorPlan'
import {
  AREA_LABELS,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  type ImprovementArea,
} from '../sim/improvements'
import { CHANNEL_IDS, CHANNELS } from '../sim/marketing'
import { WALK_IN_CHANCE } from '../sim/pedestrians'
import { INCENTIVE_DISCOUNT } from '../sim/ordering'
import { FIRST_NAZMA_DAY } from '../sim/nazma'
import { OWNER_BONUS } from '../sim/owner'
import { MAX_DAILY_CHANGE, MAX_REFERRALS, REPUTATION_POINTS } from '../sim/reputation'
import { FINANCE_FEE, MIN_COMMISSION, SALES_COMMISSION } from '../sim/staff'
import { useGame, STARTING_CASH } from '../state/store'
import { CONTROLS, TOUCH_CONTROLS } from './controls'
import { formatMoney } from './format'
import { effectLabel } from './improvementText'

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
          <p>
            They haggle differently too. Bargain hunters want the most off and go back and forth the
            longest. Decisive buyers want only a little off and won&apos;t haggle for long, and
            neither will someone who is just looking.
          </p>
        </section>
        <section>
          <h3>The owner</h3>
          <p>
            Every two or three days the owner drops by at opening, walks to the office and sets a
            goal for the day, shown in the top bar. It might be a number of sales, revenue, gross
            profit, a body type, no impatient walk-outs or a boost to your reputation. Meet it by
            closing for a {formatMoney(OWNER_BONUS)} bonus; miss it and you&apos;ll hear about it in
            the summary.
          </p>
        </section>
        <section>
          <h3>Nazma</h3>
          <p>
            Nazma used to work here, and he has it in for the place. From day {FIRST_NAZMA_DAY} on,
            every few days he walks onto the lot in a dark hoodie with a red badge and smears grime
            over two or three cars, lot cars first, so they need washing again. Dirty cars sell
            worse.
          </p>
          <p>
            {click} him and choose <b>Confront</b> to run him off. Catch him before he gets to a car
            and it stays clean. The lot porter cleans up after him. A security guard on the payroll
            makes his visits rarer, and runs him off when they spot him.
          </p>
        </section>
        <section>
          <h3>Reputation</h3>
          <p>
            Your good name, from 0 to 100, is the ♥ meter in the top bar. It moves once a day, at
            closing: each buyer adds {REPUTATION_POINTS.sale}, each customer who walks out unhappy
            takes off {-REPUTATION_POINTS.refused}, each one who gives up waiting{' '}
            {-REPUTATION_POINTS.impatient}, and each who can&apos;t find the kind of car they want{' '}
            {-REPUTATION_POINTS.missed}. Customers still on the lot at closing don&apos;t count, and
            one day can move it by at most {MAX_DAILY_CHANGE} either way. The day summary shows the
            change.
          </p>
          <p>
            A good name brings more of the usual visitors, sends friends of past buyers your way (up
            to {MAX_REFERRALS} referrals a day at the top, mostly ready to buy) and makes every ad
            bring more people. A poor one means fewer visitors and ads that do less.
          </p>
        </section>
        <section>
          <h3>Making a sale</h3>
          <p>
            {click} a customer to <b>Greet</b> them, name a price for the car they like, and if they
            accept, <b>Close deal</b> at your desk. Walking away or {touch ? '✕' : 'Esc'} ends the
            conversation.
          </p>
          <p>
            Prices are haggled in the customer panel. Open with <b>Ask MSRP</b> or a little off, or
            set any price with − and +. Ask for more than they hoped to pay and they counter (a{' '}
            <b>$?</b> over their head); then <b>Hold</b> your price, <b>Split the difference</b>, or{' '}
            <b>Accept</b> their counter. Asking near what they hope for makes a yes likelier, but
            every round has a catch: hold firm and they may walk out, and after a few rounds
            they&apos;ll only reluctantly pay over their hope. The panel shows your margin at each
            price, in red below cost.
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
              <>or tap Office</>
            ) : (
              <>
                press <kbd>I</kbd> or click Office
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
          <h3>Advertising</h3>
          <p>
            More visitors means more sales. Book an ad campaign on the office computer&apos;s{' '}
            <b>Marketing</b> tab ({click.toLowerCase()} the screen and choose <b>Marketing</b>
            {touch ? (
              <>, or tap Office and switch tabs</>
            ) : (
              <>
                , or press <kbd>M</kbd>
              </>
            )}
            ). You pay up front, and the campaign brings extra visitors every day it runs, starting
            tomorrow morning. Each channel draws its own crowd:
          </p>
          <ul>
            {CHANNEL_IDS.map((id) => {
              const c = CHANNELS[id]
              return (
                <li key={id}>
                  <b>{c.label}</b>: {formatMoney(c.cost)} for {c.days} days, about {c.visitors}{' '}
                  extra a day. {c.reaches}.
                </li>
              )
            })}
          </ul>
          <p>
            Booking the same channel again while it runs brings fewer extra visitors the second
            time, and a better reputation makes every ad bring more. The day summary takes the ad
            spend off the net on the day you pay, and shows how many visitors each source brought
            and what they bought, so you can see which ads pay.
          </p>
        </section>
        <section>
          <h3>Improvements</h3>
          <p>
            Passers-by on the sidewalk sometimes turn in: about {Math.round(WALK_IN_CHANCE * 100)}{' '}
            in 100 to start with. Catch more of their eye on the office computer&apos;s{' '}
            <b>Upgrades</b> tab
            {touch ? (
              <> (tap Office and switch tabs)</>
            ) : (
              <>
                {' '}
                (or press <kbd>U</kbd>)
              </>
            )}
            . You pay once, it goes up overnight and stays for good. Out front, a sign or a tube man
            draws more people and more of them in. In the showroom, buyers who like what they see
            hope for less off (they still haggle) and say yes a little more often. A done-up waiting
            area keeps customers who are waiting to be helped there longer.
          </p>
          {(Object.keys(AREA_LABELS) as ImprovementArea[]).map((area) => (
            <Fragment key={area}>
              <h4>{AREA_LABELS[area]}</h4>
              <ul>
                {IMPROVEMENT_IDS.filter((id) => IMPROVEMENTS[id].area === area).map((id) => {
                  const u = IMPROVEMENTS[id]
                  return (
                    <li key={id}>
                      <b>{u.label}</b>: {formatMoney(u.cost)}. {effectLabel(id)}.
                      {u.requires && (
                        <> Replaces the {IMPROVEMENTS[u.requires].label.toLowerCase()}.</>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Fragment>
          ))}
          <p>The day summary takes what you spent off the net on the day you buy.</p>
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
            customers, haggle over the price and sign buyers at their own desk, or hand them to
            finance. They earn {Math.round(SALES_COMMISSION * 100)}% of the gross profit on each car
            they sell (at least {formatMoney(MIN_COMMISSION)}), so a give-away costs them too. The
            better they are, the more often customers say yes and the nearer MSRP they hold: green
            salespeople open under MSRP and soon take the customer&apos;s counter, seasoned ones
            give ground slowly. None of them sell below cost. The day summary shows how far off MSRP
            each seller went. Seasoned salespeople greet customers as they arrive; newer ones wait
            until a customer is looking at a car. They leave alone a customer you&apos;re walking
            over to, and you can&apos;t greet someone they&apos;re helping (a tick over their head).
            A receptionist keeps waiting customers patient. A finance manager sits at your office
            desk: lead a buyer there, {click.toLowerCase()} them and choose{' '}
            <b>Hand off to finance</b>, and you&apos;re free to sell to the next customer while they
            do the paperwork. Buyers wait in the lounge if finance is busy. A lot porter washes the
            dirtiest cars for you, all day long. A security guard walks a patrol round the lot and
            chases off Nazma when they spot him; the more skilled, the further they see. Everyone on
            the payroll is paid at closing, and the finance manager also earns{' '}
            {formatMoney(FINANCE_FEE)} per deal they sign.
          </p>
        </section>
        <section>
          <h3>Sound</h3>
          <p>
            The 🔊 button in the top bar opens the sound settings: a master volume, one each for
            music, sound effects and voices, and a switch to mute it all
            {touch ? (
              '.'
            ) : (
              <>
                {' '}
                (or press <kbd>N</kbd>).
              </>
            )}{' '}
            They&apos;re kept on this device, apart from your save.
          </p>
          <p>
            Listen for the lot: a chime when a customer walks in, a jingle when a car sells, a door
            slammed by someone leaving unhappy, the hiss of a car being washed and the scuff of
            Nazma smudging one. Sounds out on the lot are quieter the farther they are from you.
          </p>
          <p>
            The music follows the day: an easy bossa in the morning, another after noon, and a
            livelier tune for the last hour before closing. The summary and the title screen have
            their own. It goes muffled while this guide is open.
          </p>
          <p>
            Everyone talks in gibberish, each in their own voice: hellos when a customer is greeted,
            back and forth over a car, a questioning tone when they counter your price, a happy yes
            or a grumble on the way out, and a murmur over the paperwork. You only hear the people
            near you, and the Voices slider sets how loud they are.
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
