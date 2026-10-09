import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { expansionBlocker, EXPANSION_IDS, EXPANSIONS, installedExpansions } from '../sim/expansions'
import {
  AREA_LABELS,
  improvementBlocker,
  IMPROVEMENT_IDS,
  IMPROVEMENTS,
  installed,
  slotTier,
  type ImprovementArea,
  type ImprovementId,
  type OwnedImprovement,
} from '../sim/improvements'
import type { ExpansionId } from '../sim/layout'
import { rankById } from '../sim/progression'
import { useGame } from '../state/store'
import { formatMoney } from './format'
import { effectLabel } from './improvementText'

/** What each area's upgrades do, under its list. */
const AREA_NOTES: Record<ImprovementArea, string> = {
  outside: 'More passers-by, and more of them turning in.',
  showroom: 'Buyers haggle less and say yes a little more often.',
  lounge: 'Customers waiting to be helped give up later.',
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

/** An expansion: its price, what it needs (a rank first), and whether it's built. */
function ExpansionRow({ id }: { id: ExpansionId }) {
  const info = EXPANSIONS[id]
  const touch = useMediaQuery(COARSE)
  const cash = useGame((s) => s.cash)
  const day = useGame((s) => s.clock.day)
  const owned = useGame((s) => s.expansions)
  const rank = useGame((s) => s.career.rank)
  const bought = owned.some((o) => o.id === id)
  const up = installedExpansions(owned, day).includes(id)
  const blocker = expansionBlocker({ cash, expansions: owned, rank }, id)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {info.label}
          {bought && <span className="stock-badge">{up ? 'Built' : 'Built tonight'}</span>}
        </div>
        <div className="staff-meta">Needs {rankById(info.rank).name}</div>
        <div className="staff-blurb muted">{info.blurb}</div>
      </div>
      <div className="staff-wage price">{formatMoney(info.cost)}</div>
      {!bought && (
        <div className="stock-actions">
          <button
            className="btn btn-small btn-primary"
            disabled={!!blocker}
            title={blocker ?? 'Pay now; it’s built overnight'}
            onClick={() => useGame.getState().buyExpansion(id)}
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
  const spent = useGame((s) => s.dayStats.improvements + s.dayStats.expansions)
  return (
    <>
      <h2>Improve the dealership</h2>
      <dl className="stock-summary">
        <dt>Cash</dt>
        <dd className="price topbar-cash">{formatMoney(cash)}</dd>
        <dt>Spent today</dt>
        <dd className="price">{formatMoney(spent)}</dd>
      </dl>
      {(Object.keys(AREA_LABELS) as ImprovementArea[]).map((area) => (
        <section key={area}>
          <h3>{AREA_LABELS[area]}</h3>
          <ul className="staff-list">
            {IMPROVEMENT_IDS.filter((id) => IMPROVEMENTS[id].area === area).map((id) => (
              <UpgradeRow key={id} id={id} cash={cash} owned={owned} day={day} />
            ))}
          </ul>
          <p className="muted staff-blurb">{AREA_NOTES[area]}</p>
        </section>
      ))}
      <section>
        <h3>Expansion</h3>
        <ul className="staff-list">
          {EXPANSION_IDS.map((id) => (
            <ExpansionRow key={id} id={id} />
          ))}
        </ul>
        <p className="muted staff-blurb">More ground as your dealer rank grows.</p>
      </section>
      <p className="muted staff-blurb">Each works from the morning after it goes up.</p>
    </>
  )
}
