import {
  AUCTION_RANK,
  auctionOpen,
  auctionRecord,
  bidBlocker,
  INSPECT_FEE,
  inspectBlocker,
  inspectLot,
  isAuctionDay,
  lotValue,
  maxBidBlocker,
  maxBidFor,
  winLot,
  withMaxBid,
  type Lot,
} from '../../sim/auction'
import {
  AUCTION_END,
  AUCTION_START,
  AUCTION_STARTING,
  biddingOpen,
  lotOnBlock,
  newResults,
  nextBid,
  passLot,
  playerBid,
  startAuction,
  stepAuction,
  type AuctionState,
  type LotResult,
  type RunContext,
} from '../../sim/bidding'
import { PLAYER_ID } from '../../sim/customers'
import { washCar } from '../../sim/cleanliness'
import { expansionsUp } from '../../sim/expansions'
import { payoffOnSale } from '../../sim/floorPlan'
import { formatMoney } from '../../sim/format'
import { carName } from '../../sim/interactables'
import { buildInventory, restock, roundTo100, sellCar as markSold } from '../../sim/inventory'
import { CHANNELS, launchCampaign } from '../../sim/marketing'
import { cancelOrder, claimedByOrder, freeSlots, placeOrder } from '../../sim/ordering'
import { emptyMonthSales } from '../../sim/quota'
import { rankById } from '../../sim/progression'
import { createRng } from '../../sim/rng'
import { reservedSlots } from '../../sim/sellers'
import { seniorInspectScale } from '../../sim/growth'
import { usedCarManager } from '../../sim/staff'
import { proxyBuyer } from '../../sim/staffAi'
import { PLAYER_SKILL } from '../../sim/usedCars'
import { nextUsedId, rollUsedCar, stockValue, usedStockCar } from '../../sim/usedCars'
import {
  autoConsign,
  consign,
  consignBlocker,
  consignedLots,
  liveConsigned,
  returnRecord,
  sellerFee,
  unconsign,
  unsoldLine,
  wholesaleRecord,
  withFloor,
} from '../../sim/wholesale'
import { dispatch, notify, tallyWork, type Kit } from '../core'
import { orderInvoice } from '../derived'
import { INVENTORY_SEED, rng } from '../rng'
import { auctionLotsFor, runListFor } from '../selectors'
import type { GameState } from '../types'
import { amendLog } from './career'

type EconomyKeys =
  | 'inventory'
  | 'orders'
  | 'campaigns'
  | 'monthSales'
  | 'sellCar'
  | 'orderCar'
  | 'launchCampaign'
  | 'cancelOrder'
  | 'payOff'
  | 'devRestock'
  | 'devUsedCar'
  | 'buyLot'
  | 'inspectLot'
  | 'setMaxBid'
  | 'staffInspect'
  | 'devAuctionBuy'
  | 'tickAuction'
  | 'auctionBid'
  | 'auctionPass'
  | 'consign'
  | 'unconsign'
  | 'setFloor'
  | 'setAutoWholesale'

/**
 * Cash, stock, orders, the floor plan, ads and the month's sales. (Cash,
 * the quota, purchases, auction wins and the franchise tier start with `dayOne`.)
 */
export function economySlice(k: Kit): Pick<GameState, EconomyKeys> {
  const { get, set } = k
  return {
    inventory: buildInventory(createRng(INVENTORY_SEED)),
    orders: [],
    campaigns: [],
    monthSales: emptyMonthSales(),
    sellCar: (id, price) => {
      const s = get()
      const car = s.inventory.find((c) => c.id === id)
      const inventory = markSold(s.inventory, id)
      if (!car || inventory === s.inventory) return false
      // The car is gone: drop anything that still points at it.
      if (s.activeAction?.targetId === id) dispatch(k, { type: 'cancel' })
      // The bank takes back what it lent on a floored car; the rest is ours.
      // Sold off the lot, it isn't going to the auction.
      set({
        inventory,
        consigned: unconsign(s.consigned, id),
        cash: s.cash + (price ?? car.msrp) - payoffOnSale(car),
        menu: s.menu?.targetId === id ? null : s.menu,
        hoveredId: s.hoveredId === id ? null : s.hoveredId,
        inspectedId: s.inspectedId === id ? null : s.inspectedId,
      })
      return true
    },
    orderCar: (model, financing) => {
      const s = get()
      const book = { ...s, reserved: reservedSlots(s.purchases, s.auctionWins), tier: s.franchise }
      const result = placeOrder(book, model, financing, s.clock.day, orderInvoice(s))
      if (!result.ok) {
        notify(k, result.reason)
        return false
      }
      set({ orders: result.orders, cash: result.cash })
      const how = financing === 'cash' ? 'paid cash' : 'on the floor plan'
      notify(
        k,
        `Ordered a ${carName(model)} for ${formatMoney(result.order.cost)} (${how}). It arrives tomorrow.`,
      )
      return true
    },
    launchCampaign: (channel) => {
      const s = get()
      const day = s.clock.day
      const n = s.campaigns.filter((c) => c.channel === channel && c.startDay === day + 1).length
      const result = launchCampaign(s, channel, day, `${channel}-${day}-${n + 1}`)
      if (!result.ok) {
        notify(k, result.reason)
        return false
      }
      const { label, cost, days } = CHANNELS[channel]
      set({
        cash: result.cash,
        campaigns: result.campaigns,
        dayStats: { ...s.dayStats, marketing: s.dayStats.marketing + cost },
      })
      amendLog(k)
      notify(k, `${label} booked for ${formatMoney(cost)}. It runs for ${days} days from tomorrow.`)
      return true
    },
    cancelOrder: (id) => {
      const s = get()
      const order = s.orders.find((o) => o.id === id)
      if (!order) return
      set(cancelOrder(s, id))
      notify(k, `Cancelled the ${carName(order.model)}.`)
    },
    payOff: (carId) => {
      const s = get()
      const car = s.inventory.find((c) => c.id === carId)
      if (!car || car.status !== 'available' || !car.floored) return
      if (s.cash < car.cost) return notify(k, 'Not enough cash to pay it off.')
      set({
        cash: s.cash - car.cost,
        inventory: s.inventory.map((c) => (c === car ? { ...c, floored: false } : c)),
      })
      notify(k, `Paid off the ${carName(car.model)}.`)
    },
    devRestock: (canPlace) => {
      // A sold car's space may since have been ordered into.
      const { orders } = get()
      const inventory = restock(
        get().inventory,
        (car) => !claimedByOrder(car.rect, orders) && (canPlace?.(car) ?? true),
      )
      if (inventory !== get().inventory) set({ inventory })
    },
    devUsedCar: (canPlace) => {
      const s = get()
      const day = s.clock.day
      const spec = rollUsedCar(createRng(Date.now()), day)
      const id = nextUsedId([...s.inventory, ...s.purchases, ...s.auctionWins], day)
      const cars = freeSlots(
        s.inventory,
        s.orders,
        reservedSlots(s.purchases, s.auctionWins),
        expansionsUp(s),
      )
        .filter((slot) => slot.location === 'lot')
        .map((slot) => usedStockCar(id, spec, slot, 0, day, 0.5))
      const car = cars.find((c) => canPlace?.(c) ?? true)
      if (!car) return notify(k, 'No free lot space for a used car.')
      set({
        inventory: [...s.inventory, { ...car, cost: roundTo100(stockValue(car, day)! * 0.9) }],
      })
    },
    buyLot: (lotId, price, by) => {
      const s = get()
      const day = s.clock.day
      const lot = runListFor(s).find((l) => l.id === lotId)
      const blocker = !auctionOpen(s.career)
        ? `The auction opens at ${rankById(AUCTION_RANK).name}.`
        : !isAuctionDay(day) || !lot
          ? 'That lot isn’t up today.'
          : s.auctionWins.some((w) => w.lotId === lotId)
            ? 'Already bought.'
            : bidBlocker(s, price)
      if (blocker) {
        notify(k, blocker)
        return false
      }
      const id = nextUsedId([...s.inventory, ...s.purchases, ...s.auctionWins], day)
      const inspection = s.inspected.find((i) => i.lotId === lotId)
      const win = winLot(lot!, price, s, id, inspection)!
      set({
        cash: s.cash - win.price - win.fee,
        auctionWins: [...s.auctionWins, win],
        dayStats: {
          ...s.dayStats,
          auction: {
            ...s.dayStats.auction,
            bought: [...s.dayStats.auction.bought, auctionRecord(win, day)],
          },
        },
      })
      const manager = by ? s.roster.find((e) => e.id === by) : undefined
      tallyWork(k, manager?.id, 'buys')
      notify(
        k,
        `${manager ? `${manager.name} won` : 'Won'} the ${win.car.year} ${carName(win.car.model)} at auction for ${formatMoney(win.price)} (+${formatMoney(win.fee)} fee). It's on the lot tomorrow.`,
      )
      return true
    },
    inspectLot: (lotId) => {
      const s = get()
      const day = s.clock.day
      const lot = runListFor(s).find((l) => l.id === lotId)
      const blocker = !auctionOpen(s.career)
        ? `The auction opens at ${rankById(AUCTION_RANK).name}.`
        : !lot
          ? 'That lot isn’t in the run.'
          : inspectBlocker(lot, day, s.auction, s.inspected, s.cash)
      if (blocker) {
        notify(k, blocker)
        return false
      }
      const inspection = inspectLot(lot!, PLAYER_SKILL)
      set({
        cash: s.cash - INSPECT_FEE,
        inspected: [...s.inspected, inspection],
        dayStats: {
          ...s.dayStats,
          auction: {
            ...s.dayStats.auction,
            inspections: s.dayStats.auction.inspections + INSPECT_FEE,
          },
        },
      })
      amendLog(k)
      const same = inspection.grade === lot!.grade
      notify(
        k,
        `Lot ${lot!.order}, the ${lot!.car.year} ${carName(lot!.car.model)}, inspected for ${formatMoney(INSPECT_FEE)}: ${same ? `${inspection.grade}, as graded` : `${inspection.grade}, not ${lot!.grade}`}.`,
      )
      return true
    },
    setMaxBid: (lotId, max) => {
      const s = get()
      const lot = runListFor(s).find((l) => l.id === lotId)
      const blocker = !auctionOpen(s.career)
        ? `The auction opens at ${rankById(AUCTION_RANK).name}.`
        : !lot
          ? 'That lot isn’t in the run.'
          : maxBidBlocker(lot, s.clock.day, s.auction, !!usedCarManager(s.roster))
      if (blocker) return notify(k, blocker)
      const auctionBids = withMaxBid(s.auctionBids, lot!, Math.max(0, Math.round(max)))
      set({ auctionBids })
    },
    staffInspect: (employeeId, lotId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const lot = runListFor(s).find((l) => l.id === lotId)
      if (e?.role !== 'buyer' || e.fired || !lot || !auctionOpen(s.career)) return
      // Their inspection is the job: no fee, and nothing to add once anyone's done it.
      if (inspectBlocker(lot, s.clock.day, s.auction, s.inspected, Infinity)) return
      set({ inspected: [...s.inspected, inspectLot(lot, e.skill, seniorInspectScale(e))] })
      tallyWork(k, e.id, 'inspections')
    },
    devAuctionBuy: () => {
      const s = get()
      const lot = runListFor(s).find((l) => !s.auctionWins.some((w) => w.lotId === l.id))
      if (!isAuctionDay(s.clock.day) || !lot) return notify(k, 'No lot left in today’s run.')
      get().buyLot(lot.id, lotValue(lot, s.clock.day))
    },
    tickAuction: (minute) => k.batch(() => runAuction(k, minute)),
    auctionBid: () => {
      const s = get()
      const run = s.auction
      if (!biddingOpen(run)) return false
      const lots = auctionLotsFor(s)
      const blocker = lotOnBlock(run, lots)?.consigned
        ? 'That’s your own car.'
        : run.high === PLAYER_ID
          ? 'You have the high bid.'
          : bidBlocker(s, nextBid(run))
      if (blocker) {
        notify(k, blocker)
        return false
      }
      set({ auction: playerBid(run, lots) })
      return true
    },
    auctionPass: () => {
      const run = get().auction
      // The manager lets it go too.
      const next = run && passLot(run, runContext(k))
      if (next) k.batch(() => afterBeats(k, run, next))
    },
    consign: (carId) => {
      const s = get()
      const blocker = consignBlocker({ ...s, open: auctionOpen(s.career) }, carId)
      if (blocker) {
        notify(k, blocker)
        return false
      }
      set({ consigned: consign(s.consigned, carId) })
      const car =
        s.inventory.find((c) => c.id === carId) ?? s.purchases.find((p) => p.id === carId)?.car
      notify(
        k,
        `The ${car ? carName(car.model) : 'car'} goes to the next auction (J to set a floor). It stays for sale until then.`,
      )
      return true
    },
    unconsign: (carId) => {
      const consigned = unconsign(get().consigned, carId)
      if (consigned !== get().consigned) set({ consigned })
    },
    setFloor: (carId, floor) => set({ consigned: withFloor(get().consigned, carId, floor) }),
    setAutoWholesale: (autoWholesale) => set({ autoWholesale }),
  }
}

/**
 * What stepping today's run needs from the store: the run list, and lots
 * already bought. With a `minute`, the used-car manager bids the player's max
 * bids while they're at the auction then, as far as cash and lot space allow.
 */
function runContext(k: Kit, minute?: number): RunContext {
  const s = k.get()
  const manager =
    minute !== undefined && proxyBuyer(s.roster, s.clock.day, minute, !!s.auction?.over)
  return {
    lots: auctionLotsFor(s),
    taken: s.auctionWins.map((w) => w.lotId),
    day: s.clock.day,
    rng: rng.auction,
    ...(manager &&
      s.auctionBids.length > 0 && {
        proxy: (lotId: string, bid: number) =>
          bid <= maxBidFor(s.auctionBids, lotId) && !bidBlocker(s, bid),
      }),
  }
}

/**
 * Today's auction, stepped to `minute`: on auction day, once the dealership
 * has the rank, the run starts at `AUCTION_START` and the lots go one at a
 * time. Called from the clock's steps and, between them, from `tickAuction`,
 * so it stops while the game is paused.
 */
export function runAuction(k: Kit, minute: number): void {
  const s = k.get()
  if (!isAuctionDay(s.clock.day) || !auctionOpen(s.career)) return
  if (!s.auction) {
    if (minute < AUCTION_START || minute >= AUCTION_END) return
    k.set({ auction: startAuction(minute, runContext(k, minute)) })
    notify(k, AUCTION_STARTING)
  }
  const run = k.get().auction!
  const next = stepAuction(run, minute, runContext(k, minute))
  if (next !== run) afterBeats(k, run, next)
}

/**
 * Stores the run moved on from `prev` to `next`, buying each lot the player
 * (or the used-car manager) won as it's hammered. One that can't be paid for
 * or placed any more falls through, with `buyLot`'s notice saying why.
 */
function afterBeats(k: Kit, prev: AuctionState, next: AuctionState): void {
  k.set({ auction: next })
  const results = newResults(prev, next)
  const lots = auctionLotsFor(k.get())
  for (const r of results) {
    const lot = lots.find((l) => l.id === r.lotId)
    if (lot?.consigned) wholesaled(k, lot, r)
  }
  const by = (proxy?: true) => (proxy ? usedCarManager(k.get().roster)?.id : undefined)
  const fell = results.filter(
    (r) => r.buyer === PLAYER_ID && !k.get().buyLot(r.lotId, r.price, by(r.proxy)),
  )
  if (fell.length === 0) return
  const run = k.get().auction!
  k.set({
    auction: {
      ...run,
      results: run.results.map((r) => (fell.includes(r) ? { ...r, fell: true } : r)),
    },
  })
}

/**
 * Our consigned `lot` hammered with result `r`: sold, the car is gone and the
 * price less the seller fee (and anything the bank is owed on it) is cash;
 * otherwise it comes back when the day is settled (`returnUnsold`).
 */
function wholesaled(k: Kit, lot: Lot, r: LotResult): void {
  const s = k.get()
  const name = carName(lot.car.model)
  if (r.buyer === null) return notify(k, unsoldLine(lot, r, name, formatMoney))
  const car = s.inventory.find((c) => c.id === lot.consigned!.carId && c.status === 'auction')
  if (!car) return
  const sale = wholesaleRecord(car, r.price, r.buyer)
  k.set({
    inventory: s.inventory.map((c) => (c === car ? { ...c, status: 'sold' } : c)),
    cash: s.cash + r.price - sale.fee - payoffOnSale(car),
    dayStats: {
      ...s.dayStats,
      wholesale: { ...s.dayStats.wholesale, sold: [...s.dayStats.wholesale.sold, sale] },
    },
  })
  notify(
    k,
    `${r.buyer} bought your ${lot.car.year} ${name} for ${formatMoney(r.price)} (−${formatMoney(sellerFee(r.price))} seller fee).`,
  )
}

/**
 * The morning's wholesale: consignments whose car has gone are dropped; the
 * morning before an auction, with auto-wholesale on, the used-car manager
 * consigns long-held used cars; and on auction morning the consigned cars
 * leave the lot for the run, after the week's list. Returns the notice, if any.
 */
export function wholesaleMorning(k: Kit, day: number): string | null {
  const s = k.get()
  if (!auctionOpen(s.career)) return null
  let consigned = liveConsigned(s.consigned, s.inventory)
  const notices: string[] = []
  const manager = usedCarManager(s.roster)
  if (manager && s.autoWholesale && isAuctionDay(day + 1)) {
    const more = autoConsign(consigned, s.inventory, day)
    const n = more.length - consigned.length
    if (n > 0) {
      notices.push(
        `${manager.name} is sending ${n === 1 ? 'a used car' : `${n} used cars`} to tomorrow's auction.`,
      )
    }
    consigned = more
  }
  if (!isAuctionDay(day)) {
    if (consigned !== s.consigned) k.set({ consigned })
    return notices.join(' ') || null
  }
  const { lots, rest } = consignedLots(consigned, s.inventory, runListFor(s).length, day)
  const going = new Set(lots.map((l) => l.consigned!.carId))
  k.set({
    consigned: rest,
    wholesaleLots: lots,
    ...(lots.length > 0 && {
      inventory: s.inventory.map((c) => (going.has(c.id) ? { ...c, status: 'auction' } : c)),
    }),
  })
  if (lots.length > 0) {
    notices.push(
      `${lots.length === 1 ? 'Your consigned car runs' : `Your ${lots.length} consigned cars run`} at today's auction.`,
    )
  }
  return notices.join(' ') || null
}

/**
 * When the day is settled: our cars that ran today and didn't sell (or that
 * the run never reached) are back for sale, those that ran less `RUN_FEE`.
 */
export function returnUnsold(k: Kit): void {
  const s = k.get()
  const back = s.wholesaleLots.filter((l) =>
    s.inventory.some((c) => c.id === l.consigned!.carId && c.status === 'auction'),
  )
  if (back.length === 0) return
  const returned = back.map((l) =>
    returnRecord(
      l,
      s.auction?.results.find((r) => r.lotId === l.id),
    ),
  )
  const ids = new Set(back.map((l) => l.consigned!.carId))
  k.set({
    inventory: s.inventory.map((c) => (ids.has(c.id) ? { ...c, status: 'available' } : c)),
    cash: s.cash - returned.reduce((sum, r) => sum + r.fee, 0),
    dayStats: {
      ...s.dayStats,
      wholesale: {
        ...s.dayStats.wholesale,
        returned: [...s.dayStats.wholesale.returned, ...returned],
      },
    },
  })
}

/** Car `id` washed by the player. */
export function wash(k: Kit, id: string): void {
  const inventory = washCar(k.get().inventory, id)
  if (inventory === k.get().inventory) return
  const stats = k.get().dayStats
  k.set({ inventory, dayStats: { ...stats, washes: stats.washes + 1 } })
  const car = inventory.find((c) => c.id === id)
  if (car) notify(k, `The ${carName(car.model)} is spotless.`)
}
