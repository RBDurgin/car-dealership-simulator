import { calendarOf, longDate } from '../sim/calendar'
import { WEATHER_ICONS, WEATHER_LABELS } from '../sim/weather'
import { dayOver, formatTime } from '../sim/clock'
import {
  averageDiscount,
  costOfSales,
  grossProfit,
  missedSummary,
  netIncome,
  theftLoss,
  revenue,
  salesBySeller,
  salesBySource,
  walkOuts,
} from '../sim/deal'
import { carName } from '../sim/interactables'
import { sourceLabel } from '../sim/marketing'
import { nazmaSummary } from '../sim/nazma'
import { goalLabel } from '../sim/owner'
import { daysLeft, quotaLine } from '../sim/quota'
import { reputationLabel } from '../sim/reputation'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/**
 * End of the day: shown once the doors are closed and the last customer has
 * left. Starting the next day resets the clock and the day's arrivals.
 */
export function DaySummary() {
  const open = useGame(dayOver)
  const day = useGame((s) => s.clock.day)
  const stats = useGame((s) => s.dayStats)
  const cash = useGame((s) => s.cash)
  const arriving = useGame((s) => s.orders.length)
  const reputation = useGame((s) => s.reputation)
  const weather = useGame((s) => s.weather)
  const monthSold = useGame((s) => s.monthSales.count)
  const quota = useGame((s) => s.quota)
  if (!open) return null
  const missed = missedSummary(stats.missed)
  const nazma = nazmaSummary(stats.nazma, formatMoney)
  const sources = salesBySource(stats)
  // Worth a table once anyone came from an ad or a referral (walk-ins alone are in the visitor line).
  const advertised = sources.some((t) => t.source !== 'regular' && t.source !== 'walk-in')

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary" role="dialog" aria-label={`${longDate(day)} summary`}>
        <div className="info-kicker">
          End of day {day} · {WEATHER_ICONS[weather]} {WEATHER_LABELS[weather]}
        </div>
        <h2>{longDate(day)}</h2>
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
          {stats.interest > 0 && (
            <>
              <dt>Floor plan interest</dt>
              <dd className="price">{formatMoney(-stats.interest)}</dd>
            </>
          )}
          {stats.marketing > 0 && (
            <>
              <dt>Marketing</dt>
              <dd className="price">{formatMoney(-stats.marketing)}</dd>
            </>
          )}
          {stats.improvements > 0 && (
            <>
              <dt>Improvements</dt>
              <dd className="price">{formatMoney(-stats.improvements)}</dd>
            </>
          )}
          {theftLoss(stats) > 0 && (
            <>
              <dt>Stolen stock</dt>
              <dd className="price">{formatMoney(-theftLoss(stats))}</dd>
            </>
          )}
          {!!stats.quota?.payout && (
            <>
              <dt>Holdback</dt>
              <dd className="price">{formatMoney(stats.quota.payout)}</dd>
            </>
          )}
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
          {nazma && (
            <>
              <dt>Nazma</dt>
              <dd>{nazma}</dd>
            </>
          )}
          {missed && (
            <>
              <dt>Missed</dt>
              <dd>
                {missed} <span className="muted">(wanted, not in stock)</span>
              </dd>
            </>
          )}
          {arriving > 0 && (
            <>
              <dt>Arriving tomorrow</dt>
              <dd>
                {arriving} car{arriving === 1 ? '' : 's'}
              </dd>
            </>
          )}
          <dt>Quota</dt>
          <dd>
            {stats.quota ? (
              <>
                {stats.quota.sold} of {stats.quota.quota} this month{' '}
                <span className="muted">
                  ({stats.quota.payout > 0 ? 'holdback paid' : 'no holdback'})
                </span>
              </>
            ) : (
              quotaLine(monthSold, quota, daysLeft(calendarOf(day).dayOfMonth))
            )}
          </dd>
          <dt>Reputation</dt>
          <dd>
            {reputation} <span className="muted">({reputationLabel(reputation)})</span>{' '}
            <span
              className={
                stats.reputation > 0
                  ? 'rep-change-up'
                  : stats.reputation < 0
                    ? 'rep-change-down'
                    : 'muted'
              }
            >
              {stats.reputation > 0
                ? `▲ ${stats.reputation}`
                : stats.reputation < 0
                  ? `▼ ${-stats.reputation}`
                  : 'no change'}
            </span>
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
        {advertised && (
          <table className="summary-sellers">
            <thead>
              <tr>
                <th>Came from</th>
                <th>Visitors</th>
                <th>Cars</th>
                <th>Gross</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((t) => (
                <tr key={t.source}>
                  <td>{sourceLabel(t.source)}</td>
                  <td>{t.visitors}</td>
                  <td>{t.cars}</td>
                  <td className="price">{formatMoney(t.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {stats.sales.some((s) => s.soldBy !== null) && (
          <table className="summary-sellers">
            <thead>
              <tr>
                <th>Seller</th>
                <th>Cars</th>
                <th>Revenue</th>
                <th>Off MSRP</th>
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
                  <td>{(averageDiscount(t) * 100).toFixed(1)}%</td>
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
