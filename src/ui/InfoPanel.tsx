import { interactables } from '../scene/runtime'
import { useGame } from '../state/store'
import { formatMoney } from './format'

export function InfoPanel() {
  const inspectedId = useGame((s) => s.inspectedId)
  const stock = useGame((s) => s.inventory.find((c) => c.id === inspectedId))
  const car = inspectedId ? interactables.get(inspectedId)?.car : undefined
  if (!car || !stock) return null
  return (
    <div className="panel info-panel">
      <button
        className="close"
        aria-label="Close"
        onClick={() => useGame.getState().closeInspect()}
      >
        ×
      </button>
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
        <dt>Status</dt>
        <dd>{stock.status === 'available' ? 'For sale' : 'Sold'}</dd>
      </dl>
    </div>
  )
}
