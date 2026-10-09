import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { TUNING } from '../sim/difficulty'
import { FLOOR_PLAN_DAILY_RATE, FLOOR_PLAN_LIMIT } from '../sim/floorPlan'
import { APPRAISE_SECONDS } from '../sim/interactables'
import {
  AREA_LABELS,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  type ImprovementArea,
} from '../sim/improvements'
import { CLOSEOUT_REBATE, EVENTS } from '../sim/events'
import { CHANNEL_IDS, CHANNELS } from '../sim/marketing'
import { DAILY_DEPRECIATION, STALE_DAYS, USED_MARKUP } from '../sim/usedCars'
import { WALK_IN_CHANCE } from '../sim/pedestrians'
import { INCENTIVE_DISCOUNT } from '../sim/ordering'
import { FIRST_THEFT_DAY } from '../sim/nazma'
import { MAX_SHARE, OPENING_RANK, RIVAL_NAMES } from '../sim/rival'
import { QUOTE_TOLERANCE } from '../sim/negotiation'
import { ownerBonus } from '../sim/owner'
import {
  HOLDBACK_FLOOR,
  HOLDBACK_RATE,
  HOLDBACK_STRETCH,
  HOLDBACK_STRETCH_AT,
  QUOTA_RANGE,
} from '../sim/quota'
import { rankById, rankGross, RANKS } from '../sim/progression'
import { EXPANSION_IDS, EXPANSIONS } from '../sim/expansions'
import { MODEL_TIER, TIER_PERKS, TIERS, tierName } from '../sim/franchise'
import { carName } from '../sim/interactables'
import type { CarModel } from '../sim/layout'
import { MAX_DAILY_CHANGE, MAX_REFERRALS, REPUTATION_POINTS } from '../sim/reputation'
import {
  FINANCE_FEE,
  MIN_COMMISSION,
  MIN_RETENTION_RAISE,
  RETENTION_RAISE,
  ROLE_LIMITS,
  roleLimits,
  SALES_COMMISSION,
} from '../sim/staff'
import { levelTuning, useGame } from '../state/store'
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

/** "40%" for a factor of 0.6. */
const percentOff = (factor: number) => `${Math.round((1 - factor) * 100)}%`
/** "50%" for a factor of 1.5. */
const percentOn = (factor: number) => `${Math.round((factor - 1) * 100)}%`

function BasicsTab({ touch, click }: TabProps) {
  const { startingCash } = useGame(levelTuning)
  return (
    <>
      <section>
        <h3>The goal</h3>
        <p>
          Sell cars, build a loyal client base and grow your cash. You start with{' '}
          {formatMoney(startingCash)} and a lot full of cars.
        </p>
      </section>
      <section>
        <h3>Difficulty</h3>
        <p>
          Pick <b>Easy</b>, <b>Medium</b> or <b>Hard</b> when you start a new game; it stays for
          that game. Medium starts you with {formatMoney(TUNING.medium.startingCash)}.
        </p>
        <p>
          <b>Easy</b> starts with {formatMoney(TUNING.easy.startingCash)}, cars cost{' '}
          {percentOff(TUNING.easy.invoice)} less to order and floor plan interest is{' '}
          {percentOff(TUNING.easy.interest)} lower. About {percentOn(TUNING.easy.traffic)} more
          customers come in, they wait longer and are readier to buy. Nazma turns up less often and
          not before day {TUNING.easy.firstNazmaDay}, the quota is {percentOff(TUNING.easy.quota)}{' '}
          lower, the owner pays {formatMoney(ownerBonus(TUNING.easy.ownerBonus))} for a goal met and
          unhappy customers cost less reputation. Sellers hope for a little less, buyers expect a
          little less for their trade-ins, and your estimates of a used car&apos;s value are closer.
        </p>
        <p>
          Easy also helps you learn. While you haggle, a chip shows how warm the customer (or a
          seller) is to the numbers on the steppers, after any trade-in: <b>hot</b> (likely to take
          it), <b>warm</b> (they&apos;ll talk) or <b>cold</b> (likely to walk). The first time a day
          ends in the red, the bank tops your cash back up to $0; it only does this once. And tips
          pop up the first time things happen, such as a counter-offer, a dirty car or a visit from
          Nazma.
        </p>
        <p>
          <b>Hard</b> starts with {formatMoney(TUNING.hard.startingCash)}, cars cost{' '}
          {percentOn(TUNING.hard.invoice)} more and interest is {percentOn(TUNING.hard.interest)}{' '}
          higher. About {percentOff(TUNING.hard.traffic)} fewer customers come in, they run out of
          patience sooner, want a bigger discount and are slower to say yes. Nazma comes more often
          from day {TUNING.hard.firstNazmaDay} and steals and poaches more, the quota is{' '}
          {percentOn(TUNING.hard.quota)} higher, the owner pays only{' '}
          {formatMoney(ownerBonus(TUNING.hard.ownerBonus))} and reputation is harder to win and
          easier to lose. Sellers want more for their cars, buyers want more for their trade-ins,
          and your estimates are rougher.
        </p>
        <p>
          Dealer ranks need {percentOff(TUNING.easy.rankScale)} less lifetime gross on Easy and{' '}
          {percentOn(TUNING.hard.rankScale)} more on Hard. On Easy a month has to fall under{' '}
          {Math.round((HOLDBACK_FLOOR - TUNING.easy.franchiseSlack) * 100)}% of the quota, not{' '}
          {Math.round(HOLDBACK_FLOOR * 100)}%, to cost you a franchise tier. Nazma&apos;s rival lot
          opens {percentOff(TUNING.easy.rivalStrength)} weaker and undercuts you{' '}
          {percentOff(TUNING.easy.rivalUndercut)} less on Easy, and opens{' '}
          {percentOn(TUNING.hard.rivalStrength)} stronger and undercuts{' '}
          {percentOn(TUNING.hard.rivalUndercut)} more on Hard.
        </p>
      </section>
      <section>
        <h3>The day</h3>
        <p>
          Doors open at 9:00 and close at 18:00. Customers browse, then wait for help and lose
          patience if nobody comes. Some are passers-by off the sidewalk, and some drive in and park
          in the three customer spaces by the showroom; they walk back to their car to leave. Some
          drivers come to sell you their car instead, and some bring one to trade in (see{' '}
          <b>Selling</b>). Each day ends with a summary, and your progress is saved then.
        </p>
        <p>
          The game keeps changing. <b>What&apos;s new</b> on the title screen lists the recent
          updates, and it opens by itself when you come back to a game saved before them.
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

function SellingTab({ click }: TabProps) {
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
        <p>
          Someone <i>after a good used car</i> has about half a new car&apos;s budget, is open to
          more body types, mostly looks at used cars and haggles hard. While you have no used car
          for sale only a few come in, and the summary counts them as missed. Regulars and bargain
          hunters look at used cars now and then too.
        </p>
      </section>
      <section>
        <h3>Buying used cars</h3>
        <p>
          Some drivers come to <i>sell</i> their car for cash, and wait by it in customer parking.{' '}
          {click} the car to <b>Appraise</b> it: you look it over for {APPRAISE_SECONDS} seconds and
          get a much closer idea of what it&apos;s worth than a glance gives. Then{' '}
          {click.toLowerCase()} the seller to <b>Make offer</b>.
        </p>
        <p>
          The haggle runs the other way round: open under your estimate, and if they want more they
          name their price; <b>Hold</b>, <b>Split the difference</b> or <b>Accept</b>. A lowball may
          insult them into leaving. The panel shows your margin against your estimate. Salespeople
          buy from sellers too when there&apos;s room, never paying over their own appraisal.
        </p>
        <p>
          Buying needs a free lot space and the cash, paid on the spot. The car stays in customer
          parking until closing, then goes on the lot as a used car costing what you paid. The
          summary lists what you bought and what each car was really worth; the spend is stock, not
          an expense, so it isn&apos;t taken off the day&apos;s net.
        </p>
      </section>
      <section>
        <h3>Selling used cars</h3>
        <p>
          A used car&apos;s sticker is set when it comes in, about {Math.round(USED_MARKUP * 100)}%
          over what it&apos;s worth, but it loses about {(DAILY_DEPRECIATION * 100).toFixed(1)}% of
          its value every day it sits. Buyers judge its price against what it&apos;s worth today,
          not the sticker, so the longer it sits the less they&apos;ll pay. Its condition counts
          too: a car in good shape is easier to sell, a worn one harder.
        </p>
        <p>
          The stock panel shows each used car&apos;s days in stock and today&apos;s value, and flags
          it <b>Stale</b> after {STALE_DAYS} days. The summary splits gross profit between new and
          used cars, so you can see what your used stock really makes.
        </p>
      </section>
      <section>
        <h3>Trade-ins</h3>
        <p>
          Some drivers who come to buy want to trade their car in. The customer panel shows it and
          your estimate, and you can {click.toLowerCase()} their parked car to <b>Appraise</b> it
          too. The haggle then has two numbers: the price, and the <i>allowance</i> you give for
          their car, set with its own − and +. They judge what they&apos;d pay after the trade, so
          their counters are in those terms. An allowance far under what they hoped for offends them
          and wastes a round; a generous allowance with a firm price pleases regulars and couples
          most.
        </p>
        <p>
          When the deal is signed you take the price less the allowance, and their car goes on the
          lot at closing, costing the allowance. Over-allowing isn&apos;t a loss on the day: it
          shows up as a thin gross when that used car sells. With no free lot space you can&apos;t
          take the trade, and they&apos;re less likely to buy. Salespeople set allowances by their
          skill: green ones give buyers what they ask, seasoned ones start low and stay under their
          appraisal. The summary&apos;s seller table shows how far over or under value each one
          allowed.
        </p>
      </section>
      <section>
        <h3>Shoppers with his price</h3>
        <p>
          While Nazma&apos;s lot across the road is open, some shoppers have been there first. The
          customer panel shows his price on the new model they want (&ldquo;{RIVAL_NAMES[0]} quoted
          &hellip;&rdquo;). Ask more than {Math.round(QUOTE_TOLERANCE * 100)}% over it and they may
          walk out to him; ask his price or less and they&apos;re more likely to say yes.{' '}
          <b>Match his price</b> under the price stepper sets your ask to his quote.
        </p>
        <p>
          Each one who walks out to him makes him stronger, and each one you sell to at his price
          weakens him. Salespeople match him too: seasoned ones only while the sale still makes a
          profit, green ones whenever his price is over the car&apos;s cost.
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
  const { interest, rankScale } = useGame(levelTuning)
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
          {Math.round(INCENTIVE_DISCOUNT * 100)}% off its invoice, and in the last three days of
          each month the manufacturer clears out one model at {Math.round(CLOSEOUT_REBATE * 100)}%
          off (both, if it&apos;s on incentive too).
        </p>
        <p>
          Pay in <b>cash</b>, or put the car on the <b>floor plan</b>: the bank pays for it (up to{' '}
          {formatMoney(FLOOR_PLAN_LIMIT)} at once) and you pay{' '}
          {(FLOOR_PLAN_DAILY_RATE * interest * 100).toFixed(2).replace(/0$/, '')}% of its cost in
          interest each day it sits. When it sells, the bank takes its cost out of the price.{' '}
          <b>Pay off</b> a car from cash to stop the interest.
        </p>
        <p>
          Customers who can&apos;t find the kind of car they want are counted as <i>missed</i> in
          the summary and the stock panel. Order what people ask for.
        </p>
      </section>
      <section>
        <h3>Progress</h3>
        <p>
          Your dealership climbs through five ranks: {RANKS.map((r) => r.name).join(', ')}. Each one
          needs a lifetime gross profit (what your cars sold for, less what they cost you) and a
          reputation. The star in the top bar shows your rank and how far you are toward the next;
          the end-of-day summary tells you what&apos;s still needed.
        </p>
        <ul>
          {RANKS.slice(1).map((r) => (
            <li key={r.id}>
              <b>{r.name}</b>: {formatMoney(rankGross(r, rankScale))} gross and a reputation of{' '}
              {r.reputation}
            </li>
          ))}
        </ul>
        <p>Once you reach a rank you keep it, even if your reputation slips later.</p>
        <p>
          Reaching {RANKS[RANKS.length - 1].name} wins the game. You&apos;ll see your career on a
          trophy screen, then you can keep playing for as long as you like.
        </p>
        <h4>Expansion</h4>
        <p>
          A rank lets you buy more ground and building on the <b>Upgrades</b> tab. You pay up front
          and it&apos;s built overnight. The manufacturer&apos;s quota stays the same.
        </p>
        <ul>
          {EXPANSION_IDS.map((id) => {
            const x = EXPANSIONS[id]
            return (
              <li key={id}>
                <b>{x.label}</b>: {formatMoney(x.cost)}, from {rankById(x.rank).name}. {x.blurb}
              </li>
            )
          })}
        </ul>
      </section>
      <section>
        <h3>The rival across the road</h3>
        <p>
          Once you reach {rankById(OPENING_RANK).name}, Nazma buys the lot across the road. A week
          or so later {RIVAL_NAMES[0]} opens there, a little under your prices, and some of the
          town&apos;s shoppers go to him instead of you: up to {Math.round(MAX_SHARE * 100)}% of
          them.
        </p>
        <p>
          A better reputation and ads running keep more of them coming to you, and so does pricing
          close to his. He grows stronger while he does well and weaker while he doesn&apos;t.
        </p>
        <p>
          You can see his lot from the sidewalk. While it&apos;s open, the top bar shows the share
          of today&apos;s buyers he takes, and every Monday morning you hear how he did last week.
          The <b>Rival</b> tab on the office computer (<OfficeKey touch={touch} keyName="K" />) has
          his share day by day, his strength and his price on every model.
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
          new car sold counts, whoever makes it; used cars don&apos;t.
        </p>
      </section>
      <section>
        <h3>Franchise tier</h3>
        <p>
          The manufacturer ranks its dealers Bronze, Silver and Gold, and you start at Bronze. A
          month that meets the quota moves you up a tier; one under{' '}
          {Math.round(HOLDBACK_FLOOR * 100)}% of it drops you a tier. A higher tier pays less for
          stock, gets a bigger holdback and may order the top models:
        </p>
        <ul>
          {TIERS.map((t) => {
            const models = (Object.keys(MODEL_TIER) as CarModel[]).filter(
              (m) => MODEL_TIER[m] === t,
            )
            return (
              <li key={t}>
                <b>{tierName(t)}</b>: invoice{' '}
                {TIER_PERKS[t].invoice < 1
                  ? `${Math.round((1 - TIER_PERKS[t].invoice) * 100)}% off`
                  : 'at list'}
                , holdback × {TIER_PERKS[t].holdback}
                {models.length > 0 && <>, unlocks the {models.map(carName).join(' and ')}</>}
              </li>
            )
          })}
        </ul>
        <p>
          Locked models are greyed out on the Stock tab. The Calendar tab shows your tier and what
          it takes to move.
        </p>
      </section>
      <section>
        <h3>Sale weekends</h3>
        <p>
          A few holiday weekends a year (Friday to Sunday) are sales:{' '}
          {EVENTS.map((e) => e.label).join(', ')}. They bring up to twice the visitors, more of them
          bargain hunters, and everyone expects a bigger discount, so you sell more cars at thinner
          margins. You get a week&apos;s warning: stock up and book ads beforehand. The Calendar tab
          shows when the next one is, and the owner may ask for more sales that day.
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
        <p>Ads, upgrades and expansions come off the net on the day you pay for them.</p>
      </section>
    </>
  )
}

function PeopleTab({ touch, click }: TabProps) {
  const level = useGame(levelTuning)
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
          to hire from the day&apos;s applicants. Everyone on the payroll is paid at closing. You
          can have up to {ROLE_LIMITS.sales} salespeople and one of each other role; the{' '}
          {EXPANSIONS['showroom-wing'].label.toLowerCase()} makes room for{' '}
          {roleLimits(['showroom-wing']).sales} salespeople and{' '}
          {roleLimits(['showroom-wing']).porter} lot porters (see <b>Business</b>).
        </p>
        <ul>
          <li>
            <b>Salespeople</b> greet, haggle and sign buyers at their own desk or hand them to
            finance, for {Math.round(SALES_COMMISSION * 100)}% of the gross (at least{' '}
            {formatMoney(MIN_COMMISSION)}). Seasoned ones hold nearer MSRP, get more yeses and greet
            customers on arrival; green ones open lower and give in sooner. None sell below cost.
            They take trade-ins and buy from sellers too (see <b>Selling</b>). They leave alone a
            customer you&apos;re walking to, and a tick marks someone they&apos;re helping.
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
          reputation boost. Meet it by closing for a {formatMoney(ownerBonus(level.ownerBonus))}{' '}
          bonus.
        </p>
      </section>
      <section>
        <h3>Nazma</h3>
        <p>
          A former employee with it in for the place, in a dark hoodie and a red badge. From day{' '}
          {level.firstNazmaDay}, every few days he smears grime over two or three cars (lot first),
          or has a quiet word with one of your staff, the more skilled the likelier, and offers them
          a job.
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
