import { useState } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { ARCHETYPES } from '../sim/archetypes'
import { PLAYER_ID, type Customer } from '../sim/customers'
import { budgetHint, dealCustomer } from '../sim/deal'
import { carName } from '../sim/interactables'
import type { InventoryCar } from '../sim/inventory'
import { ASK_STEP, clampAsk, suggestedAsk } from '../sim/negotiation'
import { financeOnDuty } from '../sim/staff'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/** Gross on the car at `price`, red when it's a loss. */
function Margin({ car, price }: { car: InventoryCar; price: number }) {
  const margin = price - car.cost
  return (
    <>
      <dt>Margin</dt>
      <dd className={margin < 0 ? 'price margin-loss' : 'price'}>{formatMoney(margin)}</dd>
    </>
  )
}

/**
 * Naming a price: MSRP or 3% off to open; later, holding, splitting the
 * difference or taking their counter. A stepper sets any price in between.
 * Remounted each round (`key`), so the stepper starts at the suggested ask.
 */
function Haggle({ c, car }: { c: Customer; car: InventoryCar }) {
  const [price, setPrice] = useState(() => suggestedAsk(c, car))
  const game = useGame.getState()
  const ask = (p: number) => game.ask(p)
  const step = (d: number) => setPrice((p) => clampAsk(c, car, p + d))
  const h = c.haggle
  return (
    <>
      <dl className="haggle-figures">
        {h && (
          <>
            {/* Hidden on compact screens: the Hold button names it. */}
            <dt className="haggle-last">Your last ask</dt>
            <dd className="price haggle-last">{formatMoney(h.lastAsk)}</dd>
            <dt>Their counter</dt>
            <dd className="price">{formatMoney(h.counter)}</dd>
          </>
        )}
        <Margin car={car} price={price} />
      </dl>
      <div className="customer-actions">
        {h ? (
          <>
            <button className="btn" onClick={() => ask(h.lastAsk)}>
              Hold at {formatMoney(h.lastAsk)}
            </button>
            <button className="btn btn-primary" onClick={() => ask(suggestedAsk(c, car))}>
              Split the difference
            </button>
            <button className="btn" onClick={() => ask(h.counter)}>
              Accept {formatMoney(h.counter)}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => ask(car.msrp)}>
              Ask MSRP
            </button>
            <button className="btn" onClick={() => ask(Math.round((car.msrp * 0.97) / 100) * 100)}>
              Offer −3%
            </button>
          </>
        )}
      </div>
      <div className="haggle-stepper">
        <button className="btn" aria-label="Lower" onClick={() => step(-ASK_STEP)}>
          −
        </button>
        <button className="btn haggle-ask" onClick={() => ask(price)}>
          Ask {formatMoney(price)}
        </button>
        <button className="btn" aria-label="Raise" onClick={() => step(ASK_STEP)}>
          +
        </button>
      </div>
      <div className="customer-actions">
        <button className="btn btn-small" onClick={() => game.walkAway()}>
          Walk away
        </button>
      </div>
    </>
  )
}

/**
 * The customer the player is dealing with: what kind of shopper they are, the
 * car they want, its price, roughly what they want to spend, and where the
 * deal stands. The haggle is played from here; the customer's menu offers the
 * suggested ask.
 */
export function CustomerPanel() {
  const c = useGame((s) => dealCustomer(s.customers, PLAYER_ID))
  const finance = useGame((s) => !!financeOnDuty(s.roster))
  const car = useGame((s) => s.inventory.find((x) => x.id === (c?.offer?.carId ?? c?.targetCarId)))
  const touch = useMediaQuery(COARSE)
  if (!c || !car) return null

  const game = useGame.getState()
  const haggling = c.phase === 'talking' || c.phase === 'considering'
  return (
    <div className={haggling ? 'panel customer-panel haggling' : 'panel customer-panel'}>
      <div className="info-kicker">Customer</div>
      <h2>{c.name}</h2>
      <div className="customer-type">{ARCHETYPES[c.archetype].hint}</div>
      <p className="customer-quote">
        “I'm interested in the {carName(car.model)}. I'm hoping to spend around{' '}
        {formatMoney(budgetHint(c))}.”
      </p>
      <dl>
        <dt className="customer-car">Car</dt>
        <dd className="customer-car">{carName(car.model)}</dd>
        <dt>MSRP</dt>
        <dd className="price">{formatMoney(car.msrp)}</dd>
        <dt>Your cost</dt>
        <dd className="price">{formatMoney(car.cost)}</dd>
      </dl>
      {c.phase === 'talking' && <Haggle key={c.haggle?.round ?? 1} c={c} car={car} />}
      {c.phase === 'considering' && c.offer && (
        <>
          <dl className="haggle-figures">
            <dt>You asked</dt>
            <dd className="price">{formatMoney(c.offer.price)}</dd>
            <Margin car={car} price={c.offer.price} />
          </dl>
          <div className="customer-status">Thinking it over…</div>
        </>
      )}
      {c.phase === 'following' && (
        <div className="customer-status">
          {finance ? (
            <>
              Agreed to buy! {touch ? 'Tap' : 'Click'} your finance manager at the office desk and
              choose <b>Hand off to finance</b>.
            </>
          ) : (
            <>
              Agreed to buy! Take them to your desk chair and choose <b>Close deal</b>.
            </>
          )}
          <div className="customer-actions">
            <button className="btn btn-small" onClick={() => game.letWait()}>
              Let them wait
            </button>
          </div>
          {!touch && <div className="status-hint">Esc when idle also lets them wait</div>}
        </div>
      )}
      {c.phase === 'signing' && <div className="customer-status">Signing the paperwork…</div>}
    </div>
  )
}
