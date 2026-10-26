import { lazy, Suspense } from 'react'
import { calendarOf, longDate } from '../sim/calendar'
import { buyerScore, costliestReason, type ClientStats } from '../sim/clients'
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
  salesByFinance,
  salesBySeller,
  salesBySource,
  walkOuts,
  type DayStats,
} from '../sim/deal'
import { heldByCsi, TIERS, tierName } from '../sim/franchise'
import { CSI_FLOOR, CSI_TIER_MIN, csiFactor, csiOf } from '../sim/csi'
import { payLine, soldLine } from '../sim/fi'
import { carName } from '../sim/interactables'
import { sourceLabel } from '../sim/marketing'
import { nazmaSummary } from '../sim/nazma'
import { ROLE_LABELS } from '../sim/staff'
import { goalLabel } from '../sim/owner'
import { rankById, rankProgress } from '../sim/progression'
import { daysLeft, quotaLine } from '../sim/quota'
import { reputationLabel } from '../sim/reputation'
import { boughtSpend } from '../sim/sellers'
import { auctionSpend, surpriseNotice } from '../sim/auction'
import type { WholesaleStats } from '../sim/wholesale'
import { levelTuning, useGame } from '../state/store'
import { SatisfactionChip } from './ClientsTab'
import { formatMoney } from './format'
import { rankLine } from './rankText'
import { newRecordLine } from './statsText'
import { achievementOf } from '../sim/achievements'
import { PERF, PERF_BUSY } from '../state/perf'
import { courseLine, eotmLine } from '../sim/growth'

/** The `?perf` readings for the day, loaded only with the flag. */
const PerfReport = lazy(() => import('./PerfReport'))

/**
 * End of the day: shown once the doors are closed and the last customer has
 * left. Starting the next day resets the clock and the day's arrivals.
 */
/** "1 late, 2 turned away, 1 declined, 1 came back": service clients who left unhappy. */
/**
 * Focuses the Start button for Enter without scrolling to it (as `autoFocus`
 * would), so a long summary opens at its top.
 */
function focusOnce(button: HTMLButtonElement | null): void {
  button?.focus({ preventScroll: true })
}

function serviceLetDown(stats: DayStats): string {
  const { late, turnedAway, declined, comebacks } = stats.service
  return [
    late > 0 && `${late} late`,
    turnedAway > 0 && `${turnedAway} turned away`,
    declined > 0 && `${declined} declined`,
    comebacks > 0 && `${comebacks} came back`,
  ]
    .filter(Boolean)
    .join(', ')
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The client book today: who went in it, the buyers' average score and what cost the most. */
function ClientsBlock({ stats }: { stats: ClientStats }) {
  if (stats.scores.length === 0) return null
  const score = buyerScore(stats.scores)
  const worst = costliestReason(stats.scores)
  return (
    <>
      <dt>Clients</dt>
      <dd>
        {count(stats.added, 'new client')}, {count(stats.prospects, 'new prospect')}
        {stats.returned > 0 && `, ${count(stats.returned, 'returning buyer')}`}
        {stats.referrals > 0 && `, ${count(stats.referrals, 'friend')} of clients bought`}
      </dd>
      {score !== null && (
        <>
          <dt className="summary-sub">· buyers&apos; score</dt>
          <dd className="summary-sub">
            <SatisfactionChip score={score} />
          </dd>
        </>
      )}
      {worst && (
        <>
          <dt className="summary-sub">· cost the most</dt>
          <dd className="summary-sub">{worst}</dd>
        </>
      )}
    </>
  )
}

/** The end-of-day summary: selects nothing else until the day is over. */
export function DaySummary() {
  const open = useGame(dayOver)
  return open ? <SummaryPanel /> : null
}

function SummaryPanel() {
  const day = useGame((s) => s.clock.day)
  const stats = useGame((s) => s.dayStats)
  const records = useGame((s) => s.records)
  const achievements = useGame((s) => s.achievements)
  const cash = useGame((s) => s.cash)
  const arriving = useGame((s) => s.orders.length)
  const reputation = useGame((s) => s.reputation)
  const weather = useGame((s) => s.weather)
  const monthSold = useGame((s) => s.monthSales.count)
  const quota = useGame((s) => s.quota)
  const monthCsi = useGame((s) => csiOf(s.monthCsi))
  const difficulty = useGame((s) => s.difficulty)
  const dealershipName = useGame((s) => s.dealershipName)
  const career = useGame((s) => s.career)
  const franchise = useGame((s) => s.franchise)
  const rankScale = useGame((s) => levelTuning(s).rankScale)
  const progress = rankProgress(career, reputation, rankScale)
  const event = eventOn(day)
  const missed = missedSummary(stats.missed)
  const nazma = nazmaSummary(stats.nazma, formatMoney)
  const sources = salesBySource(stats)
  // Worth a table once anyone came from an ad or a referral (walk-ins alone are in the visitor line).
  const advertised = sources.some((t) => t.source !== 'regular' && t.source !== 'walk-in')
  const traded = stats.sales.some((s) => s.trade)
  const split = grossSplit(stats)

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary" role="dialog" aria-label={`${longDate(day)} summary`}>
        <div className="info-kicker">
          {dealershipName} · End of day {day} · {WEATHER_ICONS[weather]} {WEATHER_LABELS[weather]}
          {event && ` · ${event.label} sale`} · {difficultyLabel(difficulty)}
        </div>
        <h2>{longDate(day)}</h2>
        {PERF && (
          <Suspense fallback={null}>
            <PerfReport />
          </Suspense>
        )}
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
          {(stats.sales.length > 0 || stats.fi.declined > 0 || stats.fi.chargebackCount > 0) && (
            <>
              <dt>
                F&amp;I ({stats.fi.menus} menu{stats.fi.menus === 1 ? '' : 's'})
              </dt>
              <dd className="price">{formatMoney(split.fi)}</dd>
              <dt className="summary-sub">· buyers</dt>
              <dd className="summary-sub">{payLine(stats.fi)}</dd>
              {stats.fi.reserve > 0 && (
                <>
                  <dt className="summary-sub">· lenders' reserve</dt>
                  <dd className="price summary-sub">{formatMoney(stats.fi.reserve)}</dd>
                </>
              )}
              {stats.fi.fees > 0 && (
                <>
                  <dt className="summary-sub">· lenders' fees</dt>
                  <dd className="price summary-sub">{formatMoney(-stats.fi.fees)}</dd>
                </>
              )}
              {stats.fi.productGross > 0 && (
                <>
                  <dt className="summary-sub">· products sold</dt>
                  <dd className="summary-sub">{soldLine(stats.fi)}</dd>
                  <dt className="summary-sub">· product gross</dt>
                  <dd className="price summary-sub">{formatMoney(stats.fi.productGross)}</dd>
                </>
              )}
              {stats.fi.chargebackCount > 0 && (
                <>
                  <dt className="summary-sub">
                    · {stats.fi.chargebackCount} chargeback
                    {stats.fi.chargebackCount === 1 ? '' : 's'}
                    {stats.fi.clawback > 0 &&
                      `, ${formatMoney(stats.fi.clawback)} back from finance`}
                  </dt>
                  <dd className="price summary-sub">{formatMoney(-stats.fi.chargebacks)}</dd>
                </>
              )}
            </>
          )}
          {stats.service.jobs > 0 && (
            <>
              <dt>
                Service ({stats.service.jobs} job{stats.service.jobs === 1 ? '' : 's'})
              </dt>
              <dd className="price">
                {formatMoney(
                  stats.service.labor +
                    stats.service.parts -
                    stats.service.partsCost +
                    stats.service.warranty +
                    stats.service.contract,
                )}
              </dd>
            </>
          )}
          {stats.service.recalls > 0 && (
            <>
              <dt className="summary-sub">
                · {stats.service.recalls} recall job{stats.service.recalls === 1 ? '' : 's'}, paid
                by the manufacturer
              </dt>
              <dd className="price summary-sub">{formatMoney(stats.service.warranty)}</dd>
            </>
          )}
          {stats.service.claims > 0 && (
            <>
              <dt className="summary-sub">
                · {stats.service.claims} warranty claim{stats.service.claims === 1 ? '' : 's'}, paid
                by our warranty company
              </dt>
              <dd className="price summary-sub">{formatMoney(stats.service.contract)}</dd>
            </>
          )}
          {stats.service.offered > 0 && (
            <>
              <dt className="summary-sub">· extra work sold</dt>
              <dd className="summary-sub">
                {stats.service.upsold} of {stats.service.offered} offered
              </dd>
            </>
          )}
          {stats.service.late +
            stats.service.turnedAway +
            stats.service.declined +
            stats.service.comebacks >
            0 && (
            <>
              <dt className="summary-sub">· clients let down</dt>
              <dd className="summary-sub">{serviceLetDown(stats)}</dd>
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
          {stats.training > 0 && (
            <>
              <dt>Training</dt>
              <dd className="price">{formatMoney(-stats.training)}</dd>
            </>
          )}
          {stats.staffBonus > 0 && (
            <>
              <dt>Employee of the Month</dt>
              <dd className="price">{formatMoney(-stats.staffBonus)}</dd>
            </>
          )}
          {stats.clients.referralFees > 0 && (
            <>
              <dt>Referral fees</dt>
              <dd className="price">{formatMoney(-stats.clients.referralFees)}</dd>
            </>
          )}
          {stats.clients.appreciation > 0 && (
            <>
              <dt>Appreciation day</dt>
              <dd className="price">{formatMoney(-stats.clients.appreciation)}</dd>
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
          {(stats.auction.bought.length > 0 || stats.auction.inspections > 0) && (
            <>
              <dt>Auction</dt>
              <dd>
                {stats.auction.bought.length > 0 && (
                  <>
                    {stats.auction.bought.length} car
                    {stats.auction.bought.length === 1 ? '' : 's'} won (
                    <span className="price">{formatMoney(auctionSpend(stats.auction))}</span> with
                    fees)
                    <span className="muted"> stock, not an expense</span>
                    <ul className="summary-bought">
                      {stats.auction.bought.map((b, i) => (
                        <li key={i}>
                          {b.year} {carName(b.model)} for {formatMoney(b.price)}{' '}
                          {b.stolen && <span className="stock-badge">Bought back</span>}{' '}
                          <span className="muted">
                            (+{formatMoney(b.fee)} fee, graded {b.graded}, worth{' '}
                            {formatMoney(b.value)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {stats.auction.surprises.length > 0 && (
                  <div className="muted">{surpriseNotice(stats.auction.surprises)}</div>
                )}
                {stats.auction.inspections > 0 && (
                  <div>
                    Inspections{' '}
                    <span className="price margin-loss">
                      −{formatMoney(stats.auction.inspections)}
                    </span>
                  </div>
                )}
              </dd>
            </>
          )}
          <WholesaleLine wholesale={stats.wholesale} gross={split.wholesale} />
          {stats.drives.taken > 0 && (
            <>
              <dt>Test drives</dt>
              <dd>
                {stats.drives.taken} ({stats.drives.bought} bought
                {stats.drives.byStaff > 0 && `, ${stats.drives.byStaff} by salespeople`}
                {stats.drives.cut > 0 && `, ${stats.drives.cut} cut short`}
                {stats.drives.dings > 0 && `, ${stats.drives.dings} dinged`})
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
          <ClientsBlock stats={stats.clients} />
          {nazma && (
            <>
              <dt>Nazma</dt>
              <dd>{nazma}</dd>
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
          <dt title="The manufacturer's survey of the month's new-car buyers">CSI</dt>
          <dd>
            {stats.quota ? (
              stats.quota.csi === null ? (
                <span className="muted">No new-car buyers this month</span>
              ) : (
                <>
                  {stats.quota.csi}{' '}
                  <span className="muted">
                    (holdback ×{csiFactor(stats.quota.csi).toFixed(2)}
                    {stats.quota.csi < CSI_FLOOR && `, under ${CSI_FLOOR}`})
                  </span>
                </>
              )
            ) : monthCsi === null ? (
              <span className="muted">No new-car buyers yet this month</span>
            ) : (
              <>
                {monthCsi} <span className="muted">so far this month</span>
              </>
            )}
          </dd>
          <dt>Franchise</dt>
          <dd>
            {tierName(franchise)}
            {stats.quota && heldByCsi(stats.quota) && (
              <span className="muted">
                {' '}
                (quota met, but a CSI under {CSI_TIER_MIN} kept you from moving up)
              </span>
            )}
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
        {(stats.levelUps.length > 0 ||
          stats.eotm ||
          stats.courses.length > 0 ||
          stats.raisesLapsed.length > 0 ||
          stats.moraleQuits.length > 0) && (
          <div className="summary-level-ups">
            {stats.eotm && <div>🏆 {eotmLine(stats.eotm)}</div>}
            {stats.levelUps.map((u) => (
              <div key={u.id}>
                ★ {u.name} grew to skill {u.skill} as {ROLE_LABELS[u.role].toLowerCase()}
                {u.ask !== null && <> and asks for {formatMoney(u.ask)}/day</>}.
              </div>
            ))}
            {stats.courses.map((c) => (
              <div key={c.id}>📚 {courseLine(c)}</div>
            ))}
            {stats.raisesLapsed.length > 0 && (
              <div className="muted">
                {stats.raisesLapsed.join(' and ')} gave up waiting on a raise.
              </div>
            )}
            {stats.moraleQuits.length > 0 && (
              <div className="muted">{stats.moraleQuits.join(' and ')} quit over low morale.</div>
            )}
          </div>
        )}
        {stats.newRecords.length > 0 && (
          <div className="summary-records">
            {stats.newRecords.map((key) => (
              <div key={key}>🏆 {newRecordLine(key, records)}</div>
            ))}
          </div>
        )}
        {achievements.some((a) => a.day === day) && (
          <div className="summary-achievements">
            {achievements
              .filter((a) => a.day === day)
              .map(({ id }) => {
                const a = achievementOf(id)
                return (
                  <div key={id}>
                    🏆 <b>{a.title}</b>: {a.text}
                  </div>
                )
              })}
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
        {stats.sales.some((s) => s.soldBy !== null || s.signedBy !== null) && (
          <table className="summary-sellers">
            <thead>
              <tr>
                <th>Seller</th>
                <th>Cars</th>
                <th>Revenue</th>
                <th>Off MSRP</th>
                <th>Gross</th>
                <th title="Loans and products, at the seller's own desk">F&amp;I</th>
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
                  <td className="price">{formatMoney(t.fi)}</td>
                  <td className="price">{formatMoney(t.commission)}</td>
                  {traded && (
                    <td className={t.tradeOver > 0 ? 'price margin-loss' : 'price'}>
                      {t.trades > 0 ? formatMoney(t.tradeOver) : '—'}
                    </td>
                  )}
                </tr>
              ))}
              {salesByFinance(stats).map((t) => (
                <tr key={`finance-${t.name}`}>
                  <td title="Finance manager: the deals they signed">{t.name} (F&amp;I)</td>
                  <td>{t.deals}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td className="price">{formatMoney(t.fi)}</td>
                  <td className="price">{formatMoney(t.commission)}</td>
                  {traded && <td>—</td>}
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
        <p className="muted summary-saved">
          {PERF_BUSY ? 'Not saved: a ?perf=busy game never is.' : 'Progress saved.'}
        </p>
        <button
          className="btn btn-primary"
          ref={focusOnce}
          onClick={() => useGame.getState().startNextDay()}
        >
          Start day {day + 1}
        </button>
      </div>
    </div>
  )
}

/** Our cars run at the auction today: what sold (price, fee, gross) and what's coming back. */
function WholesaleLine({ wholesale, gross }: { wholesale: WholesaleStats; gross: number }) {
  const { sold, returned } = wholesale
  if (sold.length === 0 && returned.length === 0) return null
  return (
    <>
      <dt>Wholesale</dt>
      <dd>
        {sold.length} sold, gross{' '}
        <span className={gross < 0 ? 'price margin-loss' : 'price'}>{formatMoney(gross)}</span>
        <ul className="summary-bought">
          {sold.map((w, i) => (
            <li key={i}>
              {w.year} {carName(w.model)} to {w.buyer} for {formatMoney(w.price)}{' '}
              <span className="muted">
                (−{formatMoney(w.fee)} fee, cost {formatMoney(w.cost)})
              </span>
            </li>
          ))}
          {returned.map((r, i) => (
            <li key={`back-${i}`}>
              {r.year} {carName(r.model)} back on the lot tomorrow{' '}
              <span className="muted">
                (
                {r.fee === 0
                  ? 'the run closed before it came up'
                  : r.high > 0 && r.high < r.floor
                    ? `stopped at ${formatMoney(r.high)}, under the ${formatMoney(r.floor)} floor; −${formatMoney(r.fee)} run fee`
                    : `no bids; −${formatMoney(r.fee)} run fee`}
                )
              </span>
            </li>
          ))}
        </ul>
      </dd>
    </>
  )
}
