import { formatTime, isClosed } from '../sim/clock'
import { useGame } from '../state/store'
import { formatMoney } from './format'
import { GoalBanner } from './GoalBanner'

/**
 * Day, time, cash, the owner's goal (on their days) and the stock and staff buttons.
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
      <GoalBanner />
      <button
        className={stockOpen ? 'btn btn-small btn-primary' : 'btn btn-small'}
        aria-pressed={stockOpen}
        onClick={() => useGame.getState().toggleStockPanel()}
      >
        Stock
      </button>
      <button
        className={staffOpen ? 'btn btn-small btn-primary' : 'btn btn-small'}
        aria-pressed={staffOpen}
        onClick={() => useGame.getState().toggleStaffPanel()}
      >
        Staff
      </button>
    </div>
  )
}
