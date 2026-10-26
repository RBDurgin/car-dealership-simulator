import type { ReactNode } from 'react'
import { interactables } from '../scene/runtime'
import { shortDate } from '../sim/calendar'
import { conditionOf } from '../sim/cleanliness'
import { COURSE_LABELS, eotmCount, SENIOR_PERKS, titleOf } from '../sim/growth'
import { isWarned, moraleFace, moraleLabel, moraleLines, tiredDays } from '../sim/morale'
import { daysOffText } from '../sim/rota'
import type { CarStatus } from '../sim/inventory'
import { shapeLabel, usedTag } from '../sim/usedCars'
import { useGame } from '../state/store'
import { formatMoney } from './format'
import { Skill } from './StaffPanel'

const STATUS_LABELS: Record<CarStatus, string> = {
  available: 'For sale',
  sold: 'Sold',
  recon: 'In the shop',
  out: 'Out on a test drive',
  auction: 'At the dealer auction',
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="panel info-panel">
      <button
        className="close"
        aria-label="Close"
        onClick={() => useGame.getState().closeInspect()}
      >
        ×
      </button>
      {children}
    </div>
  )
}

/** What the player last inspected: a car or an employee. */
export function InfoPanel() {
  const inspectedId = useGame((s) => s.inspectedId)
  const stock = useGame((s) => s.inventory.find((c) => c.id === inspectedId))
  const employee = useGame((s) => s.roster.find((e) => e.id === inspectedId))
  const day = useGame((s) => s.clock.day)
  const resting = useGame((s) => !!inspectedId && s.onBreak.includes(inspectedId))
  const wins = useGame((s) => (inspectedId ? eotmCount(s.eotm, inspectedId) : 0))
  const car = inspectedId ? interactables.get(inspectedId)?.car : undefined
  if (employee) {
    return (
      <Panel>
        <div className="info-kicker">Staff</div>
        <h2>{employee.name}</h2>
        <dl>
          <dt>Role</dt>
          <dd>
            {titleOf(employee)}
            {resting && <span className="muted"> · on a break ☕</span>}
          </dd>
          {wins > 0 && (
            <>
              <dt>Honours</dt>
              <dd>🏆 Employee of the Month{wins > 1 && ` ×${wins}`}</dd>
            </>
          )}
          {employee.senior && (
            <>
              <dt>Perk</dt>
              <dd>{SENIOR_PERKS[employee.role].text}</dd>
            </>
          )}
          <dt>Skill</dt>
          <dd>
            <Skill skill={employee.skill} potential={employee.potential} />
          </dd>
          <dt>Wage</dt>
          <dd className="price">{formatMoney(employee.wage)}/day</dd>
          <dt>Days off</dt>
          <dd>
            {daysOffText(employee.daysOff)}
            {tiredDays(employee.streak) > 0 && (
              <span className="staff-quitting"> · {employee.streak} days straight</span>
            )}
          </dd>
          {employee.training && (
            <>
              <dt>Training</dt>
              <dd>
                {COURSE_LABELS[employee.training.course]} on {shortDate(employee.training.day)}
              </dd>
            </>
          )}
          <dt>Morale</dt>
          <dd>
            {moraleFace(employee.morale)} {moraleLabel(employee.morale)}
            {isWarned(employee) && !employee.quitting && (
              <span className="staff-quitting"> · thinking of leaving</span>
            )}
            {employee.praisedDay === day && <span className="muted"> · praised today</span>}
          </dd>
        </dl>
        {employee.moraleWhy.length > 0 && (
          <ul className="mood-why muted">
            {moraleLines(employee.moraleWhy).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </Panel>
    )
  }
  if (!car || !stock) return null
  return (
    <Panel>
      <div className="info-kicker">{car.location}</div>
      <h2>{car.name}</h2>
      {stock.used && <div className="customer-type">{usedTag(stock.used)}</div>}
      <dl>
        <dt>Color</dt>
        <dd>
          <span className="swatch" style={{ background: car.colorHex }} />
          {car.color}
        </dd>
        <dt>{stock.used ? 'Used price' : 'MSRP'}</dt>
        <dd className="price">{formatMoney(stock.msrp)}</dd>
        <dt>Your cost</dt>
        <dd className="price">{formatMoney(stock.cost)}</dd>
        <dt>Status</dt>
        <dd>{STATUS_LABELS[stock.status]}</dd>
        <dt>Condition</dt>
        <dd>
          {conditionOf(stock.cleanliness)}
          {stock.ding && ', dented'}
        </dd>
        {stock.used && (
          <>
            <dt>Shape</dt>
            <dd>{shapeLabel(stock.used.condition)}</dd>
          </>
        )}
      </dl>
    </Panel>
  )
}
