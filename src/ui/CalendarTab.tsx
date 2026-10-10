import {
  calendarOf,
  DAYS_PER_WEEK,
  longDate,
  monthLabel,
  trafficLabel,
  WEEKDAY_TRAFFIC,
  weekdayLabel,
  weekdayTraffic,
  weekStart,
} from '../sim/calendar'
import { CLOSEOUT_REBATE, closeoutOn, EVENTS, eventOn, nextEvent } from '../sim/events'
import { expansionsUp } from '../sim/expansions'
import { MODEL_TIER, TIER_PERKS, TIERS, tierName, type FranchiseTier } from '../sim/franchise'
import { carName } from '../sim/interactables'
import type { CarModel } from '../sim/layout'
import {
  daysLeft,
  holdback,
  HOLDBACK_FLOOR,
  HOLDBACK_PARTIAL,
  HOLDBACK_RATE,
  HOLDBACK_STRETCH,
  HOLDBACK_STRETCH_AT,
  QUOTA_STATUS_LABELS,
  quotaLine,
  quotaStatus,
} from '../sim/quota'
import {
  dayOrdinal,
  RECALL_FIRST,
  RECALL_LAST,
  recallExpected,
  recallLine,
  recallOn,
} from '../sim/recalls'
import { bayCount } from '../sim/service'
import { forecastFor, WEATHER_EFFECTS, WEATHER_ICONS, WEATHER_LABELS } from '../sim/weather'
import { levelTuning, useGame } from '../state/store'
import { formatMoney } from './format'

const PEAK =
  Math.max(...WEEKDAY_TRAFFIC) *
  Math.max(...Object.values(WEATHER_EFFECTS).map((e) => e.traffic)) *
  Math.max(...EVENTS.map((e) => e.traffic))

/** Whether `a` and `b` fall in the same month of the same year. */
function sameMonth(a: number, b: number): boolean {
  const x = calendarOf(a)
  const y = calendarOf(b)
  return x.month === y.month && x.year === y.year
}

function DayRow({ day, today }: { day: number; today: number }) {
  const c = calendarOf(day)
  // A recall's days, once it's been announced.
  const bays = useGame((s) => bayCount(expansionsUp(s)))
  const recall = !!recallOn(today, bays) && !!recallOn(day, bays) && sameMonth(day, today)
  // What happened, or what the forecast says for the next few days.
  const weather = forecastFor(day, today)
  const event = eventOn(day)
  const traffic =
    weekdayTraffic(day) * (weather ? WEATHER_EFFECTS[weather].traffic : 1) * (event?.traffic ?? 1)
  const when = day === today ? 'today' : day < today ? 'past' : 'ahead'
  const sky = weather
    ? `${day > today ? 'Forecast: ' : ''}${WEATHER_LABELS[weather].toLowerCase()}`
    : 'No forecast yet'
  const sale = `${event ? ` · ${event.label} sale` : ''}${recall ? ' · recall' : ''}`
  return (
    <li
      className={`cal-day cal-${when}${event ? ' cal-sale' : ''}`}
      title={`${longDate(day)} · ${sky}${sale}`}
    >
      <span className="cal-name">
        {weekdayLabel(c.weekday)} <span className="muted">{c.dayOfMonth}</span>
      </span>
      <span className="cal-weather" aria-label={sky} role="img">
        {weather ? WEATHER_ICONS[weather] : ''}
      </span>
      <span className="cal-bar" aria-hidden>
        <span className="cal-fill" style={{ width: `${(traffic / PEAK) * 100}%` }} />
      </span>
      <span className="cal-label">
        {day === today ? 'Today · ' : ''}
        {event ? 'Sale · ' : ''}
        {recall ? 'Recall · ' : ''}
        {trafficLabel(traffic)}
      </span>
    </li>
  )
}

function Week({ title, start, today }: { title: string; start: number; today: number }) {
  const c = calendarOf(start)
  return (
    <>
      <h3>
        {title}{' '}
        <span className="muted">
          · week {c.week} of {monthLabel(c.month, true)}
        </span>
      </h3>
      <ul className="cal-week">
        {Array.from({ length: DAYS_PER_WEEK }, (_, i) => (
          <DayRow key={i} day={start + i} today={today} />
        ))}
      </ul>
    </>
  )
}

const percent = (rate: number) => `${+(rate * 100).toFixed(2)}%`

/** The month so far against the manufacturer's quota, and what the holdback would pay. */
function MonthQuota({ day }: { day: number }) {
  const sales = useGame((s) => s.monthSales)
  const quota = useGame((s) => s.quota)
  const left = daysLeft(calendarOf(day).dayOfMonth)
  const status = quotaStatus(sales.count, quota, left)
  const tier = useGame((s) => s.franchise)
  const payout = holdback(sales.count, quota, sales.msrp, TIER_PERKS[tier].holdback)
  return (
    <>
      <h3>
        Manufacturer&apos;s quota <span className="muted">· {QUOTA_STATUS_LABELS[status]}</span>
      </h3>
      <div className={`cal-quota quota-${status}`}>
        <span className="cal-bar" aria-hidden>
          <span
            className="cal-fill"
            style={{ width: `${Math.min(100, (sales.count / quota) * 100)}%` }}
          />
        </span>
        <span>{quotaLine(sales.count, quota, left)}</span>
      </div>
      <p className="muted cal-intro">
        At month end the manufacturer pays a holdback on the sticker price of every car sold that
        month: {percent(HOLDBACK_PARTIAL)} from {Math.ceil(quota * HOLDBACK_FLOOR)} cars,{' '}
        {percent(HOLDBACK_RATE)} at {quota}, {percent(HOLDBACK_STRETCH)} from{' '}
        {Math.ceil(quota * HOLDBACK_STRETCH_AT)}
        {TIER_PERKS[tier].holdback !== 1 && (
          <>
            , all × {TIER_PERKS[tier].holdback} at {tierName(tier)}
          </>
        )}
        . As things stand: <b className="price">{formatMoney(payout)}</b>.
      </p>
    </>
  )
}

/** What a tier offers: "4% off invoice, holdback × 1.5, may order the Summit Vela GT and …". */
function perkLine(tier: FranchiseTier): string {
  const { invoice, holdback } = TIER_PERKS[tier]
  const models = (Object.keys(MODEL_TIER) as CarModel[])
    .filter((m) => TIERS.indexOf(MODEL_TIER[m]!) <= TIERS.indexOf(tier))
    .map(carName)
  const parts = [
    invoice < 1 ? `${Math.round((1 - invoice) * 100)}% off invoice` : 'list invoice',
    `holdback × ${holdback}`,
    models.length > 0 ? `may order the ${models.join(' and ')}` : 'no premium models',
  ]
  return parts.join(', ')
}

/** The franchise tier, what it gives, and what moves it at month end. */
function Franchise() {
  const tier = useGame((s) => s.franchise)
  const quota = useGame((s) => s.quota)
  const slack = useGame((s) => levelTuning(s).franchiseSlack)
  const i = TIERS.indexOf(tier)
  const up = TIERS[i + 1]
  const down = i > 0 ? TIERS[i - 1] : null
  const dropUnder = Math.ceil(quota * (HOLDBACK_FLOOR - slack))
  return (
    <>
      <h3>
        Franchise <span className="muted">· {tierName(tier)}</span>
      </h3>
      <ul className="cal-tiers">
        {TIERS.map((t) => (
          <li key={t} className={t === tier ? 'cal-tier-now' : undefined}>
            <b>{tierName(t)}</b>: {perkLine(t)}
          </li>
        ))}
      </ul>
      <p className="muted cal-intro">
        {up ? (
          <>
            Sell {quota} new cars this month to move up to <b>{tierName(up)}</b>.{' '}
          </>
        ) : (
          <>Meet the quota to stay at Gold. </>
        )}
        {down ? (
          <>
            Under {dropUnder} and you drop to {tierName(down)}.
          </>
        ) : null}
      </p>
    </>
  )
}

/** The next sale weekend, and this month's closeout model once it's on. */
function SalesAndCloseouts({ day }: { day: number }) {
  const today = eventOn(day)
  const next = nextEvent(day)
  const opens = calendarOf(next.day)
  const closeout = closeoutOn(day)
  return (
    <>
      <h3>Sales and closeouts</h3>
      <p className="muted cal-intro">
        {today ? (
          <>
            The <b>{today.label}</b> sale is on: more visitors, mostly bargain hunters, hoping for
            about {Math.round(today.extraDiscount * 100)}% more off.{' '}
          </>
        ) : null}
        Next sale: <b>{next.event.label}</b>, Friday to Sunday of week {opens.week} of{' '}
        {monthLabel(opens.month, true)} (in {next.day - day} days).{' '}
        {closeout ? (
          <>
            Month-end closeout: the <b>{carName(closeout)}</b> is{' '}
            {Math.round(CLOSEOUT_REBATE * 100)}% off invoice until the month ends.
          </>
        ) : (
          <>
            In the last three days of each month one model is {Math.round(CLOSEOUT_REBATE * 100)}%
            off invoice.
          </>
        )}
      </p>
    </>
  )
}

/** The manufacturer's recall on now, once there's a garage for it. */
function Recalls({ day }: { day: number }) {
  const bays = useGame((s) => bayCount(expansionsUp(s)))
  const recall = recallOn(day, bays)
  const sold = useGame((s) => (recall ? (s.career.soldByModel[recall.model] ?? 0) : 0))
  if (bays === 0) return null
  return (
    <>
      <h3>Recalls</h3>
      <p className="muted cal-intro">
        {recall ? (
          <>
            The manufacturer has recalled the <b>{recallLine(recall)}</b>, until the{' '}
            {dayOrdinal(RECALL_LAST)}. Of the {sold} you&apos;ve sold, expect about{' '}
            {recallExpected(sold)} in. The manufacturer pays for the work.
          </>
        ) : (
          <>
            No recall on now. When the manufacturer recalls a model, it runs from the{' '}
            {dayOrdinal(RECALL_FIRST)} to the {dayOrdinal(RECALL_LAST)}: the people you sold one to
            bring it to your garage, and the manufacturer pays for the work.
          </>
        )}
      </p>
    </>
  )
}

/** This week and next, with each day's weather (forecast a few days ahead) and expected traffic. */
export function CalendarTab() {
  const day = useGame((s) => s.clock.day)
  const start = weekStart(day)
  return (
    <>
      <h2>{longDate(day)}</h2>
      <p className="muted cal-intro">
        Weekends are busiest: Saturday brings the most visitors, Sunday the fewest. Rain keeps
        people away; the forecast covers the next three days and is usually right.
      </p>
      <Week title="This week" start={start} today={day} />
      <Week title="Next week" start={start + DAYS_PER_WEEK} today={day} />
      <SalesAndCloseouts day={day} />
      <Recalls day={day} />
      <MonthQuota day={day} />
      <Franchise />
    </>
  )
}
