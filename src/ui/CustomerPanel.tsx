import { useState } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { ARCHETYPES } from '../sim/archetypes'
import { PLAYER_ID, type Customer } from '../sim/customers'
import { budgetHint, dealCustomer } from '../sim/deal'
import { carName } from '../sim/interactables'
import type { InventoryCar } from '../sim/inventory'
import {
  ASK_STEP,
  buyWarmth,
  clampAllowance,
  clampAsk,
  clampBuy,
  dealWarmth,
  suggestedAllowance,
  suggestedAsk,
  suggestedBuy,
  type Warmth,
} from '../sim/negotiation'
import { buyBlocker, estimateRange, lotSlotFor, SELLER_HINTS } from '../sim/sellers'
import { financeOnDuty } from '../sim/staff'
import { usedTag } from '../sim/usedCars'
import { levelTuning, sellerBonusFor, useGame } from '../state/store'
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

const WARMTH_LABELS: Record<Warmth, string> = {
  hot: 'Hot: likely to take it',
  warm: "Warm: they'll talk",
  cold: 'Cold: likely to walk',
}

/** Easy's deal hint: how the customer would take an ask of `price` (with `allowance` for their trade). */
function WarmthChip({
  c,
  car,
  price,
  allowance,
}: {
  c: Customer
  car: InventoryCar
  price: number
  allowance?: number
}) {
  const bonus = useGame((s) => sellerBonusFor(s, c))
  const warmth = dealWarmth(c, car, price, bonus, allowance)
  return (
    <div className={`warmth-chip warmth-${warmth}`} role="status">
      {WARMTH_LABELS[warmth]}
    </div>
  )
}

/** What we'd make on their trade-in at `allowance`, against our estimate of its value. */
function TradeMargin({ c, allowance }: { c: Customer; allowance: number }) {
  const margin = (c.trade?.estimate.estimate ?? 0) - allowance
  return (
    <>
      <dt>Est. trade margin</dt>
      <dd className={margin < 0 ? 'price margin-loss' : 'price'}>{formatMoney(margin)}</dd>
    </>
  )
}

/**
 * Naming a price: MSRP or 3% off to open; later, holding, splitting the
 * difference or taking their counter. A stepper sets any price in between.
 * With a trade-in (and room on the lot for it) a second stepper sets the
 * allowance, and the haggle is over what they pay after it: their counter
 * and our last ask are nets, and the buttons keep the allowance as set.
 * Remounted each round (`key`), so the steppers start at the suggestions.
 * On Easy a chip shows how warm they are to the steppers' numbers.
 */
function Haggle({ c, car }: { c: Customer; car: InventoryCar }) {
  const room = useGame((s) => !!lotSlotFor(s))
  const trading = !!c.trade && room
  const [allowance, setAllowance] = useState(() => suggestedAllowance(c))
  const allow = trading ? allowance : undefined
  const [rawPrice, setPrice] = useState(() => suggestedAsk(c, car, allow))
  const price = clampAsk(c, car, rawPrice, allow)
  const hint = useGame((s) => levelTuning(s).dealHint)
  const game = useGame.getState()
  const ask = (p: number) => game.ask(p, allow)
  const step = (d: number) => setPrice(clampAsk(c, car, price + d, allow))
  const stepAllowance = (d: number) => setAllowance((a) => clampAllowance(c, a + d))
  const h = c.haggle
  // The haggle's numbers are nets with a trade: add the allowance back for a price.
  const add = allow ?? 0
  const net = trading && h?.allowance !== undefined
  const after = net ? ' after trade' : ''
  return (
    <>
      <dl className="haggle-figures">
        {h && (
          <>
            {/* Hidden on compact screens: the Hold button names it. */}
            <dt className="haggle-last">Your last ask{after}</dt>
            <dd className="price haggle-last">{formatMoney(h.lastAsk)}</dd>
            <dt>Their counter{after}</dt>
            <dd className="price">{formatMoney(h.counter)}</dd>
          </>
        )}
        <Margin car={car} price={price} />
        {trading && (
          <>
            <TradeMargin c={c} allowance={allowance} />
            <dt>They pay after trade</dt>
            <dd className="price">{formatMoney(price - allowance)}</dd>
          </>
        )}
      </dl>
      {c.trade && !room && (
        <div className="status-hint">
          No room on the lot for their trade, so they&apos;re less keen.
        </div>
      )}
      <div className="customer-actions">
        {h ? (
          <>
            <button className="btn" onClick={() => ask(h.lastAsk + (net ? add : 0))}>
              Hold at {formatMoney(h.lastAsk)}
              {after}
            </button>
            <button className="btn btn-primary" onClick={() => ask(suggestedAsk(c, car, allow))}>
              Split the difference
            </button>
            <button className="btn" onClick={() => ask(h.counter + (net ? add : 0))}>
              Accept {formatMoney(h.counter)}
              {after}
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
      {hint && <WarmthChip c={c} car={car} price={price} allowance={allow} />}
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
      {trading && (
        <div className="haggle-stepper">
          <button
            className="btn"
            aria-label="Lower allowance"
            onClick={() => stepAllowance(-ASK_STEP)}
          >
            −
          </button>
          <span className="haggle-allowance">Allow {formatMoney(allowance)} for trade</span>
          <button
            className="btn"
            aria-label="Raise allowance"
            onClick={() => stepAllowance(ASK_STEP)}
          >
            +
          </button>
        </div>
      )}
      <div className="customer-actions">
        <button className="btn btn-small" onClick={() => game.walkAway()}>
          Walk away
        </button>
      </div>
    </>
  )
}

/** Easy's deal hint for a seller: how they'd take an offer of `price`. */
function BuyWarmthChip({ c, price }: { c: Customer; price: number }) {
  const warmth = buyWarmth(c, price)
  return (
    <div className={`warmth-chip warmth-${warmth}`} role="status">
      {BUY_WARMTH_LABELS[warmth]}
    </div>
  )
}

const BUY_WARMTH_LABELS: Record<Warmth, string> = {
  hot: "Hot: they'll likely sell",
  warm: "Warm: they'll talk",
  cold: 'Cold: likely to walk',
}

/** What we'd make on the car at `price`, against our estimate of its value. */
function BuyMargin({ c, price }: { c: Customer; price: number }) {
  const margin = (c.selling?.estimate.estimate ?? 0) - price
  return (
    <>
      <dt>Est. margin</dt>
      <dd className={margin < 0 ? 'price margin-loss' : 'price'}>{formatMoney(margin)}</dd>
    </>
  )
}

/**
 * Making a seller an offer: under our estimate to open; later, holding,
 * splitting the difference or taking their price. A stepper sets any offer in
 * between. Nothing can be offered with no lot space or not enough cash.
 */
function BuyHaggle({ c }: { c: Customer }) {
  const [price, setPrice] = useState(() => suggestedBuy(c))
  const hint = useGame((s) => levelTuning(s).dealHint)
  const blocker = useGame((s) => buyBlocker(s, price))
  const game = useGame.getState()
  const offer = (p: number) => game.ask(p)
  const step = (d: number) => setPrice((p) => clampBuy(c, p + d))
  const h = c.haggle
  return (
    <>
      <dl className="haggle-figures">
        {h && (
          <>
            <dt className="haggle-last">Your last offer</dt>
            <dd className="price haggle-last">{formatMoney(h.lastAsk)}</dd>
            <dt>They want</dt>
            <dd className="price">{formatMoney(h.counter)}</dd>
          </>
        )}
        <BuyMargin c={c} price={price} />
      </dl>
      {blocker ? (
        <div className="customer-status">{blocker}</div>
      ) : (
        <>
          <div className="customer-actions">
            {h ? (
              <>
                <button className="btn" onClick={() => offer(h.lastAsk)}>
                  Hold at {formatMoney(h.lastAsk)}
                </button>
                <button className="btn btn-primary" onClick={() => offer(suggestedBuy(c))}>
                  Split the difference
                </button>
                <button className="btn" onClick={() => offer(h.counter)}>
                  Accept {formatMoney(h.counter)}
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => offer(suggestedBuy(c))}>
                Offer {formatMoney(suggestedBuy(c))}
              </button>
            )}
          </div>
          {hint && <BuyWarmthChip c={c} price={price} />}
          <div className="haggle-stepper">
            <button className="btn" aria-label="Lower" onClick={() => step(-ASK_STEP)}>
              −
            </button>
            <button className="btn haggle-ask" onClick={() => offer(price)}>
              Buy for {formatMoney(price)}
            </button>
            <button className="btn" aria-label="Raise" onClick={() => step(ASK_STEP)}>
              +
            </button>
          </div>
        </>
      )}
      <div className="customer-actions">
        <button className="btn btn-small" onClick={() => game.walkAway()}>
          Walk away
        </button>
      </div>
    </>
  )
}

/**
 * A seller the player is talking to: their car, what we make of its value
 * (closer once appraised), and the haggle over what we pay.
 */
function SellerPanel({ c }: { c: Customer }) {
  const touch = useMediaQuery(COARSE)
  const car = c.vehicle?.car
  const selling = c.selling
  if (!car || !selling) return null
  const { low, high } = estimateRange(selling.estimate)
  const haggling = c.phase === 'talking' || c.phase === 'considering'
  return (
    <div className={haggling ? 'panel customer-panel haggling' : 'panel customer-panel'}>
      <div className="info-kicker">Seller</div>
      <h2>{c.name}</h2>
      <div className="customer-type">{SELLER_HINTS[c.archetype]}</div>
      <p className="customer-quote">
        “I'm looking to sell my {carName(car.model)}. Cash only. What can you give me?”
      </p>
      <dl>
        <dt className="customer-car">Car</dt>
        <dd className="customer-car">
          {carName(car.model)} ({usedTag(car)})
        </dd>
        <dt>{selling.appraised ? 'Appraised' : 'At a glance'}</dt>
        <dd className="price">
          {formatMoney(low)}–{formatMoney(high)}
        </dd>
      </dl>
      {!selling.appraised && c.phase === 'talking' && (
        <div className="status-hint">
          {touch ? 'Tap' : 'Click'} their car and choose <b>Appraise</b> for a closer estimate.
        </div>
      )}
      {c.phase === 'talking' && <BuyHaggle key={c.haggle?.round ?? 1} c={c} />}
      {c.phase === 'considering' && c.offer && (
        <>
          <dl className="haggle-figures">
            <dt>You offered</dt>
            <dd className="price">{formatMoney(c.offer.price)}</dd>
            <BuyMargin c={c} price={c.offer.price} />
          </dl>
          <div className="customer-status">Thinking it over…</div>
        </>
      )}
    </div>
  )
}

/** A buyer's trade-in: the car, and what we make of its value (closer once appraised). */
function TradeFigures({ c }: { c: Customer }) {
  const car = c.vehicle!.car
  const { low, high } = estimateRange(c.trade!.estimate)
  return (
    <>
      <dt className="customer-car">Trade-in</dt>
      <dd className="customer-car">
        {carName(car.model)} ({usedTag(car)})
      </dd>
      <dt>{c.trade!.appraised ? 'Appraised' : 'At a glance'}</dt>
      <dd className="price">
        {formatMoney(low)}–{formatMoney(high)}
      </dd>
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
  if (c?.selling) return <SellerPanel c={c} />
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
        <dd className="customer-car">
          {carName(car.model)}
          {car.used && ` (${usedTag(car.used)})`}
        </dd>
        <dt>{car.used ? 'Used price' : 'MSRP'}</dt>
        <dd className="price">{formatMoney(car.msrp)}</dd>
        <dt>Your cost</dt>
        <dd className="price">{formatMoney(car.cost)}</dd>
        {c.trade && c.vehicle && <TradeFigures c={c} />}
      </dl>
      {c.trade && c.vehicle && !c.trade.appraised && c.phase === 'talking' && (
        <div className="status-hint">
          {touch ? 'Tap' : 'Click'} their car and choose <b>Appraise</b> for a closer estimate.
        </div>
      )}
      {c.phase === 'talking' && <Haggle key={c.haggle?.round ?? 1} c={c} car={car} />}
      {c.phase === 'considering' && c.offer && (
        <>
          <dl className="haggle-figures">
            <dt>You asked</dt>
            <dd className="price">{formatMoney(c.offer.price)}</dd>
            <Margin car={car} price={c.offer.price} />
            {c.offer.allowance !== undefined && (
              <>
                <dt>Allowed for trade</dt>
                <dd className="price">{formatMoney(c.offer.allowance)}</dd>
              </>
            )}
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
