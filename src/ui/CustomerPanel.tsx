import { budgetHint, dealCustomer } from '../sim/deal'
import { carName } from '../sim/interactables'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/**
 * The customer the player is dealing with: the car they want, its price, roughly
 * what they want to spend, and where the deal stands. Offering and walking away
 * can be done from here as well as from the customer's menu.
 */
export function CustomerPanel() {
  const c = useGame((s) => dealCustomer(s.customers))
  const car = useGame((s) => s.inventory.find((x) => x.id === (c?.offer?.carId ?? c?.targetCarId)))
  if (!c || !car) return null

  const game = useGame.getState()
  return (
    <div className="panel customer-panel">
      <div className="info-kicker">Customer</div>
      <h2>{c.name}</h2>
      <p className="customer-quote">
        “I'm interested in the {carName(car.model)}. I'm hoping to spend around{' '}
        {formatMoney(budgetHint(c))}.”
      </p>
      <dl>
        <dt>Car</dt>
        <dd>{carName(car.model)}</dd>
        <dt>MSRP</dt>
        <dd className="price">{formatMoney(car.msrp)}</dd>
      </dl>
      {c.phase === 'talking' && (
        <div className="customer-actions">
          <button className="btn btn-primary" onClick={() => game.requestAction(c.id, 'offer')}>
            Offer at MSRP ({formatMoney(car.msrp)})
          </button>
          <button className="btn" onClick={() => game.walkAway()}>
            Walk away
          </button>
        </div>
      )}
      {c.phase === 'considering' && <div className="customer-status">Thinking it over…</div>}
      {c.phase === 'following' && (
        <div className="customer-status">
          Agreed to buy! Take them to your desk chair and choose <b>Close deal</b>.
          <div className="status-hint">Esc when idle lets them wait</div>
        </div>
      )}
      {c.phase === 'signing' && <div className="customer-status">Signing the paperwork…</div>}
    </div>
  )
}
