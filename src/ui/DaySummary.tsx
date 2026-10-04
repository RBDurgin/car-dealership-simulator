import { formatTime, isClosed } from '../sim/clock'
import { netIncome, revenue, walkOuts } from '../sim/deal'
import { carName } from '../sim/interactables'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/**
 * End of the day: shown once the doors are closed and the last customer has
 * left. Starting the next day resets the clock and the day's arrivals.
 */
export function DaySummary() {
  const open = useGame((s) => isClosed(s.clock) && s.customers.length === 0)
  const day = useGame((s) => s.clock.day)
  const stats = useGame((s) => s.dayStats)
  const cash = useGame((s) => s.cash)
  if (!open) return null

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary" role="dialog" aria-label={`Day ${day} summary`}>
        <div className="info-kicker">End of day</div>
        <h2>Day {day} summary</h2>
        <dl className="summary-stats">
          <dt>Visitors</dt>
          <dd>{stats.visitors}</dd>
          <dt>Cars sold</dt>
          <dd>{stats.sales.length}</dd>
          <dt>Revenue</dt>
          <dd className="price">{formatMoney(revenue(stats))}</dd>
          <dt>Wages</dt>
          <dd className="price">{formatMoney(-stats.wages || 0)}</dd>
          <dt>Commissions</dt>
          <dd className="price">{formatMoney(-stats.commissions || 0)}</dd>
          <dt>Net</dt>
          <dd className="price">{formatMoney(netIncome(stats))}</dd>
          <dt>Walk-outs</dt>
          <dd>
            {walkOuts(stats)}
            {walkOuts(stats) > 0 && (
              <span className="muted">
                {' '}
                ({stats.refused} refused, {stats.impatient} impatient, {stats.closing} at closing)
              </span>
            )}
          </dd>
          <dt>Cash</dt>
          <dd className="price topbar-cash">{formatMoney(cash)}</dd>
        </dl>
        {stats.sales.length > 0 && (
          <ul className="summary-sales">
            {stats.sales.map((s, i) => (
              <li key={i}>
                <span className="muted">{formatTime(s.minute)}</span> {carName(s.model)} to{' '}
                {s.customerName} <span className="price">{formatMoney(s.price)}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn btn-primary"
          autoFocus
          onClick={() => useGame.getState().startNextDay()}
        >
          Start day {day + 1}
        </button>
      </div>
    </div>
  )
}
