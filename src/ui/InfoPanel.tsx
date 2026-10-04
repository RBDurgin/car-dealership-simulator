import { interactables } from '../scene/runtime'
import { useGame } from '../state/store'

export function InfoPanel() {
  const inspectedId = useGame((s) => s.inspectedId)
  const car = inspectedId ? interactables.get(inspectedId)?.car : undefined
  if (!car) return null
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
        <dt>Price</dt>
        <dd className="muted">TBD</dd>
      </dl>
    </div>
  )
}
