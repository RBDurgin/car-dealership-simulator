import type { ReactNode } from 'react'
import { interactables } from '../scene/runtime'
import { conditionOf } from '../sim/cleanliness'
import { ROLE_LABELS } from '../sim/staff'
import { useGame } from '../state/store'
import { formatMoney } from './format'
import { Skill } from './StaffPanel'

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
  const car = inspectedId ? interactables.get(inspectedId)?.car : undefined
  if (employee) {
    return (
      <Panel>
        <div className="info-kicker">Staff</div>
        <h2>{employee.name}</h2>
        <dl>
          <dt>Role</dt>
          <dd>{ROLE_LABELS[employee.role]}</dd>
          <dt>Skill</dt>
          <dd>
            <Skill skill={employee.skill} />
          </dd>
          <dt>Wage</dt>
          <dd className="price">{formatMoney(employee.wage)}/day</dd>
        </dl>
      </Panel>
    )
  }
  if (!car || !stock) return null
  return (
    <Panel>
      <div className="info-kicker">{car.location}</div>
      <h2>{car.name}</h2>
      <dl>
        <dt>Color</dt>
        <dd>
          <span className="swatch" style={{ background: car.colorHex }} />
          {car.color}
        </dd>
        <dt>MSRP</dt>
        <dd className="price">{formatMoney(stock.msrp)}</dd>
        <dt>Your cost</dt>
        <dd className="price">{formatMoney(stock.cost)}</dd>
        <dt>Status</dt>
        <dd>{stock.status === 'available' ? 'For sale' : 'Sold'}</dd>
        <dt>Condition</dt>
        <dd>{conditionOf(stock.cleanliness)}</dd>
      </dl>
    </Panel>
  )
}
