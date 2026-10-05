import { goalLabel, goalProgress, type OwnerGoal } from '../sim/owner'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/** "1/2", "$35,000 of $80,000", "1 so far". */
function progressText(goal: OwnerGoal, current: number, target: number): string {
  switch (goal.kind) {
    case 'revenue':
    case 'profit':
      return `${formatMoney(current)} of ${formatMoney(target)}`
    case 'noImpatient':
      return current === 0 ? 'none so far' : `${current} so far`
    default:
      return `${Math.min(current, target)}/${target}`
  }
}

/**
 * The owner's goal for today and how it's going, in the top bar once they've
 * set it. Green once it's met (or, for no walk-outs, while it still holds).
 * Compact screens show just an icon and the progress.
 */
export function GoalBanner() {
  const goal = useGame((s) => (s.owner?.announced ? s.owner.goal : null))
  const stats = useGame((s) => s.dayStats)
  if (!goal) return null
  const { current, target, met } = goalProgress(goal, stats)
  const label = goalLabel(goal, formatMoney)
  return (
    <span
      className={met ? 'goal-banner goal-met' : 'goal-banner'}
      title={`Today's goal from the owner: ${label}`}
    >
      <span className="goal-kicker">Owner</span>
      <span className="goal-icon" aria-hidden>
        ★
      </span>
      <span className="goal-label">{label}</span>
      <span className="goal-progress">{progressText(goal, current, target)}</span>
    </span>
  )
}
