import { pickArchetype, skewWeights } from '../../sim/archetypes'
import { isClosed } from '../../sim/clock'
import { rollChargebacks } from '../../sim/chargebacks'
import { clientCarOf, loyalIds } from '../../sim/clients'
import { addContracts, newContract } from '../../sim/contracts'
import { assignCredit } from '../../sim/credit'
import {
  chooseTarget,
  generateCustomer,
  PLAYER_ID,
  PLAYER_SKILL,
  reduceCustomers,
  type Customer,
} from '../../sim/customers'
import { actionBlocker, dealCustomer, recordVisitors, saleRecord, type Sale } from '../../sim/deal'
import {
  addFiSale,
  answered,
  canPresent,
  deskLoan,
  type FiDeal,
  loanDeclined,
  moreDownFor,
  netPrice,
  openDeal,
  pressureOf,
  PRODUCTS,
  productTake,
  saleFi,
  staffMenu,
  withDown,
  withLoan,
} from '../../sim/fi'
import { formatMoney } from '../../sim/format'
import { carName } from '../../sim/interactables'
import { availableCars } from '../../sim/inventory'
import { lenderById } from '../../sim/lenders'
import { DESK_CHAIR_ID } from '../../sim/layout'
import {
  clampAllowance,
  clampAsk,
  clampBuy,
  quoteFor,
  respondToAsk,
  respondToBuyOffer,
  suggestedAllowance,
  suggestedAsk,
  suggestedBuy,
  walkLine,
} from '../../sim/negotiation'
import { addSale } from '../../sim/quota'
import { assignQuotes, type RivalStats } from '../../sim/rival'
import {
  appraiseFor,
  boughtRecord,
  buyBlocker,
  estimateRange,
  lotSlotFor,
  purchaseOf,
  vehicleOwnerId,
  vehicleTargetId,
} from '../../sim/sellers'
import { LAST_ARRIVAL_MINUTE } from '../../sim/spawner'
import { financeOnDuty, type Employee } from '../../sim/staff'
import {
  assignDriveAsk,
  drivableCar,
  driveBlocker,
  driveExpect,
  driveLine,
  driveMinutes,
  driveScore,
  perfectDrive,
  rollWear,
  wearCar,
} from '../../sim/testDrive'
import {
  closePrompt,
  offerTopics,
  PROMPTS_PER_DRIVE,
  promptsMade,
  staffTopic,
  topicFit,
} from '../../sim/talkingPoints'
import { nextUsedId } from '../../sim/usedCars'
import {
  arrivalOpts,
  commit,
  dispatch,
  endDeal,
  notify,
  tallyMissed,
  tallyWork,
  tuning,
  type Kit,
} from '../core'
import { sellerBonusFor } from '../derived'
import { nextActionId, nextCustomerId, rng } from '../rng'
import { answerService } from './service'
import type { GameState } from '../types'

type CustomerKeys =
  | 'customers'
  | 'dispatchCustomer'
  | 'answerOffer'
  | 'ask'
  | 'fiLender'
  | 'fiPresent'
  | 'fiMoreDown'
  | 'fiLetGo'
  | 'fiSign'
  | 'walkIn'
  | 'devSpawnCustomers'
  | 'testDrive'
  | 'headBack'
  | 'driveBack'
  | 'drivePrompt'
  | 'pickTopic'

/** Everyone on the lot, and the player's side of the deal. */
export function customersSlice(k: Kit): Pick<GameState, CustomerKeys> {
  const { get, set } = k
  return {
    customers: [],
    dispatchCustomer: (ev) => commit(k, reduceCustomers(get().customers, ev)),
    answerOffer: (id) => {
      const s = get()
      const c = s.customers.find((x) => x.id === id)
      if (c?.phase !== 'considering' || !c.offer) return
      if (c.selling) return answerSeller(k, c)
      if (c.service) return answerService(k, c)
      const car = s.inventory.find((x) => x.id === c.offer?.carId)
      const { price, allowance } = c.offer
      const res =
        car?.status === 'available'
          ? respondToAsk(c, car, price, rng.deal, sellerBonusFor(s, c), allowance, s.clock.day)
          : ({ answer: 'walk', reason: 'gone' } as const)
      const counter = res.answer === 'counter' ? res.counter : undefined
      const insulted = res.answer === 'counter' && res.insulted
      const ev = { type: 'respond', id, answer: res.answer, counter, insulted } as const
      commit(k, reduceCustomers(s.customers, ev))
      if (res.answer === 'walk' && res.reason === 'rival') tallyRival(k, 'lost')
      // A shopper walking out on a salesperson's offer gets them down.
      if (res.answer === 'walk') tallyWork(k, c.handlerId, 'lost')
      // Staff deals go on quietly; the sale itself is announced.
      if (c.handlerId !== PLAYER_ID) return
      if (res.answer === 'accept') notify(k, `${c.name}: "Deal! Lead the way."`)
      else if (res.answer === 'counter') {
        const after = allowance === undefined ? '' : ' after my trade'
        const slight = insulted ? `That's all for my car? ` : ''
        notify(k, `${c.name}: "${slight}How about ${formatMoney(res.counter)}${after}?"`)
      } else notify(k, `${c.name}: "${walkLine(res.reason)}"`)
    },
    ask: (price, allowance) => {
      const c = dealCustomer(get().customers, PLAYER_ID)
      if (c?.phase === 'talking') offer(k, c.id, price, allowance)
    },
    fiLender: (id, markup) => {
      const c = menuCustomer(k)
      if (!c?.fi || !c.offer) return
      const deal = withLoan(c, c.fi, netPrice(c.offer), id, markup)
      if (deal !== c.fi) commit(k, reduceCustomers(get().customers, { type: 'fi', id: c.id, deal }))
    },
    fiPresent: (id, price) => {
      const c = menuCustomer(k)
      if (!c?.fi || !canPresent(c, c.fi, id, price)) return
      const chance = productTake(c, PRODUCTS[id], price, pressureOf(c.fi), tuning(k).productTake)
      const deal = answered(c.fi, id, price, rng.fi.next() < chance)
      commit(k, reduceCustomers(get().customers, { type: 'fi', id: c.id, deal }))
    },
    fiMoreDown: () => {
      const c = menuCustomer(k)
      if (!c?.fi || !c.offer || !loanDeclined(c, c.fi)) return
      const net = netPrice(c.offer)
      const down = moreDownFor(c, net)
      if (down === null) return
      const deal = withDown(c, c.fi, net, down)
      commit(k, reduceCustomers(get().customers, { type: 'fi', id: c.id, deal }))
      const lender = deal.lender && lenderById(deal.lender).name
      notify(k, `${c.name} can put ${Math.round(down * 100)}% down. ${lender} will take the loan.`)
    },
    fiLetGo: () => {
      const c = menuCustomer(k)
      if (c?.fi && loanDeclined(c, c.fi)) declineBuyer(k, c)
    },
    fiSign: () => {
      const c = menuCustomer(k)
      if (!c?.fi) return
      if (loanDeclined(c, c.fi)) return notify(k, 'No lender has approved the loan yet.')
      const sale = sign(k, c, null, c.fi)
      if (!sale) {
        endDeal(k, ['menu'])
        return notify(k, 'The deal fell through.')
      }
      const fi = sale.fi && sale.fi.gross !== 0 ? ` F&I ${formatMoney(sale.fi.gross)}.` : ''
      notify(
        k,
        `Sold the ${carName(sale.model)} to ${sale.customerName} for ${formatMoney(sale.price)}!${fi}${tradeLine(sale)}`,
      )
    },
    testDrive: (id) => startDrive(k, id),
    headBack: () => {
      const c = dealCustomer(get().customers, PLAYER_ID)
      if (c?.phase !== 'driving' || c.drive?.cut) return
      commit(k, reduceCustomers(get().customers, { type: 'cutDrive', id: c.id }))
      notify(k, `Heading back to the lot with ${c.name}`)
    },
    driveBack: (id) => {
      const s = get()
      const c = s.customers.find((x) => x.id === id)
      const car = c?.drive && s.inventory.find((x) => x.id === c.drive!.carId)
      if (c?.phase !== 'driving' || !c.drive || !car) return
      // A prompt still up when they're back counts as unanswered.
      const closed = closePrompt(c.drive)
      const score = driveScore(closed, c, car)
      // The road leaves its mark: dirt, miles on a used car, now and then a ding.
      const rider = s.roster.find((e) => e.id === c.drive!.by)
      const wear = rollWear(
        car,
        c.drive.by,
        rider?.skill ?? 3,
        s.weather,
        rng.wear,
        tuning(k).dingChance,
      )
      const drive = { ...closed, back: true, score, ding: wear.ding }
      const ev = { type: 'droveBack', id, drive, expect: driveExpect(c, score) } as const
      const { drives } = s.dayStats
      set({
        inventory: wearCar(s.inventory, car.id, wear),
        dayStats: {
          ...s.dayStats,
          drives: {
            taken: drives.taken + 1,
            bought: drives.bought,
            cut: drives.cut + (drive.cut ? 1 : 0),
            byStaff: drives.byStaff + (rider ? 1 : 0),
            dings: drives.dings + (wear.ding ? 1 : 0),
            perfect: drives.perfect + (!rider && perfectDrive(drive) ? 1 : 0),
          },
        },
      })
      commit(k, reduceCustomers(get().customers, ev))
      // Their salesperson was let go while they were out: they're back to waiting.
      if (rider?.fired) commit(k, reduceCustomers(get().customers, { type: 'cancel', id }))
      const dinged = wear.ding ? ` The ${carName(car.model)} came back with a ding.` : ''
      if (c.handlerId === PLAYER_ID)
        notify(k, `${c.name}: "${driveLine(score, drive.cut)}"${dinged}`)
      else if (dinged)
        notify(k, `${rider?.name ?? 'A salesperson'} is back from a test drive.${dinged}`)
    },
    drivePrompt: (id) => {
      const s = get()
      const c = s.customers.find((x) => x.id === id)
      const car = c?.drive && s.inventory.find((x) => x.id === c.drive!.carId)
      if (c?.phase !== 'driving' || !c.drive || c.drive.cut || !car) return
      if (promptsMade(c.drive) >= PROMPTS_PER_DRIVE) return
      const topics = offerTopics(c, car, rng.testDrive)
      commit(k, reduceCustomers(s.customers, { type: 'topics', id, topics }))
      // A salesperson riding along picks one at once, the better the more skilled.
      const rider = s.roster.find((e) => e.id === c.drive!.by)
      if (!rider) return
      const topic = staffTopic(rider.skill, c, car, topics, rng.testDrive)
      const point = { topic, fit: topicFit(c, car, topic) }
      commit(k, reduceCustomers(get().customers, { type: 'point', id, point }))
    },
    pickTopic: (index) => {
      const s = get()
      const c = dealCustomer(s.customers, PLAYER_ID)
      const topic = c?.phase === 'driving' ? c.drive?.offered?.[index] : undefined
      const car = topic && s.inventory.find((x) => x.id === c!.drive!.carId)
      if (!topic || !car) return
      const point = { topic, fit: topicFit(c!, car, topic) }
      commit(k, reduceCustomers(s.customers, { type: 'point', id: c!.id, point }))
    },
    walkIn: (variant) => {
      const s = get()
      if (s.screen !== 'playing' || isClosed(s.clock) || s.clock.minute > LAST_ARRIVAL_MINUTE) {
        return null
      }
      // Passers-by come alone: a couple would need a companion out of thin air.
      const opts = arrivalOpts(k)
      const picked = pickArchetype(rng.walkIn, opts.skew && skewWeights(opts.skew))
      const archetype = picked === 'couple' ? 'regular' : picked
      const id = nextCustomerId()
      const [c] = withShopperRolls(
        k,
        withQuotes(k, [
          generateCustomer(id, availableCars(s.inventory), rng.walkIn, {
            ...opts,
            variant,
            archetype,
            source: 'walk-in',
          }),
        ]),
      )
      set({ dayStats: tallyMissed(k, recordVisitors(s.dayStats, [c]), [c]) })
      commit(k, [...s.customers, c])
      return id
    },
    devSpawnCustomers: (n) => {
      const s = get()
      if (isClosed(s.clock) || n <= 0) return
      const stock = availableCars(s.inventory)
      const arrived = withShopperRolls(
        k,
        Array.from({ length: n }, () =>
          generateCustomer(nextCustomerId(), stock, rng.customer, arrivalOpts(k)),
        ),
      )
      set({ dayStats: tallyMissed(k, recordVisitors(s.dayStats, arrived), arrived) })
      commit(k, [...s.customers, ...arrived])
    },
  }
}

/** Gives each shopper in `arrived` their credit, on its own rng. */
export function withCredit(k: Kit, arrived: readonly Customer[]): Customer[] {
  return assignCredit(arrived, rng.credit, tuning(k).creditMix)
}

/**
 * What every new shopper gets rolled on arrival, each on its own rng: their
 * credit, and whether they'll ask for a test drive.
 */
export function withShopperRolls(k: Kit, arrived: readonly Customer[]): Customer[] {
  return assignDriveAsk(withCredit(k, arrived), rng.driveAsk)
}

/** Some of `arrived` have been to the rival's lot first and carry his price. */
export function withQuotes(k: Kit, arrived: readonly Customer[]): Customer[] {
  const s = k.get()
  return assignQuotes(
    arrived,
    s.rival,
    s.dayStats.rival?.share ?? 0,
    rng.quote,
    loyalIds(s.clients),
  )
}

/** Counts one more of the rival's quote-holders lost to him, or matched and sold to. */
function tallyRival(k: Kit, key: keyof Pick<RivalStats, 'lost' | 'matched'>): void {
  const stats = k.get().dayStats
  if (!stats.rival) return
  k.set({ dayStats: { ...stats, rival: { ...stats.rival, [key]: stats.rival[key] + 1 } } })
}

/** The player greets customer `id` (or a seller, to talk about their car). */
export function greet(k: Kit, id: string): void {
  const s = k.get()
  const c = s.customers.find((x) => x.id === id)
  if (!c) return
  // A seller wants to talk about their own car.
  const carId = c.selling ? null : chooseTarget(c, availableCars(s.inventory))
  commit(k, reduceCustomers(s.customers, { type: 'greet', id, carId, by: PLAYER_ID }))
  if (c.selling) return
  if (carId === null) notify(k, `${c.name}: "Nothing here for me, sorry."`)
}

/**
 * Asks customer `id` for their car: `price`, or the suggested ask (see
 * `suggestedAsk`), with `allowance` (or the suggested one) for any trade-in.
 */
export function offer(k: Kit, id: string, price?: number, allowance?: number): void {
  const s = k.get()
  const c = s.customers.find((x) => x.id === id)
  if (c?.selling) return buyOffer(k, c, price)
  const car = s.inventory.find((x) => x.id === c?.targetCarId)
  if (!c || !car || car.status !== 'available') {
    return notify(k, "That car isn't for sale any more.")
  }
  const allow = tradeAllowance(k, c, allowance ?? suggestedAllowance(c))
  const ask = Math.max(
    allow ?? 0,
    price === undefined ? suggestedAsk(c, car, allow) : clampAsk(c, car, price, allow),
  )
  const ev = { type: 'offer', id, carId: car.id, price: ask, allowance: allow } as const
  commit(k, reduceCustomers(s.customers, ev))
}

/**
 * What we can allow for `c`'s trade-in: `allowance` within reason, or
 * undefined when they have none or there's no lot space to take it.
 */
export function tradeAllowance(k: Kit, c: Customer, allowance: number): number | undefined {
  return c.trade && lotSlotFor(k.get()) ? clampAllowance(c, allowance) : undefined
}

/**
 * Offers seller `c` `price` for their car, or the suggested offer (see
 * `suggestedBuy`). Not while there's no lot space for it or not enough cash.
 */
function buyOffer(k: Kit, c: Customer, price?: number): void {
  const s = k.get()
  const bid = price === undefined ? suggestedBuy(c) : clampBuy(c, price)
  const blocker = buyBlocker(s, bid)
  if (blocker) return notify(k, blocker)
  const ev = { type: 'offer', id: c.id, carId: vehicleTargetId(c.id), price: bid } as const
  commit(k, reduceCustomers(s.customers, ev))
}

/**
 * Seller `c` answers our offer. A yes buys the car: cash goes now, and the
 * car stays in customer parking, holding a lot space, until closing.
 */
function answerSeller(k: Kit, c: Customer): void {
  const s = k.get()
  const price = c.offer!.price
  const res = respondToBuyOffer(c, price, rng.deal)
  if (res.answer === 'accept') {
    const id = nextUsedId([...s.inventory, ...s.purchases], s.clock.day)
    const blocker = buyBlocker(s, price)
    const purchase = blocker ? null : purchaseOf(c, price, s, id)
    if (!purchase) {
      // The last space went, or the cash, while they thought it over.
      commit(k, reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
      return notify(k, blocker ?? 'The deal fell through.')
    }
    k.set({
      cash: s.cash - price,
      purchases: [...s.purchases, purchase],
      dayStats: {
        ...s.dayStats,
        bought: [
          ...s.dayStats.bought,
          { ...boughtRecord(purchase, s.clock.day), hope: c.selling?.hope },
        ],
      },
    })
    commit(k, reduceCustomers(k.get().customers, { type: 'respond', id: c.id, answer: 'accept' }))
    const buyer = s.roster.find((e) => e.id === c.handlerId)
    return notify(
      k,
      `${buyer ? `${buyer.name} bought` : 'Bought'} ${c.name}'s ${carName(purchase.car.model)} for ${formatMoney(price)}. It goes on the lot tonight.`,
    )
  }
  const counter = res.answer === 'counter' ? res.counter : undefined
  commit(
    k,
    reduceCustomers(s.customers, { type: 'respond', id: c.id, answer: res.answer, counter }),
  )
  // Staff haggles go on quietly.
  if (c.handlerId !== PLAYER_ID) return
  if (res.answer === 'counter') notify(k, `${c.name}: "I'd want ${formatMoney(res.counter)}."`)
  else notify(k, `${c.name}: "${walkLine(res.reason)}"`)
}

/** The player finished looking over the car with target id `targetId`. */
export function appraiseCar(k: Kit, targetId: string): void {
  const s = k.get()
  const c = s.customers.find((x) => x.id === vehicleOwnerId(targetId))
  const estimate =
    c && appraiseFor(c, s.clock.day, PLAYER_SKILL, rng.deal, tuning(k).appraisalNoise)
  if (!c?.vehicle || !estimate) return
  commit(k, reduceCustomers(s.customers, { type: 'appraised', id: c.id, estimate }))
  const { low, high } = estimateRange(estimate)
  notify(
    k,
    `You'd put ${c.name}'s ${carName(c.vehicle.car.model)} at ${formatMoney(low)}–${formatMoney(high)}.`,
  )
}

/**
 * Signs `c`'s paperwork: sells the car at the offer price, logs the sale and
 * sends them home happy. `signer` is the employee at the desk (finance, or
 * the salesperson), null for the player. `deal` is the loan and the F&I
 * menu, when they had them: an extended warranty taken becomes a contract,
 * and its chargebacks are rolled. Returns the sale, or null if the car can't be sold.
 */
export function sign(
  k: Kit,
  c: Customer,
  signer: Employee | null,
  deal?: FiDeal | null,
): Sale | null {
  const { get, set } = k
  const s = get()
  const car = s.inventory.find((x) => x.id === c.offer?.carId)
  if (!c.offer || !car || car.status !== 'available') return null
  const { price, allowance } = c.offer
  // Their trade-in, if it's in the deal, takes a lot space; none left and the deal is off.
  const traded =
    allowance === undefined
      ? null
      : purchaseOf(c, allowance, s, nextUsedId([...s.inventory, ...s.purchases], s.clock.day))
  if (allowance !== undefined && !traded) return null
  if (!get().sellCar(car.id, price)) return null
  // The loan and the products taken; a salesperson's loan comes without the menu.
  const fi = deal ? saleFi(c, deal, netPrice(c.offer)) : undefined
  const menu = signer === null || signer.role === 'finance'
  const quote = quoteFor(c, car)
  if (quote !== null && price <= quote) tallyRival(k, 'matched')
  const sale = saleRecord(c, car, {
    price,
    day: s.clock.day,
    minute: s.clock.minute,
    roster: s.roster,
    signer,
    book: s.clients,
    tradePrice: traded?.price ?? null,
    fi,
  })
  // The client who sent them gets the referral fee.
  const fee = s.clients.some((x) => x.id === c.referredBy) ? s.clientPerks.referralFee : 0
  // Some of the F&I will come back as chargebacks, the harder sold the likelier.
  const chargebacks = fi
    ? rollChargebacks(
        fi,
        {
          day: s.clock.day,
          customerName: c.name,
          tier: c.credit?.finance ? c.credit.tier : null,
          financeId: signer?.role === 'finance' ? signer.id : null,
          scale: tuning(k).chargebackScale,
        },
        rng.chargeback,
      )
    : []
  // An extended warranty is a contract: the car comes back for repairs it pays for.
  const warranty = fi?.products.find((p) => p.id === 'warranty')
  const contract =
    warranty &&
    newContract(
      `contract-${s.clock.day}-${s.contracts.filter((x) => x.soldDay === s.clock.day).length + 1}`,
      c.name,
      clientCarOf(car, price, s.clock.day),
      s.clock.day,
      warranty.price,
    )
  const stats = get().dayStats
  const drove = c.drive?.back ? 1 : 0
  set({
    dayStats: {
      ...stats,
      sales: [...stats.sales, sale],
      drives: { ...stats.drives, bought: stats.drives.bought + drove },
      bought: traded ? [...stats.bought, boughtRecord(traded, s.clock.day, true)] : stats.bought,
      clients: { ...stats.clients, referralFees: stats.clients.referralFees + fee },
      fi: addFiSale(stats.fi, c.credit, fi, menu),
    },
    monthFi: addFiSale(get().monthFi, c.credit, fi, menu),
    // Less the referral fee and their trade-in, which we pay for out of the
    // price, and with the F&I gross (the lender's reserve and the products).
    cash: get().cash - fee - (traded?.price ?? 0) + (fi?.gross ?? 0),
    // Only new cars count toward the manufacturer's quota.
    monthSales: car.used ? get().monthSales : addSale(get().monthSales, car.msrp),
    // Their car goes on the lot tonight.
    ...(traded && { purchases: [...get().purchases, traded] }),
    ...(chargebacks.length > 0 && { chargebacks: [...get().chargebacks, ...chargebacks] }),
    ...(contract && { contracts: addContracts(get().contracts, [contract]) }),
  })
  commit(k, reduceCustomers(get().customers, { type: 'signed', id: c.id, traded: !!traded, deal }))
  tallyWork(k, sale.sellerId, 'sales')
  tallyWork(k, signer?.id, 'signings')
  return sale
}

/**
 * The player, at the desk with their buyer, finished the paperwork: on to
 * the F&I menu. A buyer no lender will take, who can't put more down, goes home.
 */
export function closeDeal(k: Kit): void {
  const s = k.get()
  const c = dealCustomer(s.customers, PLAYER_ID)
  const car = c?.offer && s.inventory.find((x) => x.id === c.offer!.carId)
  if (c?.phase !== 'signing' || !c.offer || car?.status !== 'available') {
    endDeal(k, ['signing'])
    return notify(k, 'The deal fell through.')
  }
  const net = netPrice(c.offer)
  const deal = openDeal(c, net)
  commit(k, reduceCustomers(s.customers, { type: 'menu', id: c.id, deal }))
  if (loanDeclined(c, deal) && moreDownFor(c, net) === null) declineBuyer(k, c)
}

/** The player's buyer at the F&I menu, if they have one there. */
function menuCustomer(k: Kit): Customer | null {
  const c = dealCustomer(k.get().customers, PLAYER_ID)
  return c?.phase === 'menu' ? c : null
}

/** No lender will take `c`, and they can't put more down: they go home without the car. */
export function declineBuyer(
  k: Kit,
  c: Customer,
  line = `No lender will take ${c.name}'s loan, and they can't put more down. They went home.`,
): void {
  commit(k, reduceCustomers(k.get().customers, { type: 'declined', id: c.id }))
  const { dayStats: stats, monthFi } = k.get()
  k.set({
    dayStats: { ...stats, fi: { ...stats.fi, declined: stats.fi.declined + 1 } },
    monthFi: { ...monthFi, declined: monthFi.declined + 1 },
  })
  notify(k, line)
}

/**
 * The loan employee `e` arranges for `c` at their desk: the finance manager
 * runs the whole menu by his skill, a salesperson takes the first lender at
 * the buy rate and presents nothing. Null when no lender takes them (a
 * finance manager has already tried more down).
 */
export function staffDeal(k: Kit, c: Customer, e: Employee): FiDeal | null {
  if (!c.offer) return null
  const net = netPrice(c.offer)
  return e.role === 'finance'
    ? staffMenu(e.skill, c, net, rng.fi, tuning(k).productTake)
    : deskLoan(c, net)
}

/** " Their Summit Sedan goes on the lot tonight." after a sale with a trade-in. */
export function tradeLine(sale: Sale): string {
  return sale.trade ? ` Their ${carName(sale.trade.model)} goes on the lot tonight.` : ''
}

/**
 * The player takes customer `id`, whom they're talking to, for a test drive:
 * the drive's length is rolled, the car goes out (see `syncCarsOut`) and the
 * player heads for it, the shopper walking along.
 */
export function startDrive(k: Kit, id: string): void {
  const s = k.get()
  const c = s.customers.find((x) => x.id === id)
  if (!c) return
  const blocker = c.handlerId === PLAYER_ID ? driveBlocker(c, s.inventory) : `${c.name} is busy.`
  const car = drivableCar(c, s.inventory).car
  if (blocker || !car) return notify(k, blocker ?? "There's nothing to drive.")
  const minutes = driveMinutes(rng.testDrive)
  commit(
    k,
    reduceCustomers(s.customers, { type: 'testDrive', id, carId: car.id, by: PLAYER_ID, minutes }),
  )
  k.set({ moveOrder: null, menu: null, inspectedId: null })
  dispatch(k, { type: 'request', id: nextActionId(), targetId: car.id, action: 'ride' })
  // A showroom car stays on its platform: they drive its twin off the lot.
  const twin = car.id !== c.targetCarId ? ' The one on the lot, then.' : ''
  notify(k, `${c.name}: "Let's take the ${carName(car.model)} out!${twin}"`)
}

/** The player got in the test drive car `carId`: their shopper gets in and they're off. */
export function board(k: Kit, carId: string): void {
  const c = dealCustomer(k.get().customers, PLAYER_ID)
  if (c?.phase !== 'talking' || c.drive?.carId !== carId || c.drive.back) return
  commit(k, reduceCustomers(k.get().customers, { type: 'boarded', id: c.id }))
}

/** At the desk with a buyer: the finance manager takes them from here. */
export function handOff(k: Kit): void {
  const s = k.get()
  // Things may have changed on the way over (e.g. the finance manager was let go).
  const blocker = actionBlocker('handOff', DESK_CHAIR_ID, s.customers, s.roster, s.inventory)
  if (blocker) return notify(k, blocker)
  const fm = financeOnDuty(s.roster)!
  const c = dealCustomer(s.customers, PLAYER_ID)!
  commit(k, reduceCustomers(s.customers, { type: 'handOff', id: c.id, to: fm.id }))
  const queued = k.get().customers.find((x) => x.id === c.id)?.phase === 'queued'
  notify(
    k,
    queued
      ? `${c.name} will wait in the lounge for ${fm.name}.`
      : `${fm.name} will take it from here.`,
  )
}
