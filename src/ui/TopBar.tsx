import { formatTime, isClosed } from '../sim/clock'
import { reputationLabel } from '../sim/reputation'
import { useGame } from '../state/store'
import { formatMoney } from './format'
import { GoalBanner } from './GoalBanner'

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
 * Day, time, cash, reputation, the owner's goal (on their days) and the office (stock,
 * marketing and upgrades), staff and sound buttons.
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
      <span>Day {clock.day}</span>
      <span className="topbar-sep">·</span>
      <span className="topbar-time">{formatTime(clock.minute)}</span>
      {isClosed(clock) && <span className="topbar-closed">Closed</span>}
      {timeScale !== 1 && <span className="topbar-speed">×{timeScale}</span>}
      <span className="topbar-sep">·</span>
      <span className="topbar-cash">{formatMoney(cash)}</span>
      <ReputationMeter />
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
