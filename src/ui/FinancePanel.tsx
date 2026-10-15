import { useState } from 'react'
import { creditLine } from '../sim/credit'
import type { Customer } from '../sim/customers'
import {
  answerFor,
  canPresent,
  clampProductPrice,
  dealReserve,
  financedAmount,
  fiGross,
  fiWarmth,
  loanDeclined,
  loanOpen,
  markupWarmth,
  moreDownFor,
  netPrice,
  pressureOf,
  PRODUCT_STEP,
  productsFor,
  type FiDeal,
  type Product,
} from '../sim/fi'
import { carName } from '../sim/interactables'
import {
  buyerRate,
  declineReason,
  LENDERS,
  lenderById,
  loanAmount,
  MAX_MARKUP,
  monthlyPayment,
  type DeclineReason,
  type Lender,
} from '../sim/lenders'
import type { Warmth } from '../sim/negotiation'
import { levelTuning, useGame } from '../state/store'
import { formatMoney } from './format'

/** How the markup stepper moves, in rate points. */
const MARKUP_STEP = 0.25

const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`

const PRODUCT_LABELS: Record<Warmth, string> = {
  hot: 'Hot: likely to take it',
  warm: 'Warm: they might',
  cold: 'Cold: likely a no',
}

const MARKUP_LABELS: Record<Warmth, string> = {
  hot: "Fair: they won't mind",
  warm: 'Pricey: costs some goodwill',
  cold: 'Steep: sours them, and may come back',
}

/** Easy's hint (`Tuning.dealHint`), as on the haggle stepper. */
function Chip({ warmth, labels }: { warmth: Warmth; labels: Record<Warmth, string> }) {
  return (
    <div className={`warmth-chip warmth-${warmth}`} role="status">
      {labels[warmth]}
    </div>
  )
}

function declineText(reason: DeclineReason, lender: Lender, c: Customer): string {
  switch (reason) {
    case 'tier':
      return `Doesn't lend to tier ${c.credit?.tier}`
    case 'down':
      return `Needs ${Math.round((lender.minDown[c.credit!.tier] ?? 0) * 100)}% down`
    case 'amount':
      return `Lends up to ${formatMoney(lender.maxAmount ?? 0)}`
  }
}

/**
 * The loan: every lender, the ones that won't take the buyer greyed out with
 * why, and the markup over the chosen one's buy rate. Settled once the first
 * product is presented. With nobody willing, the buyer can put more down if
 * their budget allows, or go home.
 */
function Loan({ c, deal, net }: { c: Customer; deal: FiDeal; net: number }) {
  const game = useGame.getState()
  const hint = useGame((s) => levelTuning(s).dealHint)
  const amount = loanAmount(net, deal.down)
  const open = loanOpen(deal)
  const down = Math.round(deal.down * 100)
  if (loanDeclined(c, deal)) {
    const more = moreDownFor(c, net)
    return (
      <>
        <div className="customer-status">
          No lender will take {c.name} at {down}% down.
        </div>
        <div className="customer-actions">
          {more !== null && (
            <button className="btn btn-primary" onClick={() => game.fiMoreDown()}>
              Ask for {Math.round(more * 100)}% down
            </button>
          )}
          <button className="btn" onClick={() => game.fiLetGo()}>
            Let them go
          </button>
        </div>
      </>
    )
  }
  const lender = lenderById(deal.lender!)
  const rate = buyerRate(lender, deal.markup)
  const setMarkup = (m: number) => game.fiLender(lender.id, m)
  return (
    <>
      <dl className="haggle-figures">
        <dt>Borrowing</dt>
        <dd className="price">
          {formatMoney(amount)}
          {down > 0 && <span className="muted"> ({down}% down)</span>}
        </dd>
      </dl>
      {open ? (
        <div className="fi-lenders" role="radiogroup" aria-label="Lender">
          {LENDERS.map((l) => {
            const reason = declineReason(l, { ...c.credit!, down: deal.down }, amount)
            const picked = l.id === lender.id
            return (
              <button
                key={l.id}
                className={picked ? 'btn fi-lender picked' : 'btn fi-lender'}
                role="radio"
                aria-checked={picked}
                disabled={reason !== null}
                onClick={() => game.fiLender(l.id, deal.markup)}
              >
                <span>{l.name}</span>
                <span className="fi-lender-rate">
                  {reason ? declineText(reason, l, c) : `buy rate ${pct(l.buyRate)}`}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="status-hint">The loan is set with {lender.name}.</div>
      )}
      {open && (
        <div className="haggle-stepper">
          <button
            className="btn"
            aria-label="Lower markup"
            disabled={deal.markup <= 0}
            onClick={() => setMarkup(deal.markup - MARKUP_STEP)}
          >
            −
          </button>
          <span className="haggle-allowance">Markup {deal.markup.toFixed(2)} pts</span>
          <button
            className="btn"
            aria-label="Raise markup"
            disabled={deal.markup >= MAX_MARKUP}
            onClick={() => setMarkup(deal.markup + MARKUP_STEP)}
          >
            +
          </button>
        </div>
      )}
      {open && hint && <Chip warmth={markupWarmth(deal.markup)} labels={MARKUP_LABELS} />}
      <dl className="haggle-figures">
        <dt>Their rate</dt>
        <dd>
          {pct(rate)} · {formatMoney(monthlyPayment(amount, rate))}/mo
        </dd>
        <dt>Reserve</dt>
        <dd className="price">{formatMoney(dealReserve(deal, amount))}</dd>
      </dl>
    </>
  )
}

/**
 * One product: its price stepper and **Present**, then the buyer's answer.
 * One they turned down can be presented again for less.
 */
function ProductRow({ c, deal, product }: { c: Customer; deal: FiDeal; product: Product }) {
  const [price, setPrice] = useState(product.low)
  const game = useGame.getState()
  const hint = useGame((s) => levelTuning(s).dealHint)
  const bonus = useGame((s) => levelTuning(s).productTake)
  const answer = answerFor(deal, product.id)
  const step = (d: number) => setPrice((p) => clampProductPrice(product.id, p + d))
  if (answer?.taken) {
    return (
      <div className="fi-product">
        <span className="fi-product-name">{product.name}</span>
        <span className="fi-answer fi-taken">Taken at {formatMoney(answer.price)}</span>
      </div>
    )
  }
  return (
    <div className="fi-product">
      <span className="fi-product-name">
        {product.name}
        {answer && (
          <span className="fi-answer fi-declined"> No at {formatMoney(answer.price)}</span>
        )}
      </span>
      <div className="haggle-stepper">
        <button
          className="btn"
          aria-label={`Lower ${product.name}`}
          onClick={() => step(-PRODUCT_STEP)}
        >
          −
        </button>
        <button
          className="btn haggle-ask"
          disabled={!canPresent(c, deal, product.id, price)}
          onClick={() => game.fiPresent(product.id, price)}
        >
          Present {formatMoney(price)}
        </button>
        <button
          className="btn"
          aria-label={`Raise ${product.name}`}
          onClick={() => step(PRODUCT_STEP)}
        >
          +
        </button>
      </div>
      {hint && canPresent(c, deal, product.id, price) && (
        <Chip
          warmth={fiWarmth(c, product, price, pressureOf(deal), bonus)}
          labels={PRODUCT_LABELS}
        />
      )}
    </div>
  )
}

/**
 * The F&I menu at the desk, in place of the customer panel once the
 * paperwork is done: the loan (lender and markup), then the products one by
 * one, each answered at once and each adding to the pressure, then the
 * contracts to sign. A cash buyer skips the loan and isn't offered GAP.
 */
export function FinancePanel({ c }: { c: Customer }) {
  const car = useGame((s) => s.inventory.find((x) => x.id === c.offer?.carId))
  const deal = c.fi
  if (!deal || !c.offer || !car) return null
  const game = useGame.getState()
  const net = netPrice(c.offer)
  const declined = loanDeclined(c, deal)
  const amount = financedAmount(c, deal, net)
  const pressure = pressureOf(deal)
  return (
    <div className="panel customer-panel haggling fi-panel">
      <div className="info-kicker">F&amp;I menu</div>
      <h2>{c.name}</h2>
      {c.credit && <div className="customer-history customer-credit">{creditLine(c.credit)}</div>}
      <dl>
        <dt className="customer-car">Car</dt>
        <dd className="customer-car">{carName(car.model)}</dd>
        <dt>{c.offer.allowance !== undefined ? 'Price after trade' : 'Price'}</dt>
        <dd className="price">{formatMoney(net)}</dd>
      </dl>
      <h3 className="fi-heading">Loan</h3>
      {c.credit?.finance ? (
        <Loan c={c} deal={deal} net={net} />
      ) : (
        <div className="status-hint">Paying cash: no loan to arrange.</div>
      )}
      {!declined && (
        <>
          <h3 className="fi-heading">
            Products
            {pressure > 0 && <span className="fi-pressure"> · pressure {pressure.toFixed(1)}</span>}
          </h3>
          {productsFor(c).map((p) => (
            <ProductRow key={p.id} c={c} deal={deal} product={p} />
          ))}
          <dl className="haggle-figures">
            <dt>F&amp;I gross</dt>
            <dd className="price">{formatMoney(fiGross(deal, amount, c.credit))}</dd>
          </dl>
          <div className="customer-actions">
            <button className="btn btn-primary" onClick={() => game.fiSign()}>
              Sign the contracts
            </button>
          </div>
        </>
      )}
    </div>
  )
}
