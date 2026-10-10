import { calendarOf, longDate } from '../sim/calendar'
import { difficultyLabel } from '../sim/difficulty'
import { eventOn } from '../sim/events'
import { WEATHER_ICONS, WEATHER_LABELS } from '../sim/weather'
import { dayOver, formatTime } from '../sim/clock'
import {
  averageDiscount,
  costOfSales,
  grossProfit,
  grossSplit,
  missedSummary,
  netIncome,
  theftLoss,
  revenue,
  salesBySeller,
  salesBySource,
  walkOuts,
} from '../sim/deal'
import { TIERS, tierName } from '../sim/franchise'
import { carName } from '../sim/interactables'
import { sourceLabel } from '../sim/marketing'
import { jaguarSummary } from '../sim/jaguar'
import { goalLabel } from '../sim/owner'
import { rankById, rankProgress } from '../sim/progression'
import { daysLeft, quotaLine } from '../sim/quota'
import { reputationLabel } from '../sim/reputation'
import { boughtSpend } from '../sim/sellers'
import { levelTuning, useGame } from '../state/store'
import { formatMoney } from './format'
import { rankLine } from './rankText'

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
  const difficulty = useGame((s) => s.difficulty)
  const career = useGame((s) => s.career)
  const franchise = useGame((s) => s.franchise)
  const rankScale = useGame((s) => levelTuning(s).rankScale)
  if (!open) return null
  const progress = rankProgress(career, reputation, rankScale)
  const event = eventOn(day)
  const missed = missedSummary(stats.missed)
  const jaguar = jaguarSummary(stats.jaguar, formatMoney)
  const sources = salesBySource(stats)
  // Worth a table once anyone came from an ad or a referral (walk-ins alone are in the visitor line).
  const advertised = sources.some((t) => t.source !== 'regular' && t.source !== 'walk-in')
  const traded = stats.sales.some((s) => s.trade)
  const split = grossSplit(stats)

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary" role="dialog" aria-label={`${longDate(day)} summary`}>
        <div className="info-kicker">
          End of day {day} · {WEATHER_ICONS[weather]} {WEATHER_LABELS[weather]}
          {event && ` · ${event.label} sale`} · {difficultyLabel(difficulty)}
        </div>
        <h2>{longDate(day)}</h2>
        <dl className="summary-stats">
          <dt>Visitors</dt>
          <dd>
            {stats.visitors}
            {event && <span className="muted"> on the {event.label} sale</span>}
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
          {stats.sales.some((s) => s.used) && (
            <>
              <dt className="summary-sub">· on new cars</dt>
              <dd className="price summary-sub">{formatMoney(split.new)}</dd>
              <dt className="summary-sub">· on used cars</dt>
              <dd className="price summary-sub">{formatMoney(split.used)}</dd>
            </>
          )}
          {stats.service.overtime > 0 && (
            <>
              <dt>Garage overtime</dt>
              <dd className="price">{formatMoney(-stats.service.overtime)}</dd>
            </>
          )}
          {stats.service.recon > 0 && (
            <>
              <dt>Reconditioned</dt>
              <dd>
                {stats.service.recon} used car{stats.service.recon === 1 ? '' : 's'}
              </dd>
            </>
          )}
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
          {stats.expansions > 0 && (
            <>
              <dt>Expansion</dt>
              <dd className="price">{formatMoney(-stats.expansions)}</dd>
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
          {stats.bought.length > 0 && (
            <>
              <dt>Bought</dt>
              <dd>
                {stats.bought.length} used car{stats.bought.length === 1 ? '' : 's'} (
                <span className="price">{formatMoney(boughtSpend(stats.bought))}</span>)
                <span className="muted"> stock, not an expense</span>
                <ul className="summary-bought">
                  {stats.bought.map((b, i) => (
                    <li key={i}>
                      {b.year} {carName(b.model)}{' '}
                      {b.trade
                        ? `taken in trade from ${b.sellerName} at ${formatMoney(b.price)}`
                        : `from ${b.sellerName} for ${formatMoney(b.price)}`}{' '}
                      <span className="muted">(worth {formatMoney(b.value)})</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
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
          {jaguar && (
            <>
              <dt>Jaguar</dt>
              <dd>{jaguar}</dd>
            </>
          )}
          {(missed || stats.missedUsed > 0) && (
            <>
              <dt>Missed</dt>
              <dd>
                {missed && (
                  <>
                    {missed} <span className="muted">(wanted, not in stock)</span>
                  </>
                )}
                {missed && stats.missedUsed > 0 && ' · '}
                {stats.missedUsed > 0 && (
                  <>
                    {stats.missedUsed} wanted a used car{' '}
                    <span className="muted">(none in stock)</span>
                  </>
                )}
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
          <dt>Franchise</dt>
          <dd>
            {tierName(franchise)}
            {stats.quota && stats.quota.tier.from !== stats.quota.tier.to && (
              <span className="muted">
                {' '}
                (
                {TIERS.indexOf(stats.quota.tier.to) > TIERS.indexOf(stats.quota.tier.from)
                  ? 'up'
                  : 'down'}{' '}
                from {tierName(stats.quota.tier.from)})
              </span>
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
          <dt>Rank</dt>
          <dd>
            {progress.rank.name} <span className="muted">({rankLine(progress, career.gross)})</span>
          </dd>
          <dt>Cash</dt>
          <dd className="price topbar-cash">{formatMoney(cash)}</dd>
        </dl>
        {stats.rankUp && (
          <div className="summary-rank-up">
            ★ Your dealership is now a <b>{rankById(stats.rankUp).name}</b>.
          </div>
        )}
        {stats.bailout > 0 && (
          <div className="summary-bailout">
            The bank covered your {formatMoney(stats.bailout)} shortfall. It won&apos;t next time.
          </div>
        )}
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
                {traded && (
                  <th title="Trade allowances over (or under) the cars' value">Trades ±</th>
                )}
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
                  {traded && (
                    <td className={t.tradeOver > 0 ? 'price margin-loss' : 'price'}>
                      {t.trades > 0 ? formatMoney(t.tradeOver) : '—'}
                    </td>
                  )}
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
                {s.trade && (
                  <span className="muted">
                    {' '}
                    · {carName(s.trade.model)} in trade at {formatMoney(s.trade.allowance)}
                  </span>
                )}
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
