import type { RankProgress } from '../sim/progression'
import { formatMoney } from './format'

/**
 * "$90,000 of $120,000 lifetime gross toward Main Street, reputation 45 needed"
 * (or "Top rank reached").
 */
export function rankLine(p: RankProgress, gross: number): string {
  if (!p.next) return 'Top rank reached'
  const rep = p.reputationMet ? '' : `, reputation ${p.next.reputation} needed`
  return `${formatMoney(gross)} of ${formatMoney(p.grossNeeded)} lifetime gross toward ${p.next.name}${rep}`
}
