import { calendarOf, formatDate, longDate } from '../sim/calendar'
import { formatTime, isClosed } from '../sim/clock'
import { eventOn } from '../sim/events'
import { RANK_IDS, rankProgress } from '../sim/progression'
import { daysLeft, QUOTA_STATUS_LABELS, quotaLine, quotaStatus } from '../sim/quota'
import { reputationLabel } from '../sim/reputation'
import { WEATHER_HINTS, WEATHER_ICONS, WEATHER_LABELS } from '../sim/weather'
import { levelTuning, useGame } from '../state/store'
import { formatMoney } from './format'
import { GoalBanner } from './GoalBanner'
import { rankLine } from './rankText'

/** Reputation as a small bar and its score; it only changes when a day is settled. */
function ReputationMeter() {
  const reputation = useGame((s) => s.reputation)
  const label = reputationLabel(reputation)
  return (
    <span
      className="rep-meter"
      title={`Reputation: ${reputation}/100 (${label}). Happy buyers raise it; walk-outs, impatient customers and missed demand lower it.`}
      aria-label={`Reputation ${reputation} of 100, ${label}`}
    >
      <span className="rep-icon" aria-hidden>
        ♥
      </span>
      <span className="rep-bar" aria-hidden>
        <span className="rep-fill" style={{ width: `${reputation}%` }} />
      </span>
      <span className="rep-score">{reputation}</span>
    </span>
  )
}

/** The dealer rank, with the way to the next one on hover; compact screens keep its number. */
function RankChip() {
  const career = useGame((s) => s.career)
  const reputation = useGame((s) => s.reputation)
  const scale = useGame((s) => levelTuning(s).rankScale)
  const progress = rankProgress(career, reputation, scale)
  const level = RANK_IDS.indexOf(progress.rank.id) + 1
  const text = `Dealer rank ${level} of ${RANK_IDS.length}: ${progress.rank.name}. ${rankLine(progress, career.gross)}.`
  return (
    <span className="rank-chip" title={text} aria-label={text}>
      <span className="rank-icon" aria-hidden>
        ★
      </span>
      <span className="rank-level" aria-hidden>
        {level}
      </span>
      <span className="rank-name" aria-hidden>
        {progress.rank.name}
      </span>
      <span className="rank-bar" aria-hidden>
        <span className="rank-fill" style={{ width: `${progress.share * 100}%` }} />
      </span>
    </span>
  )
}

/** The month's sales against the manufacturer's quota, with the days left; compact screens keep the count. */
function QuotaMeter({ day }: { day: number }) {
  const sold = useGame((s) => s.monthSales.count)
  const quota = useGame((s) => s.quota)
  const left = daysLeft(calendarOf(day).dayOfMonth)
  const status = quotaStatus(sold, quota, left)
  const text = `Manufacturer's quota: ${quotaLine(sold, quota, left)} (${QUOTA_STATUS_LABELS[status].toLowerCase()}). Hit it for a holdback at month end.`
  return (
    <span className={`quota-meter quota-${status}`} title={text} aria-label={text}>
      <span className="quota-icon" aria-hidden>
        ⚑
      </span>
      <span aria-hidden>
        {sold}/{quota}
      </span>
      <span className="quota-left" aria-hidden>
        {' '}
        · {left}d
      </span>
    </span>
  )
}

/** "Sat · Wk 2 · Mar"; compact screens keep only the weekday. */
function TopBarDate({ day }: { day: number }) {
  const [weekday, ...rest] = formatDate(day).split(' · ')
  return (
    <span className="topbar-date" title={`${longDate(day)} (day ${day})`}>
      {weekday}
      <span className="topbar-date-rest"> · {rest.join(' · ')}</span>
    </span>
  )
}

/** Today's weather as an icon, with what it means on hover. */
function WeatherIcon() {
  const weather = useGame((s) => s.weather)
  const text = `${WEATHER_LABELS[weather]}: ${WEATHER_HINTS[weather]}`
  return (
    <span className="topbar-weather" title={text} aria-label={text} role="img">
      {WEATHER_ICONS[weather]}
    </span>
  )
}

/** On a sale weekend, a tag naming the sale; compact screens keep the icon. */
function SaleBadge({ day }: { day: number }) {
  const event = eventOn(day)
  if (!event) return null
  const text = `${event.label} sale: about ${event.traffic}× the visitors, hoping for a bigger discount.`
  return (
    <span className="sale-badge" title={text} aria-label={text}>
      <span aria-hidden>🏷️</span>
      <span className="sale-label" aria-hidden>
        {event.label}
      </span>
    </span>
  )
}

/** The speaker: shows whether sound is muted and opens the sound settings. */
function SoundButton() {
  const muted = useGame((s) => s.audio.muted)
  const open = useGame((s) => s.audioOpen)
  const label = muted ? 'Sound settings (muted)' : 'Sound settings'
  return (
    <button
      className={open ? 'btn btn-small btn-primary topbar-sound' : 'btn btn-small topbar-sound'}
      aria-label={label}
      title={`${label}. N mutes.`}
      onClick={() => useGame.getState().toggleAudioPanel()}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}

/**
 * Date, weather, any sale, time, cash, reputation, the dealer rank, the month's quota, the owner's goal (on their days) and the office (stock,
 * marketing, upgrades and calendar), staff and sound buttons.
 * Re-renders only on 10-minute clock steps and sales.
 */
export function TopBar() {
  const clock = useGame((s) => s.clock)
  const cash = useGame((s) => s.cash)
  const timeScale = useGame((s) => s.timeScale)
  const staffOpen = useGame((s) => s.staffOpen)
  const stockOpen = useGame((s) => s.stockOpen)
  return (
    <div className="panel topbar">
      <TopBarDate day={clock.day} />
      <WeatherIcon />
      <SaleBadge day={clock.day} />
      <span className="topbar-sep">·</span>
      <span className="topbar-time">{formatTime(clock.minute)}</span>
      {isClosed(clock) && <span className="topbar-closed">Closed</span>}
      {timeScale !== 1 && <span className="topbar-speed">×{timeScale}</span>}
      <span className="topbar-sep">·</span>
      <span className="topbar-cash">{formatMoney(cash)}</span>
      <ReputationMeter />
      <RankChip />
      <QuotaMeter day={clock.day} />
      <GoalBanner />
      <button
        className={stockOpen ? 'btn btn-small btn-primary' : 'btn btn-small'}
        aria-pressed={stockOpen}
        onClick={() => useGame.getState().toggleStockPanel()}
      >
        Office
      </button>
      <button
        className={staffOpen ? 'btn btn-small btn-primary' : 'btn btn-small'}
        aria-pressed={staffOpen}
        onClick={() => useGame.getState().toggleStaffPanel()}
      >
        Staff
      </button>
      <SoundButton />
    </div>
  )
}
