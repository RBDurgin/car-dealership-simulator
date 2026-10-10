import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { CAR_MODELS } from '../sim/customers'
import { FLOOR_PLAN_DAILY_RATE, FLOOR_PLAN_LIMIT, floorBalance } from '../sim/floorPlan'
import { carName } from '../sim/interactables'
import { BASE_MSRP, type InventoryCar } from '../sim/inventory'
import type { CarModel } from '../sim/layout'
import { CLOSEOUT_REBATE, closeoutOn } from '../sim/events'
import {
  dailyIncentive,
  freeSlots,
  INCENTIVE_DISCOUNT,
  orderCost,
  placeOrder,
  type Financing,
  type Order,
} from '../sim/ordering'
import { lockedReason } from '../sim/franchise'
import { expansionsUp } from '../sim/expansions'
import { reservedSlots } from '../sim/sellers'
import { levelTuning, orderInvoice, useGame, type ComputerTab } from '../state/store'
import { CalendarTab } from './CalendarTab'
import { ServiceTab } from './ServiceTab'
import { NazmasTab } from './NazmasTab'
import { formatMoney } from './format'
import { MarketingTab } from './MarketingTab'
import { UpgradesTab } from './UpgradesTab'
import { DAILY_DEPRECIATION, isStale, STALE_DAYS, stockValue, usedTag } from '../sim/usedCars'

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
  locked,
}: {
  model: CarModel
  day: number
  /** Why the franchise tier can't order this model, or null if it can. */
  locked: string | null
  /** Why each kind of order can't be placed, or null if it can. */
  blockers: Record<Financing, string | null>
  /** Say why under the buttons (touch has no tooltips). */
  explain: boolean
  missed: string | null
}) {
  const invoice = useGame(orderInvoice)
  const cost = orderCost(model, day, invoice)
  const msrp = BASE_MSRP[model]
  const onIncentive = dailyIncentive(day) === model
  const onCloseout = closeoutOn(day) === model
  const order = (financing: Financing) => useGame.getState().orderCar(model, financing)
  const why = [...new Set([blockers.cash, blockers.floor])].filter((r): r is string => !!r)
  return (
    <li className={locked ? 'stock-row stock-locked' : 'stock-row'}>
      <div className="stock-who">
        <div className="staff-name">
          {carName(model)}
          {locked && (
            <span
              className="stock-badge stock-tier"
              title="Meet the manufacturer's quota to move up a franchise tier."
            >
              {locked.replace(/\.$/, '')}
            </span>
          )}
          {onIncentive && (
            <span className="stock-badge stock-incentive">
              −{Math.round(INCENTIVE_DISCOUNT * 100)}% today
            </span>
          )}
          {onCloseout && (
            <span
              className="stock-badge stock-closeout"
              title="The manufacturer's month-end closeout: off invoice until the month ends."
            >
              −{Math.round(CLOSEOUT_REBATE * 100)}% closeout
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
      {explain && !locked && why.length > 0 && (
        <div className="stock-why muted">{why.join(' ')}</div>
      )}
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
  const rate = useGame(levelTuning).interest
  const value = stockValue(car, day)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {carName(car.model)}
          {car.floored && (
            <span className="stock-badge">
              Floor plan · {formatMoney(Math.round(car.cost * FLOOR_PLAN_DAILY_RATE * rate))}/day
            </span>
          )}
          {car.used && <span className="stock-badge stock-used">{usedTag(car.used)}</span>}
          {car.status === 'recon' && <span className="stock-badge">In the shop</span>}
          {isStale(car, day) && (
            <span
              className="stock-badge stock-stale"
              title={`In stock ${STALE_DAYS}+ days and still losing value. Take a lower offer to move it.`}
            >
              Stale
            </span>
          )}
        </div>
        <div className="staff-meta">
          {WHERE[car.location]} · {daysOnLot(car, day)} · cost {formatMoney(car.cost)}
        </div>
        {value !== null && (
          <div
            className="staff-meta stock-value"
            title={`Used cars lose about ${(DAILY_DEPRECIATION * 100).toFixed(1)}% of their value a day.`}
          >
            Worth {formatMoney(value)} today ↓
          </div>
        )}
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
 * The office computer: buying stock from the manufacturer (the catalog,
 * today's orders and the cars in stock), ad campaigns on the marketing tab,
 * improvements on the upgrades tab, the coming weeks on the calendar tab and
 * the garage on the service tab. Opened at the computer, from the top bar's
 * Office button, or with I, M, U, C and B.
 * Orders are delivered the next morning.
 */
export function StockPanel() {
  const open = useGame((s) => s.stockOpen)
  const tab = useGame((s) => s.computerTab)
  const touch = useMediaQuery(COARSE)
  if (!open) return null
  const show = (t: ComputerTab) => useGame.getState().toggleStockPanel(true, t)
  return (
    <div className="panel staff-panel stock-panel" role="dialog" aria-label="Office computer">
      <button
        className="close"
        aria-label="Close"
        onClick={() => useGame.getState().toggleStockPanel(false)}
      >
        ×
      </button>
      <div className="info-kicker">Office computer</div>
      <div className="panel-tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'btn btn-small btn-primary' : 'btn btn-small'}
            onClick={() => show(t)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'stock' ? (
        <StockTab />
      ) : tab === 'marketing' ? (
        <MarketingTab />
      ) : tab === 'upgrades' ? (
        <UpgradesTab />
      ) : tab === 'calendar' ? (
        <CalendarTab />
      ) : tab === 'service' ? (
        <ServiceTab />
      ) : (
        <NazmasTab />
      )}
      <div className="status-hint">
        {TAB_HINTS[tab].hint}
        {touch ? '' : ` ${TAB_HINTS[tab].key} or Esc to close.`}
      </div>
    </div>
  )
}

const TABS: [ComputerTab, string][] = [
  ['stock', 'Stock'],
  ['marketing', 'Marketing'],
  ['upgrades', 'Upgrades'],
  ['calendar', 'Calendar'],
  ['service', 'Service'],
  ['nazmas', "Nazma's"],
]

const TAB_HINTS: Record<ComputerTab, { hint: string; key: string }> = {
  stock: { hint: 'Orders arrive tomorrow morning.', key: 'I' },
  marketing: { hint: 'Campaigns start tomorrow morning.', key: 'M' },
  upgrades: { hint: 'Upgrades go up overnight.', key: 'U' },
  calendar: { hint: 'Plan stock and ads for the busy days.', key: 'C' },
  service: { hint: 'Mechanics work the bays until closing.', key: 'B' },
  nazmas: { hint: 'A new special every day.', key: 'K' },
}

function StockTab() {
  const cash = useGame((s) => s.cash)
  const day = useGame((s) => s.clock.day)
  const inventory = useGame((s) => s.inventory)
  const orders = useGame((s) => s.orders)
  const purchases = useGame((s) => s.purchases)
  const missedToday = useGame((s) => s.dayStats.missed)
  const missedYesterday = useGame((s) => s.missedYesterday)
  const invoice = useGame(orderInvoice)
  const tier = useGame((s) => s.franchise)
  const expansions = useGame((s) => s.expansions)

  // Lot spaces held for used cars bought today are taken too.
  const reserved = reservedSlots(purchases)
  const book = { cash, inventory, orders, reserved, tier, expansions, clock: { day } }
  const free = freeSlots(inventory, orders, reserved, expansionsUp(book))
  const freeIn = (where: 'lot' | 'showroom') => free.filter((s) => s.location === where).length
  const blocker = (model: CarModel, financing: Financing) => {
    const r = placeOrder(book, model, financing, day, invoice)
    return r.ok ? null : r.reason
  }
  // Cars in the shop are still ours.
  const stock = inventory
    .filter((c) => c.status !== 'sold')
    .sort((a, b) => Number(a.location === 'lot') - Number(b.location === 'lot'))
  return (
    <>
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
            locked={lockedReason(model, tier)}
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
    </>
  )
}
