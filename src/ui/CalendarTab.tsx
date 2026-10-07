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
import { useGame } from '../state/store'

const PEAK = Math.max(...WEEKDAY_TRAFFIC)

function DayRow({ day, today }: { day: number; today: number }) {
  const c = calendarOf(day)
  const traffic = weekdayTraffic(day)
  const when = day === today ? 'today' : day < today ? 'past' : 'ahead'
  return (
    <li className={`cal-day cal-${when}`} title={longDate(day)}>
      <span className="cal-name">
        {weekdayLabel(c.weekday)} <span className="muted">{c.dayOfMonth}</span>
      </span>
      <span className="cal-bar" aria-hidden>
        <span className="cal-fill" style={{ width: `${(traffic / PEAK) * 100}%` }} />
      </span>
      <span className="cal-label">
        {day === today ? 'Today · ' : ''}
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

/** This week and next, with each day's expected traffic. */
export function CalendarTab() {
  const day = useGame((s) => s.clock.day)
  const start = weekStart(day)
  return (
    <>
      <h2>{longDate(day)}</h2>
      <p className="muted cal-intro">
        Weekends are busiest: Saturday brings the most visitors, Sunday the fewest.
      </p>
      <Week title="This week" start={start} today={day} />
      <Week title="Next week" start={start + DAYS_PER_WEEK} today={day} />
    </>
  )
}
