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
import { forecastFor, WEATHER_EFFECTS, WEATHER_ICONS, WEATHER_LABELS } from '../sim/weather'
import { useGame } from '../state/store'

const PEAK =
  Math.max(...WEEKDAY_TRAFFIC) * Math.max(...Object.values(WEATHER_EFFECTS).map((e) => e.traffic))

function DayRow({ day, today }: { day: number; today: number }) {
  const c = calendarOf(day)
  // What happened, or what the forecast says for the next few days.
  const weather = forecastFor(day, today)
  const traffic = weekdayTraffic(day) * (weather ? WEATHER_EFFECTS[weather].traffic : 1)
  const when = day === today ? 'today' : day < today ? 'past' : 'ahead'
  const sky = weather
    ? `${day > today ? 'Forecast: ' : ''}${WEATHER_LABELS[weather].toLowerCase()}`
    : 'No forecast yet'
  return (
    <li className={`cal-day cal-${when}`} title={`${longDate(day)} · ${sky}`}>
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
    </>
  )
}
