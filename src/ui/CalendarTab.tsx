import { useMemo, useState } from 'react'
import {
  appreciationBlocker,
  appreciationCost,
  APPRECIATION_COST,
  bookableDays,
  BOOK_AHEAD,
  COST_PER_GUEST,
  invitedCount,
  upcoming,
} from '../sim/appreciation'
import { appointmentsOn } from '../sim/calls'
import { auctionOpen, isAuctionDay } from '../sim/auction'
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
import type { Client } from '../sim/clients'
import { formatTime } from '../sim/clock'
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
  CSI_FACTORS,
  CSI_FLOOR,
  CSI_PAR,
  CSI_TIER_MIN,
  CSI_TOP,
  csiFactor,
  csiOf,
} from '../sim/csi'
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
import { courseGapsOn, rotaGaps } from '../state/selectors'
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
  const party = useGame((s) => s.appreciation?.day === day)
  const auction = useGame((s) => auctionOpen(s.career)) && isAuctionDay(day)
  // A day the rota leaves a role with nobody in, from today on.
  const rota = useGame((s) => (day >= today ? rotaGaps(s, c.weekday) : undefined))
  const courses = useGame((s) => (day >= today ? courseGapsOn(s, day) : undefined))
  const gaps = rota || courses ? [...(rota ?? []), ...(courses ?? [])] : undefined
  // What happened, or what the forecast says for the next few days.
  const weather = forecastFor(day, today)
  const event = eventOn(day)
  const traffic =
    weekdayTraffic(day) * (weather ? WEATHER_EFFECTS[weather].traffic : 1) * (event?.traffic ?? 1)
  const when = day === today ? 'today' : day < today ? 'past' : 'ahead'
  const sky = weather
    ? `${day > today ? 'Forecast: ' : ''}${WEATHER_LABELS[weather].toLowerCase()}`
    : 'No forecast yet'
  const sale = `${event ? ` · ${event.label} sale` : ''}${recall ? ' · recall' : ''}${party ? ' · client appreciation day' : ''}${auction ? ' · dealer auction' : ''}${gaps ? ` · ${gaps.join(', ')}` : ''}`
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
        {party ? 'Cookout · ' : ''}
        {auction ? 'Auction · ' : ''}
        {gaps ? <span className="cal-gap">Gap · </span> : ''}
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
  const csi = useGame((s) => csiOf(s.monthCsi))
  const payout = holdback(
    sales.count,
    quota,
    sales.msrp,
    TIER_PERKS[tier].holdback * csiFactor(csi),
  )
  return (
    <>
      <h3>
        Manufacturer&apos;s quota <span className="muted">· {QUOTA_STATUS_LABELS[status]}</span>
      </h3>
      <div className={`cal-quota quota-${status}`} data-coach="calendar-quota">
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
      <h3 data-coach="calendar-csi">
        Customer satisfaction (CSI){' '}
        <span className="muted">· {csi === null ? 'no new-car buyers yet' : csi}</span>
      </h3>
      <p className="muted cal-intro">
        The manufacturer surveys every new-car buyer. The month&apos;s average scales the holdback:
        × {CSI_FACTORS.under} under {CSI_FLOOR}, × 1 at {CSI_PAR}, up to × {CSI_FACTORS.top} from{' '}
        {CSI_TOP}
        {csi !== null && <> (× {csiFactor(csi).toFixed(2)} now)</>}. Under {CSI_TIER_MIN}, meeting
        the quota won&apos;t move you up a tier.
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
      <ul className="cal-tiers" data-coach="calendar-franchise">
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

/** Today's and tomorrow's appointments from the client book, by time. */
function Appointments({ day }: { day: number }) {
  const clients = useGame((s) => s.clients)
  const today = useMemo(() => appointmentsOn(clients, day), [clients, day])
  const tomorrow = useMemo(() => appointmentsOn(clients, day + 1), [clients, day])
  if (today.length === 0 && tomorrow.length === 0) return null
  const list = (who: readonly Client[]) =>
    who.map((c) => `${c.name} at ${formatTime(c.appointment!.minute)}`).join(', ')
  return (
    <>
      <h3>Appointments</h3>
      <p className="muted cal-intro">
        {today.length > 0 && (
          <>
            Today: <span className="client-appointment">{list(today)}</span>.{' '}
          </>
        )}
        {tomorrow.length > 0 && (
          <>
            Tomorrow: <span className="client-appointment">{list(tomorrow)}</span>.
          </>
        )}
      </p>
    </>
  )
}

/**
 * Client appreciation day: what's booked, or a day to book (`BOOK_AHEAD` days
 * out, once a month) and what it costs with the book as it is.
 */
function AppreciationDay({ day }: { day: number }) {
  const appreciation = useGame((s) => s.appreciation)
  const clients = useGame((s) => s.clients)
  const cash = useGame((s) => s.cash)
  const days = useMemo(() => bookableDays(appreciation, day), [appreciation, day])
  const [picked, setPicked] = useState<number | null>(null)
  const when = picked !== null && days.includes(picked) ? picked : (days[0] ?? null)
  const invited = useMemo(() => invitedCount(clients), [clients])
  const cost = appreciationCost(clients)
  const blocker =
    when === null
      ? null
      : appreciationBlocker({ appreciation, book: clients, cash, today: day }, when)
  return (
    <>
      <h3>Client appreciation day</h3>
      {upcoming(appreciation, day) ? (
        <p className="muted cal-intro">
          Booked for <b>{appreciation!.day === day ? 'today' : longDate(appreciation!.day)}</b>.
          Your clients are invited to a cookout on the lot: some come ready to trade up, and some
          bring a friend.
        </p>
      ) : (
        <>
          <p className="muted cal-intro">
            Invite your {invited} client{invited === 1 ? '' : 's'} in good standing to a cookout on
            the lot, {BOOK_AHEAD.min}–{BOOK_AHEAD.max} days ahead, once a month. It costs{' '}
            {formatMoney(APPRECIATION_COST)} plus {formatMoney(COST_PER_GUEST)} a client, paid now.
            Every guest leaves happier, those due to trade up come ready to, rain keeps some away,
            and a guest nobody gets to just enjoys lunch.
          </p>
          {when !== null && (
            <div className="cal-book">
              <select
                aria-label="Day"
                value={when}
                onChange={(e) => setPicked(Number(e.target.value))}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {longDate(d)}
                  </option>
                ))}
              </select>{' '}
              <button
                className="btn btn-small btn-primary"
                disabled={!!blocker}
                title={blocker ?? undefined}
                onClick={() => useGame.getState().bookAppreciation(when)}
              >
                Book for {formatMoney(cost)}
              </button>
              {blocker && <span className="muted"> {blocker}</span>}
            </div>
          )}
        </>
      )}
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
        people away; the forecast covers the next three days and is usually right. A gap is a day
        the staff schedule leaves a role with nobody in.
      </p>
      <Week title="This week" start={start} today={day} />
      <Week title="Next week" start={start + DAYS_PER_WEEK} today={day} />
      <Appointments day={day} />
      <AppreciationDay day={day} />
      <SalesAndCloseouts day={day} />
      <Recalls day={day} />
      <MonthQuota day={day} />
      <Franchise />
    </>
  )
}
