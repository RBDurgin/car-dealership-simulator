import { formatTime, isClosed } from '../sim/clock'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/** Day, time and cash. Re-renders only on 10-minute clock steps and sales. */
export function TopBar() {
  const clock = useGame((s) => s.clock)
  const cash = useGame((s) => s.cash)
  return (
    <div className="panel topbar">
      <span>Day {clock.day}</span>
      <span className="topbar-sep">·</span>
      <span className="topbar-time">{formatTime(clock.minute)}</span>
      {isClosed(clock) && <span className="topbar-closed">Closed</span>}
      <span className="topbar-sep">·</span>
      <span className="topbar-cash">{formatMoney(cash)}</span>
    </div>
  )
}
