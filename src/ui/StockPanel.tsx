import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { CAR_MODELS } from '../sim/customers'
import { FLOOR_PLAN_DAILY_RATE, FLOOR_PLAN_LIMIT, floorBalance } from '../sim/floorPlan'
import { carName } from '../sim/interactables'
import { availableCars, BASE_MSRP, type InventoryCar } from '../sim/inventory'
import type { CarModel } from '../sim/layout'
import {
  dailyIncentive,
  freeSlots,
  INCENTIVE_DISCOUNT,
  orderCost,
  placeOrder,
  type Financing,
  type Order,
} from '../sim/ordering'
import { useGame } from '../state/store'
import { formatMoney } from './format'

const WHERE = { showroom: 'Showroom', lot: 'Lot' } as const

/** "Arrived today", "1 day on the lot", "4 days on the lot". */
function daysOnLot(car: InventoryCar, day: number): string {
  const days = day - car.arrivedDay
  if (days <= 0) return 'Arrived today'
  return `${days} day${days === 1 ? '' : 's'} in stock`
}

/** "2 asked for yesterday · 1 today", or null if nobody went without. */
function missedLabel(yesterday = 0, today = 0): string | null {
  const parts = [yesterday > 0 && `${yesterday} yesterday`, today > 0 && `${today} today`]
  const said = parts.filter(Boolean).join(' · ')
  return said ? `Asked for, not in stock: ${said}` : null
}

function CatalogRow({
  model,
  day,
  blockers,
  explain,
  missed,
}: {
  model: CarModel
  day: number
  /** Why each kind of order can't be placed, or null if it can. */
  blockers: Record<Financing, string | null>
  /** Say why under the buttons (touch has no tooltips). */
  explain: boolean
  missed: string | null
}) {
  const cost = orderCost(model, day)
  const msrp = BASE_MSRP[model]
  const onIncentive = dailyIncentive(day) === model
  const order = (financing: Financing) => useGame.getState().orderCar(model, financing)
  const why = [...new Set([blockers.cash, blockers.floor])].filter((r): r is string => !!r)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {carName(model)}
          {onIncentive && (
            <span className="stock-badge stock-incentive">
              −{Math.round(INCENTIVE_DISCOUNT * 100)}% today
            </span>
          )}
        </div>
        <div className="staff-meta">
          MSRP ~{formatMoney(msrp)} · margin ~{formatMoney(msrp - cost)}
        </div>
        {missed && <div className="stock-missed">{missed}</div>}
      </div>
      <div className="staff-wage price">{formatMoney(cost)}</div>
      <div className="stock-actions">
        <button
          className="btn btn-small btn-primary"
          disabled={!!blockers.cash}
          title={blockers.cash ?? 'Pay the invoice in cash now'}
          onClick={() => order('cash')}
        >
          Buy (cash)
        </button>
        <button
          className="btn btn-small"
          disabled={!!blockers.floor}
          title={blockers.floor ?? 'The bank pays; you pay daily interest until it sells'}
          onClick={() => order('floor')}
        >
          Floor plan
        </button>
      </div>
      {explain && why.length > 0 && <div className="stock-why muted">{why.join(' ')}</div>}
    </li>
  )
}

function OrderRow({ o }: { o: Order }) {
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">{carName(o.model)}</div>
        <div className="staff-meta">
          {WHERE[o.slot.location]} · {o.financing === 'cash' ? 'Paid cash' : 'Floor plan'}
        </div>
      </div>
      <div className="staff-wage price">{formatMoney(o.cost)}</div>
      <div className="stock-actions">
        <button className="btn btn-small" onClick={() => useGame.getState().cancelOrder(o.id)}>
          Cancel
        </button>
      </div>
    </li>
  )
}

function StockRow({ car, day, cash }: { car: InventoryCar; day: number; cash: number }) {
  const short = cash < car.cost
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {carName(car.model)}
          {car.floored && (
            <span className="stock-badge">
              Floor plan · {formatMoney(Math.round(car.cost * FLOOR_PLAN_DAILY_RATE))}/day
            </span>
          )}
        </div>
        <div className="staff-meta">
          {WHERE[car.location]} · {daysOnLot(car, day)} · cost {formatMoney(car.cost)}
        </div>
      </div>
      <div className="staff-wage price">{formatMoney(car.msrp)}</div>
      {car.floored && (
        <div className="stock-actions">
          <button
            className="btn btn-small"
            disabled={short}
            title={short ? 'Not enough cash to pay it off.' : 'Repay the bank from cash'}
            onClick={() => useGame.getState().payOff(car.id)}
          >
            Pay off
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * Buying stock from the manufacturer: the catalog, today's orders and the cars
 * in stock. Opened at the office computer, from the top bar or with I. Orders
 * are delivered the next morning.
 */
export function StockPanel() {
  const open = useGame((s) => s.stockOpen)
  const cash = useGame((s) => s.cash)
  const day = useGame((s) => s.clock.day)
  const inventory = useGame((s) => s.inventory)
  const orders = useGame((s) => s.orders)
  const missedToday = useGame((s) => s.dayStats.missed)
  const missedYesterday = useGame((s) => s.missedYesterday)
  const touch = useMediaQuery(COARSE)
  if (!open) return null

  const book = { cash, inventory, orders }
  const free = freeSlots(inventory, orders)
  const freeIn = (where: 'lot' | 'showroom') => free.filter((s) => s.location === where).length
  const blocker = (model: CarModel, financing: Financing) => {
    const r = placeOrder(book, model, financing, day)
    return r.ok ? null : r.reason
  }
  const stock = availableCars(inventory).sort(
    (a, b) => Number(a.location === 'lot') - Number(b.location === 'lot'),
  )
  return (
    <div className="panel staff-panel stock-panel" role="dialog" aria-label="Stock">
      <button
        className="close"
        aria-label="Close"
        onClick={() => useGame.getState().toggleStockPanel(false)}
      >
        ×
      </button>
      <div className="info-kicker">Stock</div>
      <h2>Order from the manufacturer</h2>
      <dl className="stock-summary">
        <dt>Cash</dt>
        <dd className="price topbar-cash">{formatMoney(cash)}</dd>
        <dt>Floor plan</dt>
        <dd className="price">
          {formatMoney(floorBalance(inventory, orders))}{' '}
          <span className="muted">of {formatMoney(FLOOR_PLAN_LIMIT)}</span>
        </dd>
        <dt>Space</dt>
        <dd>
          Lot: {freeIn('lot')} free · Showroom: {freeIn('showroom')} free
        </dd>
      </dl>
      {free.length === 0 && (
        <p className="stock-full">
          No room: every space is taken or on order. Sell some cars first.
        </p>
      )}
      <ul className="staff-list">
        {CAR_MODELS.map((model) => (
          <CatalogRow
            key={model}
            model={model}
            day={day}
            blockers={{ cash: blocker(model, 'cash'), floor: blocker(model, 'floor') }}
            // With no room, every order is blocked for the same reason, said once above.
            explain={free.length > 0}
            missed={missedLabel(missedYesterday[model], missedToday[model])}
          />
        ))}
      </ul>
      <h3>Arriving tomorrow</h3>
      {orders.length === 0 ? (
        <p className="muted staff-empty">Nothing on order.</p>
      ) : (
        <ul className="staff-list">
          {orders.map((o) => (
            <OrderRow key={o.id} o={o} />
          ))}
        </ul>
      )}
      <h3>In stock ({stock.length})</h3>
      {stock.length === 0 ? (
        <p className="muted staff-empty">The lot is empty.</p>
      ) : (
        <ul className="staff-list">
          {stock.map((car) => (
            <StockRow key={car.id} car={car} day={day} cash={cash} />
          ))}
        </ul>
      )}
      <div className="status-hint">
        Orders arrive tomorrow morning.{touch ? '' : ' I or Esc to close.'}
      </div>
    </div>
  )
}
