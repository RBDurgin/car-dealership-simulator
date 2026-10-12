import { carName } from '../sim/interactables'
import type { Best, Metric, RecordKey, Records } from '../sim/stats'
import { formatMoney } from './format'

export const RECORD_LABELS: Record<RecordKey, string> = {
  bestDay: 'best day',
  bestSalesDay: 'most cars in a day',
  bestWeek: 'best week',
  bestMonth: 'best month',
  biggestDeal: 'biggest deal',
  longestStreak: 'longest streak',
}

/** "$8,420", "5 cars", "$4,100 on a Pickup", "6 days in a row". */
export function recordValue(key: RecordKey, records: Records): string | null {
  const best: Best | null = records[key]
  if (!best) return null
  if (key === 'bestSalesDay') return `${best.value} car${best.value === 1 ? '' : 's'}`
  if (key === 'longestStreak') return `${best.value} day${best.value === 1 ? '' : 's'} in a row`
  if (key === 'biggestDeal' && records.biggestDeal) {
    return `${formatMoney(best.value)} on a ${carName(records.biggestDeal.model)}`
  }
  return formatMoney(best.value)
}

/** "New record: best day ($8,420)", for the day summary. */
export function newRecordLine(key: RecordKey, records: Records): string {
  const value = recordValue(key, records)
  return `New record: ${RECORD_LABELS[key]}${value ? ` (${value})` : ''}`
}

export const METRIC_LABELS: Record<Metric, string> = {
  sales: 'Sales',
  gross: 'Gross',
  net: 'Net',
  visitors: 'Visitors',
  reputation: 'Reputation',
  cash: 'Cash',
}

const isMoney = (m: Metric) => m === 'gross' || m === 'net' || m === 'cash'

/** A chart value in full: "$1,200", "4". */
export function metricValue(m: Metric, v: number): string {
  return isMoney(m) ? formatMoney(v) : String(Math.round(v))
}

/** A chart axis value kept short: "$12k", "−$1.5k", "40". */
export function metricAxis(m: Metric, v: number): string {
  const n = Math.round(v)
  if (!isMoney(m)) return String(n)
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${sign}$${+(a / 1_000_000).toFixed(1)}M`
  if (a >= 1000) return `${sign}$${+(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}k`
  return `${sign}$${a}`
}
