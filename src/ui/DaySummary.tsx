import { formatTime, isClosed } from '../sim/clock'
import { costOfSales, grossProfit, netIncome, revenue, salesBySeller, walkOuts } from '../sim/deal'
import { carName } from '../sim/interactables'
import { goalLabel } from '../sim/owner'
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
          <dd>
            {stats.visitors}
            {stats.walkIns > 0 && (
              <span className="muted"> ({stats.walkIns} walked in off the street)</span>
            )}
          </dd>
          <dt>Cars sold</dt>
          <dd>{stats.sales.length}</dd>
          <dt>Revenue</dt>
          <dd className="price">{formatMoney(revenue(stats))}</dd>
          <dt>Cost of cars sold</dt>
          <dd className="price">{formatMoney(-costOfSales(stats) || 0)}</dd>
          <dt>Gross profit</dt>
          <dd className="price">{formatMoney(grossProfit(stats))}</dd>
          <dt>Wages</dt>
          <dd className="price">{formatMoney(-stats.wages || 0)}</dd>
          <dt>Commissions</dt>
          <dd className="price">{formatMoney(-stats.commissions || 0)}</dd>
          {!!stats.owner?.bonus && (
            <>
              <dt>Owner&apos;s bonus</dt>
              <dd className="price">{formatMoney(stats.owner.bonus)}</dd>
            </>
          )}
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
        {stats.owner && (
          <div className={stats.owner.met ? 'summary-owner goal-met' : 'summary-owner'}>
            <div>
              Owner&apos;s goal: <b>{goalLabel(stats.owner.goal, formatMoney)}</b>{' '}
              {stats.owner.met ? '— met!' : '— missed.'}
            </div>
            <div className="summary-owner-line">“{stats.owner.line}”</div>
          </div>
        )}
        {stats.sales.some((s) => s.soldBy !== null) && (
          <table className="summary-sellers">
            <thead>
              <tr>
                <th>Seller</th>
                <th>Cars</th>
                <th>Revenue</th>
                <th>Gross</th>
                <th>Commission</th>
              </tr>
            </thead>
            <tbody>
              {salesBySeller(stats).map((t) => (
                <tr key={t.seller ?? 'you'}>
                  <td>{t.seller ?? 'You'}</td>
                  <td>{t.cars}</td>
                  <td className="price">{formatMoney(t.revenue)}</td>
                  <td className="price">{formatMoney(t.gross)}</td>
                  <td className="price">{formatMoney(t.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {stats.sales.length > 0 && (
          <ul className="summary-sales">
            {stats.sales.map((s, i) => (
              <li key={i}>
                <span className="muted">{formatTime(s.minute)}</span> {carName(s.model)} to{' '}
                {s.customerName} <span className="price">{formatMoney(s.price)}</span>
                {s.soldBy && <span className="muted"> · sold by {s.soldBy}</span>}
                {s.signedBy && <span className="muted"> · signed by {s.signedBy}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="muted summary-saved">Progress saved.</p>
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
