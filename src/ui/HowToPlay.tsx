import { Fragment, useEffect, useState, type ReactNode } from 'react'
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
import { FIRST_NAZMA_DAY, FIRST_THEFT_DAY } from '../sim/nazma'
import { OWNER_BONUS } from '../sim/owner'
import {
  HOLDBACK_FLOOR,
  HOLDBACK_RATE,
  HOLDBACK_STRETCH,
  HOLDBACK_STRETCH_AT,
  QUOTA_RANGE,
} from '../sim/quota'
import { MAX_DAILY_CHANGE, MAX_REFERRALS, REPUTATION_POINTS } from '../sim/reputation'
import {
  FINANCE_FEE,
  MIN_COMMISSION,
  MIN_RETENTION_RAISE,
  RETENTION_RAISE,
  SALES_COMMISSION,
} from '../sim/staff'
import { useGame, STARTING_CASH } from '../state/store'
import { CONTROLS, TOUCH_CONTROLS } from './controls'
import { formatMoney } from './format'
import { effectLabel } from './improvementText'

type GuideTab = 'basics' | 'selling' | 'business' | 'people' | 'controls'

const TABS: [GuideTab, string][] = [
  ['basics', 'Basics'],
  ['selling', 'Selling'],
  ['business', 'Business'],
  ['people', 'People'],
  ['controls', 'Controls'],
]

/** What every tab needs to word itself for mouse or touch. */
interface TabProps {
  touch: boolean
  /** "Click" or "Tap". */
  click: string
}

/** "press I or click Office" / "tap Office": how to open the office computer on a tab. */
function OfficeKey({ touch, keyName }: { touch: boolean; keyName: string }) {
  return touch ? (
    <>tap Office</>
  ) : (
    <>
      press <kbd>{keyName}</kbd> or click Office
    </>
  )
}

function BasicsTab({ touch, click }: TabProps) {
  return (
    <>
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
          Doors open at 9:00 and close at 18:00. Customers browse, then wait for help and lose
          patience if nobody comes. Some are passers-by off the sidewalk. Each day ends with a
          summary, and your progress is saved then.
        </p>
      </section>
      <section>
        <h3>The week</h3>
        <p>
          The top bar shows the date: weeks run Monday to Sunday and every month has four of them.
          You&apos;re open every day, but weekends are busiest: Saturday brings about twice
          Sunday&apos;s visitors and passers-by, and early in the week is quiet. The <b>Calendar</b>{' '}
          tab on the office computer (<OfficeKey touch={touch} keyName="C" />) shows this week and
          next, so you can stock up and book ads ahead of the rush.
        </p>
      </section>
      <section>
        <h3>Weather</h3>
        <p>
          The icon next to the date is today&apos;s weather. Rain keeps about 40% of visitors and
          passers-by away, leaves the lot cars much dirtier overnight, and customers left waiting
          out on the lot lose patience faster; heat wears them down too. Cars in the showroom stay
          dry, and a lot porter pays off in a wet spell. The Calendar tab forecasts the next three
          days, and it&apos;s usually right.
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
          Haggle in the customer panel: open with <b>Ask MSRP</b> or a little off, or set any price
          with − and +. Ask more than they hoped and they counter (a <b>$?</b> over their head);
          then <b>Hold</b>, <b>Split the difference</b> or <b>Accept</b>. Hold firm too long and
          they may walk, and after a few rounds they&apos;ll only reluctantly pay over their hope.
          The panel shows your margin at each price, in red below cost.
        </p>
        <p>
          Every car shows its MSRP and <i>your cost</i>; the difference is your gross profit. The
          day summary adds up revenue, cost and gross, then takes off wages, commissions and floor
          plan interest for the net.
        </p>
        <p>
          Clean cars sell better. Cars gather dust overnight (faster on the lot) and each time a
          customer looks one over. Inspect a car to see how clean it is, and {click.toLowerCase()}{' '}
          it to <b>Wash car</b>.
        </p>
      </section>
    </>
  )
}

function SellingTab() {
  return (
    <>
      <section>
        <h3>Customers</h3>
        <p>
          Greeting a customer tells you what kind they are. Someone <i>just looking</i> browses a
          lot and rarely buys. Someone who <i>knows what they want</i> heads for one car, won&apos;t
          wait long, and usually says yes. Customers <i>watching every dollar</i> have a tight
          budget, and couples take their time over each car.
        </p>
        <p>
          Bargain hunters want the most off and haggle longest. Decisive buyers want only a little
          off and won&apos;t haggle for long, and neither will someone just looking.
        </p>
      </section>
      <section>
        <h3>Reputation</h3>
        <p>
          The ♥ meter in the top bar, 0 to 100, moves once a day at closing: each buyer adds{' '}
          {REPUTATION_POINTS.sale}, each customer who walks out unhappy takes off{' '}
          {-REPUTATION_POINTS.refused}, each who gives up waiting {-REPUTATION_POINTS.impatient},
          and each who can&apos;t find the kind of car they want {-REPUTATION_POINTS.missed}.
          Customers still on the lot at closing don&apos;t count, and a day moves it at most{' '}
          {MAX_DAILY_CHANGE} either way.
        </p>
        <p>
          A good name brings more visitors, sends friends of past buyers your way (up to{' '}
          {MAX_REFERRALS} referrals a day at the top, mostly ready to buy) and makes every ad bring
          more. A poor one means fewer visitors and weaker ads.
        </p>
      </section>
    </>
  )
}

function BusinessTab({ touch, click }: TabProps) {
  return (
    <>
      <p className="how-lead">
        Stock, ads, upgrades and the calendar are all on the office computer: {click.toLowerCase()}{' '}
        the screen on your desk, or <OfficeKey touch={touch} keyName="I" /> and pick a tab.
      </p>
      <section>
        <h3>Buying stock</h3>
        <p>
          Sold cars leave empty spaces. Order new ones on the <b>Stock</b> tab; they&apos;re
          delivered the next morning, showroom platforms first, then the lot. You can cancel an
          order until the day ends. One model each day is on incentive,{' '}
          {Math.round(INCENTIVE_DISCOUNT * 100)}% off its invoice.
        </p>
        <p>
          Pay in <b>cash</b>, or put the car on the <b>floor plan</b>: the bank pays for it (up to{' '}
          {formatMoney(FLOOR_PLAN_LIMIT)} at once) and you pay{' '}
          {(FLOOR_PLAN_DAILY_RATE * 100).toFixed(1)}% of its cost in interest each day it sits. When
          it sells, the bank takes its cost out of the price. <b>Pay off</b> a car from cash to stop
          the interest.
        </p>
        <p>
          Customers who can&apos;t find the kind of car they want are counted as <i>missed</i> in
          the summary and the stock panel. Order what people ask for.
        </p>
      </section>
      <section>
        <h3>Manufacturer&apos;s quota</h3>
        <p>
          On the 1st of each month the manufacturer sets a sales target of {QUOTA_RANGE.min} to{' '}
          {QUOTA_RANGE.max} cars, more in busy months and with a good reputation. The flag in the
          top bar shows the cars sold so far against it and the days left; the <b>Calendar</b> tab
          shows how it&apos;s going.
        </p>
        <p>
          At the end of the month the manufacturer pays a <b>holdback</b>: a share of the sticker
          price of every car sold that month. Nothing below {Math.round(HOLDBACK_FLOOR * 100)}% of
          the target, a little from there, {(HOLDBACK_RATE * 100).toFixed(2)}% for hitting it and{' '}
          {Math.round(HOLDBACK_STRETCH * 100)}% from {Math.round(HOLDBACK_STRETCH_AT * 100)}%. Every
          sale counts, whoever makes it.
        </p>
      </section>
      <section>
        <h3>Advertising</h3>
        <p>
          Book a campaign on the <b>Marketing</b> tab
          {touch ? (
            ''
          ) : (
            <>
              {' '}
              (<kbd>M</kbd>)
            </>
          )}
          . You pay up front, and it brings extra visitors every day it runs, from tomorrow. Each
          channel draws its own crowd:
        </p>
        <ul>
          {CHANNEL_IDS.map((id) => {
            const c = CHANNELS[id]
            return (
              <li key={id}>
                <b>{c.label}</b>: {formatMoney(c.cost)} for {c.days} days, about {c.visitors} extra
                a day. {c.reaches}.
              </li>
            )
          })}
        </ul>
        <p>
          Booking a channel again while it runs brings fewer extra visitors. The summary shows how
          many visitors each source brought and what they bought, so you can see which ads pay.
        </p>
      </section>
      <section>
        <h3>Improvements</h3>
        <p>
          About {Math.round(WALK_IN_CHANCE * 100)} in 100 passers-by turn in to start with. Buy
          upgrades on the <b>Upgrades</b> tab
          {touch ? (
            ''
          ) : (
            <>
              {' '}
              (<kbd>U</kbd>)
            </>
          )}
          : you pay once, it goes up overnight and stays for good. Out front, a sign or a tube man
          draws more people in. In the showroom, buyers hope for less off and say yes a little more
          often. A done-up waiting area keeps waiting customers there longer.
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
        <p>Ads and upgrades come off the net on the day you pay for them.</p>
      </section>
    </>
  )
}

function PeopleTab({ touch, click }: TabProps) {
  return (
    <>
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
          to hire from the day&apos;s applicants. Everyone on the payroll is paid at closing.
        </p>
        <ul>
          <li>
            <b>Salespeople</b> greet, haggle and sign buyers at their own desk or hand them to
            finance, for {Math.round(SALES_COMMISSION * 100)}% of the gross (at least{' '}
            {formatMoney(MIN_COMMISSION)}). Seasoned ones hold nearer MSRP, get more yeses and greet
            customers on arrival; green ones open lower and give in sooner. None sell below cost.
            They leave alone a customer you&apos;re walking to, and a tick marks someone
            they&apos;re helping.
          </li>
          <li>
            A <b>receptionist</b> keeps waiting customers patient.
          </li>
          <li>
            A <b>finance manager</b> signs buyers at your office desk for {formatMoney(FINANCE_FEE)}{' '}
            a deal: lead a buyer there, {click.toLowerCase()} them and choose{' '}
            <b>Hand off to finance</b>, and you&apos;re free for the next customer. Buyers wait in
            the lounge if finance is busy.
          </li>
          <li>
            A <b>lot porter</b> washes the dirtiest cars all day.
          </li>
          <li>
            A <b>security guard</b> patrols the lot and deals with Nazma (below); the more skilled,
            the further they see.
          </li>
        </ul>
      </section>
      <section>
        <h3>The owner</h3>
        <p>
          Every two or three days the owner drops by at opening and sets a goal for the day, shown
          in the top bar: sales, revenue, gross profit, a body type, no impatient walk-outs or a
          reputation boost. Meet it by closing for a {formatMoney(OWNER_BONUS)} bonus.
        </p>
      </section>
      <section>
        <h3>Nazma</h3>
        <p>
          A former employee with it in for the place, in a dark hoodie and a red badge. From day{' '}
          {FIRST_NAZMA_DAY}, every few days he smears grime over two or three cars (lot first), or
          has a quiet word with one of your staff, the more skilled the likelier, and offers them a
          job.
        </p>
        <p>
          {click} him and choose <b>Confront</b> to run him off before he does it. A security guard
          makes his visits rarer and chases him off on sight; the porter cleans up after him.
        </p>
        <p>
          Someone he talks round is <i>thinking of quitting</i> (a ? on their badge). Press{' '}
          <b>Keep</b> in the staff panel before closing for a {Math.round(RETENTION_RAISE * 100)}%
          raise (at least {formatMoney(MIN_RETENTION_RAISE)} a day), or they leave at closing, paid
          for the day.
        </p>
        <p>
          From day {FIRST_THEFT_DAY}, some nights he drives a lot car away, pricier ones first. It
          is written off at cost, and a floored car&apos;s loan is called in the next morning. A
          security guard on the payroll stops him.
        </p>
      </section>
    </>
  )
}

function ControlsTab({ touch }: TabProps) {
  const controls = touch ? TOUCH_CONTROLS : CONTROLS
  return (
    <>
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
      <section>
        <h3>Sound</h3>
        <p>
          The 🔊 button in the top bar sets master, music, effects and voice volumes, and mutes it
          all
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
          Listen for the lot: a chime when a customer walks in, a jingle on a sale, a slammed door
          from someone leaving unhappy, the hiss of a wash and the scuff of Nazma smudging a car.
          The music follows the day and goes muffled while this guide is open.
        </p>
        <p>
          Everyone talks in gibberish, each in their own voice: hellos, back and forth over a car, a
          questioning counter, a happy yes or a grumble. You only hear the people near you.
        </p>
      </section>
    </>
  )
}

const TAB_BODIES: Record<GuideTab, (p: TabProps) => ReactNode> = {
  basics: BasicsTab,
  selling: SellingTab,
  business: BusinessTab,
  people: PeopleTab,
  controls: ControlsTab,
}

/**
 * A short guide in tabs: shown when a new game starts, and again on `?` or
 * from the title screen. Reopening keeps the last tab; ← and → switch tabs.
 */
export function HowToPlay() {
  const open = useGame((s) => s.helpOpen)
  const touch = useMediaQuery(COARSE)
  const [tab, setTab] = useState<GuideTab>('basics')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      e.preventDefault()
      const step = e.code === 'ArrowRight' ? 1 : -1
      setTab((t) => {
        const i = TABS.findIndex(([id]) => id === t)
        return TABS[(i + step + TABS.length) % TABS.length][0]
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  const Body = TAB_BODIES[tab]

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary how-to-play" role="dialog" aria-label="How to play">
        <div className="info-kicker">How to play</div>
        <h2>Run the lot</h2>
        <div className="panel-tabs" role="tablist">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'btn btn-small btn-primary' : 'btn btn-small'}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="how-body" key={tab} role="tabpanel">
          <Body touch={touch} click={touch ? 'Tap' : 'Click'} />
        </div>
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
