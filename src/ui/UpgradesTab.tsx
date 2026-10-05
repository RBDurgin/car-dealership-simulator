import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import {
  improvementBlocker,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  installed,
  slotTier,
  type ImprovementId,
  type OwnedImprovement,
} from '../sim/improvements'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/** "+5% walk-ins · +4 passers-by a day". */
function effectLabel(id: ImprovementId): string {
  const { walkInChance = 0, passersBy = 0 } = IMPROVEMENTS[id].effects
  const parts = [
    walkInChance > 0 && `+${Math.round(walkInChance * 100)}% of passers-by walk in`,
    passersBy > 0 && `+${passersBy} passers-by a day`,
  ]
  return parts.filter(Boolean).join(' · ')
}

function UpgradeRow({
  id,
  cash,
  owned,
  day,
}: {
  id: ImprovementId
  cash: number
  owned: readonly OwnedImprovement[]
  day: number
}) {
  const info = IMPROVEMENTS[id]
  const touch = useMediaQuery(COARSE)
  const bought = owned.find((o) => o.id === id)
  const upNow = installed(owned, day)
  const up = upNow.includes(id)
  const replaced = up && slotTier(upNow, info.slot) > info.tier
  const blocker = improvementBlocker({ cash, improvements: owned }, id)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {info.label}
          {bought && (
            <span className="stock-badge">
              {replaced ? 'Replaced' : up ? 'Up' : 'Goes up tonight'}
            </span>
          )}
        </div>
        <div className="staff-meta">{effectLabel(id)}</div>
        <div className="staff-blurb muted">
          {info.blurb}
          {info.requires && ` Replaces the ${IMPROVEMENTS[info.requires].label.toLowerCase()}.`}
        </div>
      </div>
      <div className="staff-wage price">{formatMoney(info.cost)}</div>
      {!bought && (
        <div className="stock-actions">
          <button
            className="btn btn-small btn-primary"
            disabled={!!blocker}
            title={blocker ?? 'Pay now; it goes up overnight'}
            onClick={() => useGame.getState().buyImprovement(id)}
          >
            Buy
          </button>
        </div>
      )}
      {touch && !bought && blocker && <div className="stock-why muted">{blocker}</div>}
    </li>
  )
}

/**
 * Improvements: buy one (paid now, up overnight) and see what's up. They're
 * for good, and a higher tier replaces the one below it.
 */
export function UpgradesTab() {
  const cash = useGame((s) => s.cash)
  const day = useGame((s) => s.clock.day)
  const owned = useGame((s) => s.improvements)
  const spent = useGame((s) => s.dayStats.improvements)
  return (
    <>
      <h2>Improve the dealership</h2>
      <dl className="stock-summary">
        <dt>Cash</dt>
        <dd className="price topbar-cash">{formatMoney(cash)}</dd>
        <dt>Spent today</dt>
        <dd className="price">{formatMoney(spent)}</dd>
      </dl>
      <h3>Out front</h3>
      <ul className="staff-list">
        {IMPROVEMENT_IDS.map((id) => (
          <UpgradeRow key={id} id={id} cash={cash} owned={owned} day={day} />
        ))}
      </ul>
      <p className="muted staff-blurb">
        More passers-by, and more of them turning in, starting the morning after it goes up.
      </p>
    </>
  )
}
