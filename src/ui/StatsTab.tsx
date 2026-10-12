import { useMemo, useState } from 'react'
import { ACHIEVEMENTS, type AchievementId } from '../sim/achievements'
import { longDate } from '../sim/calendar'
import { CAR_MODELS, PLAYER_ID } from '../sim/customers'
import { carName } from '../sim/interactables'
import { sourceLabel, type Source } from '../sim/marketing'
import {
  closeRate,
  FORMER_STAFF,
  grossPerSale,
  isLevel,
  METRICS,
  RECENT_DAYS,
  RECORD_KEYS,
  sellerRows,
  series,
  type ChartRange,
  type Metric,
} from '../sim/stats'
import { useGame } from '../state/store'
import { AchievementList, type EarnedView } from './AchievementList'
import { Chart } from './Chart'
import { formatMoney } from './format'
import { metricAxis, METRIC_LABELS, metricValue, RECORD_LABELS, recordValue } from './statsText'

const RANGES: [ChartRange, string][] = [
  ['recent', `Last ${RECENT_DAYS} days`],
  ['all', 'Whole game'],
]

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1)

const percent = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

/** A two-column table of lifetime counts, most first. */
function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  if (rows.length === 0) return null
  return (
    <table className="summary-sellers stats-breakdown">
      <thead>
        <tr>
          <th>{title}</th>
          <th>Sold</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, n]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type View = 'stats' | 'achievements'

const VIEWS: [View, string][] = [
  ['stats', 'Stats'],
  ['achievements', 'Achievements'],
]

/** This game's achievements: "18 of 49", then the grouped list. */
function AchievementsView() {
  const achievements = useGame((s) => s.achievements)
  const byId = useMemo(
    () =>
      new Map<AchievementId, EarnedView>(
        achievements.map((a) => [a.id, { level: a.level, when: longDate(a.day) }]),
      ),
    [achievements],
  )
  return (
    <>
      <p className="achievement-count">
        <b>{byId.size}</b> of {ACHIEVEMENTS.length} earned
      </p>
      <AchievementList earned={(id) => byId.get(id) ?? null} />
    </>
  )
}

/**
 * The dealership's history, with a toggle between the numbers (lifetime
 * totals, personal records, a chart of the day log, and lifetime sales by
 * model, source and seller) and this game's achievements.
 */
export function StatsTab() {
  const [view, setView] = useState<View>('stats')
  return (
    <>
      <h2>Stats</h2>
      <div className="panel-tabs stats-pickers" role="group" aria-label="Stats or achievements">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            className={view === v ? 'btn btn-small btn-primary' : 'btn btn-small'}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'stats' ? <StatsView /> : <AchievementsView />}
    </>
  )
}

function StatsView() {
  const log = useGame((s) => s.log)
  const lifetime = useGame((s) => s.lifetime)
  const records = useGame((s) => s.records)
  const statsFrom = useGame((s) => s.statsFrom)
  const roster = useGame((s) => s.roster)
  const [metric, setMetric] = useState<Metric>('gross')
  const [range, setRange] = useState<ChartRange>('recent')
  const points = useMemo(() => series(log, metric, range), [log, metric, range])

  const names = new Map(roster.map((e) => [e.id, e.name]))
  const sellers = sellerRows(
    lifetime.bySeller,
    roster.filter((e) => !e.fired).map((e) => e.id),
  )
  const byModel: [string, number][] = CAR_MODELS.filter((m) => lifetime.byModel[m])
    .map((m): [string, number] => [carName(m), lifetime.byModel[m] ?? 0])
    .sort((a, b) => b[1] - a[1])
  const bySource = (Object.entries(lifetime.bySource) as [Source, number][])
    .filter(([, n]) => n > 0)
    .map(([s, n]): [string, number] => [sourceLabel(s), n])
    .sort((a, b) => b[1] - a[1])
  const average = grossPerSale(lifetime.gross, lifetime.sales)

  return (
    <>
      {statsFrom > 1 && <p className="muted stats-since">Since day {statsFrom}.</p>}
      <dl className="stock-summary">
        <dt>Cars sold</dt>
        <dd>
          {lifetime.sales}{' '}
          <span className="muted">
            ({lifetime.sales - lifetime.usedSales} new, {lifetime.usedSales} used)
          </span>
        </dd>
        <dt>Gross</dt>
        <dd className="price">{formatMoney(lifetime.gross)}</dd>
        <dt>Net</dt>
        <dd className={lifetime.net < 0 ? 'price stats-negative' : 'price'}>
          {formatMoney(lifetime.net)}
        </dd>
        <dt>Visitors</dt>
        <dd>{lifetime.visitors}</dd>
        <dt title="Cars sold for every visitor">Close rate</dt>
        <dd>{percent(closeRate(lifetime.sales, lifetime.visitors))}</dd>
        <dt>Gross per sale</dt>
        <dd className="price">{average === null ? '—' : formatMoney(average)}</dd>
      </dl>

      <h3>Records</h3>
      <dl className="stock-summary">
        {RECORD_KEYS.map((key) => {
          const value = recordValue(key, records)
          const best = records[key]
          return [
            <dt key={`${key}-t`}>{capitalise(RECORD_LABELS[key])}</dt>,
            <dd key={`${key}-d`}>
              {value && best ? (
                <>
                  {value}
                  <div className="muted stats-when">{longDate(best.day)}</div>
                </>
              ) : (
                <span className="muted">Not yet</span>
              )}
            </dd>,
          ]
        })}
        <dt>Current streak</dt>
        <dd>
          {records.streak} day{records.streak === 1 ? '' : 's'}
        </dd>
      </dl>

      <h3>Chart</h3>
      <div className="panel-tabs stats-pickers" role="group" aria-label="What to chart">
        {METRICS.map((m) => (
          <button
            key={m}
            className={metric === m ? 'btn btn-small btn-primary' : 'btn btn-small'}
            aria-pressed={metric === m}
            onClick={() => setMetric(m)}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>
      <div className="panel-tabs stats-pickers" role="group" aria-label="Over how long">
        {RANGES.map(([r, label]) => (
          <button
            key={r}
            className={range === r ? 'btn btn-small btn-primary' : 'btn btn-small'}
            aria-pressed={range === r}
            onClick={() => setRange(r)}
          >
            {label}
          </button>
        ))}
      </div>
      {points.length === 0 ? (
        <p className="muted">Close your first day to start the chart.</p>
      ) : (
        <Chart
          key={`${metric}-${range}`}
          points={points}
          kind={isLevel(metric) ? 'line' : 'bar'}
          format={(v) => metricValue(metric, v)}
          axisFormat={(v) => metricAxis(metric, v)}
          label={`${METRIC_LABELS[metric]}, ${RANGES.find(([r]) => r === range)?.[1]}`}
        />
      )}

      {lifetime.sales > 0 && <h3>Sales</h3>}
      <Breakdown title="Model" rows={byModel} />
      <Breakdown title="Came from" rows={bySource} />
      {sellers.length > 0 && (
        <table className="summary-sellers stats-breakdown">
          <thead>
            <tr>
              <th>Sold by</th>
              <th>Sold</th>
              <th>Gross</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((r) => (
              <tr key={r.key}>
                <td>
                  {r.key === PLAYER_ID
                    ? 'You'
                    : r.key === FORMER_STAFF
                      ? 'Former staff'
                      : (names.get(r.key) ?? 'Former staff')}
                </td>
                <td>{r.sales}</td>
                <td>{formatMoney(r.gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
