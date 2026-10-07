import { create } from 'zustand'
import { reduceAction, type ActionEvent, type ActiveAction } from '../sim/actions'
import { pickArchetype, skewWeights } from '../sim/archetypes'
import {
  DEFAULT_AUDIO_SETTINGS,
  withVolume,
  type AudioBus,
  type AudioSettings,
} from '../sim/audioSettings'
import { calendarOf, DAYS_PER_MONTH, weekdayTraffic } from '../sim/calendar'
import type { CustomerVariant } from '../sim/characters'
import { browseDirt, dirtyOvernight, smudgeCar, washCar } from '../sim/cleanliness'
import { isClosed, startOfDay, toStep, type GameTime } from '../sim/clock'
import {
  chooseTarget,
  generateCustomer,
  PLAYER_ID,
  PLAYER_SKILL,
  reduceCustomers,
  skillBonus,
  type Customer,
  type CustomerEvent,
  type CustomerPhase,
} from '../sim/customers'
import {
  actionBlocker,
  callNextBuyer,
  CONVERSATION_PHASES,
  customerActions,
  DEAL_PHASES,
  dealCustomer,
  emptyStats,
  hasBuyersInHand,
  isCustomerAction,
  recordDepartures,
  recordMissed,
  recordVisitors,
  type DayStats,
  type Sale,
} from '../sim/deal'
import { eventNotice, eventOn } from '../sim/events'
import { carName, type ActionId } from '../sim/interactables'
import { clampAsk, respondToAsk, staffAsk, suggestedAsk, walkLine } from '../sim/negotiation'
import { DEFAULT_DIFFICULTY, TUNING, type Difficulty, type Tuning } from '../sim/difficulty'
import { dailyInterest, payoffOnSale } from '../sim/floorPlan'
import { DESK_CHAIR_ID, type CarModel } from '../sim/layout'
import {
  availableCars,
  buildInventory,
  dropSold,
  restock,
  sellCar as markSold,
  type InventoryCar,
} from '../sim/inventory'
import {
  buyImprovement,
  effectsOf,
  IMPROVEMENTS,
  installed,
  type ImprovementId,
  type OwnedImprovement,
} from '../sim/improvements'
import {
  CHANNELS,
  launchCampaign,
  trafficBoost,
  unfinished,
  type Campaign,
  type Channel,
} from '../sim/marketing'
import {
  confrontBlocker,
  emptyNazmaStats,
  isNazmaDay,
  NAZMA_ID,
  nextTarget,
  planTheft,
  planVisit,
  stolenRecord,
  theftSeed,
  visitSeed,
  type NazmaStats,
  type NightTheft,
  type NazmaVisit,
  type RunOffBy,
  type VisitOdds,
} from '../sim/nazma'
import { generateGoal, goalLabel, isOwnerDay, judgeDay, type OwnerVisit } from '../sim/owner'
import {
  cancelOrder,
  claimedByOrder,
  deliver,
  ALL_SLOTS,
  placeOrder,
  type Financing,
  type Order,
} from '../sim/ordering'
import { addSale, emptyMonthSales, holdback, monthlyQuota, type MonthSales } from '../sim/quota'
import {
  applyChange,
  campaignScale,
  referralVisitors,
  reputationChange,
  START_REPUTATION,
  visitorScale,
  type RepScale,
} from '../sim/reputation'
import { createRng, type Rng } from '../sim/rng'
import type { SaveData } from '../sim/save'
import { LAST_ARRIVAL_MINUTE, planArrivals, takeDue, type ArrivalSchedule } from '../sim/spawner'
import {
  canHire,
  FINANCE_FEE,
  financeOnDuty,
  generateCandidates,
  isGuarded,
  patienceFactor,
  retentionRaise,
  payroll,
  reduceStaff,
  ROLE_LABELS,
  salesCommission,
  type Employee,
  type StaffEvent,
} from '../sim/staff'
import { leadChoice } from '../sim/staffAi'
import { WALL_MODES, type WallMode } from '../sim/walls'
import { WEATHER_EFFECTS, waitingOutside, weatherOn, type Weather } from '../sim/weather'
import type { TipId } from '../sim/tips'
import { formatMoney } from '../ui/format'

export interface MoveOrder {
  id: number
  tx: number
  tz: number
}

export interface ActionMenu {
  targetId: string
  /** Screen position (CSS px) the menu opens at. */
  x: number
  y: number
}

export interface Notice {
  id: number
  text: string
}

export type Screen = 'title' | 'playing'

/** The office computer panel's tabs. */
export type ComputerTab = 'stock' | 'marketing' | 'upgrades' | 'calendar'

/** Medium's starting cash; each level's is `TUNING[level].startingCash`. */
export const STARTING_CASH = TUNING[DEFAULT_DIFFICULTY].startingCash
const INVENTORY_SEED = 2026
const CUSTOMER_SEED = 7_000
const DEAL_SEED = 9_000
const STAFF_SEED = 11_000
const OWNER_SEED = 12_000
const WALK_IN_SEED = 14_000
const DELIVERY_SEED = 16_000
/** Dev-only game speeds, cycled with a key. 1 is normal. */
export const DEV_TIME_SCALES = [1, 4, 16] as const

// Discrete events only. Per-frame values live in refs / scene/runtime.ts.
interface GameState {
  /** The title screen is up: the clock and the player wait until a game is started. */
  screen: Screen
  /** Picked at New game and kept with the save. Never changes mid-game. */
  difficulty: Difficulty
  moveOrder: MoveOrder | null
  showGrid: boolean
  wallMode: WallMode
  /** Target camera yaw; changes only on a Q/E rotation (the eased value lives in runtime). */
  viewYaw: number
  /** Click-to-move and actions are mutually exclusive: setting one clears the other. */
  activeAction: ActiveAction | null
  hoveredId: string | null
  menu: ActionMenu | null
  /** Car whose info panel is open. */
  inspectedId: string | null
  notice: Notice | null
  /** Game time in 10-minute steps; the precise running time lives in scene/runtime. */
  clock: GameTime
  cash: number
  /** Changes when a car is sold, restocked, looked over (dirt), washed or paid off, and overnight. */
  inventory: InventoryCar[]
  /** Cars ordered from the manufacturer, delivered the next morning. */
  orders: Order[]
  /** Ad campaigns running or starting tomorrow. Finished ones are dropped each morning. */
  campaigns: Campaign[]
  /** Improvements bought, each with its day. One goes up the night after it's bought. */
  improvements: OwnedImprovement[]
  /** The dealership's good name, 0–100. Changes once a day, when the day is settled. */
  reputation: number
  /** Today's weather (`weatherOn(day)`), set each morning. Not saved. */
  weather: Weather
  /** The month's sales so far, toward the quota. Goes up with each sale, reset on the 1st. */
  monthSales: MonthSales
  /** The manufacturer's sales target for the month, set on the 1st. */
  quota: number
  /** The bank's one-time safety net (Easy) has covered a shortfall. Saved. */
  bailoutUsed: boolean
  /** Guided tips already shown (Easy). Saved, so a resumed game doesn't repeat them. */
  tipsSeen: TipId[]
  /** Everyone on the lot. Changes on phase changes and 10-minute patience ticks. */
  customers: Customer[]
  /** Today's arrival times and how many have shown up. */
  arrivals: ArrivalSchedule
  /** Today's visitors, sales and walk-outs, for the end-of-day summary. */
  dayStats: DayStats
  /** Everyone on the payroll. Changes on hiring, firing and shift changes (arrived, left). */
  roster: Employee[]
  /** Today's applicants. */
  candidates: Employee[]
  /** On an owner's day, their goal for it. Null on other days. */
  owner: OwnerVisit | null
  /** On a day Nazma visits, his plan and how far he's got. Null on other days. */
  nazma: NazmaVisit | null
  /** Yesterday's customers who found none of the body types they wanted (empty on a resumed game). */
  missedYesterday: DayStats['missed']
  /** The staff panel is open. */
  staffOpen: boolean
  /** The office computer panel (stock, marketing, upgrades and calendar) is open. */
  stockOpen: boolean
  /** Which tab of it shows. */
  computerTab: ComputerTab
  /** The how-to-play guide is open; the clock and the player wait while it is. */
  helpOpen: boolean
  /** The controls hint lists its keys (or gestures); collapsed it's just a header. */
  controlsOpen: boolean
  /** A touch device is held upright: the game waits behind a "rotate your device" prompt. */
  rotatePrompt: boolean
  /** Volumes and mute; a per-device preference kept apart from the save. */
  audio: AudioSettings
  /** The sound settings panel is open. */
  audioOpen: boolean
  /** Game speed multiplier for the clock and customers (dev only; always 1 otherwise). */
  timeScale: number
  issueMoveOrder: (tx: number, tz: number) => void
  clearMoveOrder: () => void
  toggleGrid: () => void
  cycleWallMode: () => void
  setViewYaw: (yaw: number) => void
  setHovered: (id: string | null) => void
  openMenu: (targetId: string, x: number, y: number) => void
  closeMenu: () => void
  requestAction: (targetId: string, action: ActionId) => void
  arriveAction: (id: number) => void
  completeAction: (id: number) => void
  cancelAction: () => void
  /** Esc: close the menu if open, otherwise stop what the player is doing, then the deal. */
  cancelAll: () => void
  /** The player walked off (WASD or a button): stops everything and ends any conversation. */
  walkAway: () => void
  /** From the customer panel: stops the player and tells a buyer in tow to wait. */
  letWait: () => void
  closeInspect: () => void
  showNotice: (text: string) => void
  clearNotice: (id: number) => void
  /** Guided tip `id` was shown; it won't be again this game. */
  markTipSeen: (id: TipId) => void
  tickClock: (t: GameTime) => void
  /** Sells a car at `price` (default MSRP). False if it isn't for sale. */
  sellCar: (id: string, price?: number) => boolean
  /** Orders a `model` for delivery tomorrow, paid in cash now or on the floor plan. False if it can't be. */
  orderCar: (model: CarModel, financing: Financing) => boolean
  /** Buys an ad campaign on `channel`, paid in cash now, to start tomorrow. False if it can't be. */
  launchCampaign: (channel: Channel) => boolean
  /** Buys improvement `id`, paid in cash now, to go up overnight. False if it can't be. */
  buyImprovement: (id: ImprovementId) => boolean
  /** Cancels an order: cash comes back, or the floor plan credit is freed. */
  cancelOrder: (id: string) => void
  /** Pays the bank a floored car's cost from cash, so it stops accruing interest. */
  payOff: (carId: string) => void
  /** Dev cheat: refills sold spaces, skipping any `canPlace` vetoes. */
  devRestock: (canPlace?: (car: InventoryCar) => boolean) => void
  /** Dev cheat: `n` customers turn up at once (for crowd checks). */
  devSpawnCustomers: (n: number) => void
  /**
   * A passer-by who looks like `variant` turns in at the driveway. Returns the
   * new customer's id, or null if the lot isn't taking visitors any more.
   */
  walkIn: (variant: CustomerVariant) => string | null
  /** The owner reached the office and tells the player today's goal. */
  ownerArrived: () => void
  /** Nazma stepped onto the lot. */
  nazmaArrived: () => void
  /** Nazma finished smudging car `carId`, the next of his targets. */
  nazmaSmudge: (carId: string) => void
  /** Nazma reached the employee he came to poach and starts talking them round. */
  nazmaChat: () => void
  /**
   * Nazma finished talking to employee `employeeId`, his target: they're
   * thinking of quitting (if they still work here and could be poached).
   */
  nazmaPoach: (employeeId: string) => void
  /** Nazma was caught on the lot and runs for the street. */
  nazmaRunOff: (by: RunOffBy) => void
  /** Nazma walked off the map. */
  nazmaLeft: () => void
  /** Progress reported by the world (or the player) for one customer. */
  dispatchCustomer: (ev: CustomerEvent) => void
  /** A customer has thought over the offer on the table and answers it: accept, counter or walk. */
  answerOffer: (id: string) => void
  /**
   * The player asks their customer `price` for the car, kept between the
   * customer's counter and the last ask (or up to MSRP to open).
   */
  ask: (price: number) => void
  /** Salesperson `employeeId` sets off to help customer `customerId`. False if they can't. */
  staffClaim: (employeeId: string, customerId: string) => boolean
  /** Salesperson `employeeId` reached the customer they claimed and greets them. */
  staffGreet: (employeeId: string) => void
  /** Salesperson `employeeId` makes their customer an offer. */
  staffOffer: (employeeId: string) => void
  /** Salesperson `employeeId`'s customer said yes: off to finance, or to their desk. */
  staffLead: (employeeId: string) => void
  /** Finance, or a salesperson at their desk, finished the paperwork for the buyer opposite. */
  staffSign: (employeeId: string, customerId: string) => void
  /** Lot porter `employeeId` finished washing car `carId`. */
  staffWash: (employeeId: string, carId: string) => void
  /** From the end-of-day summary: opens the doors on the next day. */
  startNextDay: () => void
  /** Puts one of today's candidates on the payroll. */
  hire: (id: string) => void
  /** Lets an employee go. They walk out and aren't paid for the day. */
  fire: (id: string) => void
  /** Keeps an employee who's thinking of quitting, with a raise (see `retentionRaise`). */
  keepEmployee: (id: string) => void
  /** Shift progress reported by the world for one employee. */
  dispatchStaff: (ev: StaffEvent) => void
  toggleStaffPanel: (open?: boolean) => void
  /**
   * Opens or closes the office computer panel. With a `tab` (and no `open`),
   * a panel open on another tab switches to it instead of closing.
   */
  toggleStockPanel: (open?: boolean, tab?: ComputerTab) => void
  toggleHelp: (open?: boolean) => void
  toggleControls: (open?: boolean) => void
  setRotatePrompt: (on: boolean) => void
  /** Sets one bus's volume (0–1); turning it up unmutes. */
  setVolume: (bus: AudioBus, volume: number) => void
  toggleMute: (muted?: boolean) => void
  toggleAudioPanel: (open?: boolean) => void
  cycleTimeScale: () => void
  /** From the title screen: plays a fresh day 1 at `difficulty` (Medium if not given). */
  newGame: (difficulty?: Difficulty) => void
  /** From the title screen: resumes a saved game on the morning after its last day. */
  loadGame: (save: SaveData) => void
}

let nextOrderId = 1
let nextActionId = 1
let nextNoticeId = 1
let nextCustomerId = 1

// Seeded per day, so a day plays out the same given the same choices.
/** Arrivals and new customers. */
let customerRng: Rng = createRng(CUSTOMER_SEED + 1)
/** Customers' answers to offers. */
let dealRng: Rng = createRng(DEAL_SEED + 1)
/** Job applicants. */
let staffRng: Rng = createRng(STAFF_SEED + 1)
/** Passers-by who walk in. Apart from `customerRng`, as they turn up on frames, not clock steps. */
let walkInRng: Rng = createRng(WALK_IN_SEED + 1)

/**
 * Time stands still and the player can't move behind the title screen, the
 * guide or the rotate-your-device prompt.
 */
export function isPaused(s: Pick<GameState, 'screen' | 'helpOpen' | 'rotatePrompt'>): boolean {
  return s.screen === 'title' || s.helpOpen || s.rotatePrompt
}

/** The levers of the game's difficulty level; a stable object, so fine as a selector. */
export function levelTuning(s: Pick<GameState, 'difficulty'>): Tuning {
  return TUNING[s.difficulty]
}

/**
 * What `c`'s seller adds to the odds of a yes: their skill bonus, plus what
 * the showroom improvements up today and the level add.
 */
export function sellerBonusFor(
  s: Pick<GameState, 'improvements' | 'clock' | 'difficulty' | 'roster'>,
  c: Pick<Customer, 'handlerId'>,
): number {
  const showroom =
    effectsOf(installed(s.improvements, s.clock.day)).acceptBonus + levelTuning(s).acceptBonus
  if (c.handlerId === PLAYER_ID) return skillBonus(PLAYER_SKILL) + showroom
  const e = s.roster.find((x) => x.id === c.handlerId)
  return (e ? skillBonus(e.skill) : 0) + showroom
}

/** The level's scale on reputation gains and losses. */
export function repScale(t: Tuning): RepScale {
  return { gain: t.repGain, loss: t.repLoss }
}

/** The level's odds of a visit from Nazma. */
function visitOdds(t: Tuning): VisitOdds {
  return { chance: t.nazmaChance, firstDay: t.firstNazmaDay }
}

/** The morning's word on a night's theft. */
export function theftNotice(theft: NightTheft): string {
  if (theft.outcome === 'foiled') return 'Your guard ran someone off the lot last night.'
  const { car } = theft
  const stole = `Nazma stole the ${carName(car.model)} off the lot overnight.`
  return car.floored ? `${stole} The bank called in its ${formatMoney(car.cost)} loan.` : stole
}

/** The morning's word on the bank covering yesterday's shortfall. */
export function bailoutNotice(amount: number): string {
  return `Yesterday the bank covered your ${formatMoney(amount)} shortfall. It won't do it again.`
}

/** "3 cars delivered: 2 on the lot, 1 in the showroom." */
export function deliveryNotice(cars: readonly InventoryCar[]): string {
  const lot = cars.filter((c) => c.location === 'lot').length
  const showroom = cars.length - lot
  const where = [lot > 0 && `${lot} on the lot`, showroom > 0 && `${showroom} in the showroom`]
    .filter(Boolean)
    .join(', ')
  return cars.length === 1
    ? `A ${carName(cars[0].model)} was delivered ${lot ? 'to the lot' : 'to the showroom'}.`
    : `${cars.length} cars delivered: ${where}.`
}

/**
 * What a new game's day 1 starts with at `difficulty`. The day's rng streams
 * start afresh, so day 1 plays out the same however often it's built.
 */
function dayOne(difficulty: Difficulty) {
  customerRng = createRng(CUSTOMER_SEED + 1)
  dealRng = createRng(DEAL_SEED + 1)
  staffRng = createRng(STAFF_SEED + 1)
  walkInRng = createRng(WALK_IN_SEED + 1)
  const tuning = TUNING[difficulty]
  return {
    difficulty,
    cash: tuning.startingCash,
    bailoutUsed: false,
    tipsSeen: [] as TipId[],
    quota: monthlyQuota(0, ALL_SLOTS.length, START_REPUTATION, tuning.quota),
    arrivals: planArrivals(
      customerRng,
      {},
      {
        scale: weekdayTraffic(1) * WEATHER_EFFECTS[weatherOn(1)].traffic * tuning.traffic,
        referrals: 0,
      },
    ),
    candidates: generateCandidates(staffRng, 1),
  }
}

export const useGame = create<GameState>((set, get) => {
  const notify = (text: string) => get().showNotice(text)

  /**
   * Stores a new customer list. Everything that follows from customers changing
   * happens here: after closing nobody goes back to waiting, finance calls the
   * next buyer from the lounge, walk-outs are tallied, cars that were looked
   * over get a little dirtier, and menus and actions aimed at someone who can't
   * take them any more are dropped.
   */
  const commit = (next: Customer[]) => {
    const s = get()
    const customers = callNextBuyer(
      isClosed(s.clock) ? reduceCustomers(next, { type: 'close' }) : next,
    )
    if (customers === s.customers) return
    // A customer under the cursor or menu who left, or has nothing left to offer.
    const gone = (id: string | null) => {
      if (!id || !s.customers.some((c) => c.id === id)) return false
      const c = customers.find((x) => x.id === id)
      return !c || customerActions(c).length === 0
    }
    set({
      customers,
      inventory: browseDirt(s.inventory, s.customers, customers),
      dayStats: recordDepartures(s.dayStats, s.customers, customers),
      menu: gone(s.menu?.targetId ?? null) ? null : s.menu,
      hoveredId: gone(s.hoveredId) ? null : s.hoveredId,
    })
    announceWaiting(s.customers, customers)
    settleDay()
    // Aimed at a customer who left or moved on (e.g. ran out of patience on the
    // way), or a deal to close with nobody left to sign it.
    const a = get().activeAction
    const blocker =
      a && actionBlocker(a.action, a.targetId, customers, get().roster, get().inventory)
    if (a && blocker) {
      dispatch({ type: 'cancel' })
      notify(blocker)
    }
  }

  /** The receptionist lets the player know when someone done browsing starts waiting. */
  const announceWaiting = (prev: readonly Customer[], next: readonly Customer[]) => {
    const s = get()
    if (patienceFactor(s.roster) === 1) return
    for (const c of next) {
      if (c.phase !== 'waiting') continue
      const was = prev.find((x) => x.id === c.id)?.phase
      if (was !== 'arriving' && was !== 'browsing') continue
      const carId = c.browseCarIds[c.browseCarIds.length - 1]
      const car = s.inventory.find((x) => x.id === carId)
      notify(`${c.name} is waiting ${car ? `by the ${carName(car.model)}` : 'out front'}.`)
    }
  }

  /** Counts new `arrived` customers who can't find a body type they want in stock. */
  const tallyMissed = (stats: DayStats, arrived: readonly Customer[]) =>
    recordMissed(stats, arrived, availableCars(get().inventory))

  /**
   * Pays the day's staff once the doors are shut and the last customer has gone,
   * before the summary shows, so it reports cash after payroll. On an owner's
   * day the day is judged against their goal, and any bonus is paid too. The
   * day's customers move reputation. On the month's last day the manufacturer
   * pays the holdback on the month's sales.
   */
  const settleDay = () => {
    const s = get()
    if (!isClosed(s.clock) || s.customers.length > 0 || s.dayStats.settled) return
    const { wages, commissions } = payroll(s.roster, s.dayStats.sales)
    const level = tuning()
    const interest = dailyInterest(s.inventory, level.interest)
    // A goal the player never heard (the owner didn't make it in) isn't judged.
    const owner = s.owner?.announced
      ? judgeDay(s.owner.goal, s.dayStats, s.clock.day, level.ownerBonus, repScale(level))
      : null
    const reputation = applyChange(s.reputation, reputationChange(s.dayStats, repScale(level)))
    const quota =
      calendarOf(s.clock.day).dayOfMonth === DAYS_PER_MONTH
        ? {
            quota: s.quota,
            sold: s.monthSales.count,
            payout: holdback(s.monthSales.count, s.quota, s.monthSales.msrp),
          }
        : null
    const cash =
      s.cash - wages - commissions - interest + (owner?.bonus ?? 0) + (quota?.payout ?? 0)
    // On Easy the bank covers the first time the day ends in the red.
    const bailout = level.safetyNet && !s.bailoutUsed && cash < 0 ? -cash : 0
    set({
      cash: cash + bailout,
      bailoutUsed: s.bailoutUsed || bailout > 0,
      reputation,
      dayStats: {
        ...s.dayStats,
        wages,
        commissions,
        interest,
        owner,
        reputation: reputation - s.reputation,
        quota,
        bailout,
        settled: true,
      },
    })
  }

  /** Closing time: the staff head home, and anyone still thinking of quitting goes for good. */
  const closeUp = () => {
    const before = get().roster
    setRoster(reduceStaff(before, { type: 'close' }))
    const quit = before.filter((e) => e.quitting && !e.fired).map((e) => e.name)
    if (quit.length === 0) return
    tallyNazma({ quit: [...get().dayStats.nazma.quit, ...quit] })
    notify(`${quit.join(' and ')} quit and won't be back.`)
  }

  /** Stores a new roster, dropping hovers, menus and panels aimed at anyone who's gone. */
  const setRoster = (roster: Employee[]) => {
    const s = get()
    if (roster === s.roster) return
    const gone = (id: string | null) =>
      !!id && s.roster.some((e) => e.id === id) && !roster.some((e) => e.id === id)
    set({
      roster,
      menu: gone(s.menu?.targetId ?? null) ? null : s.menu,
      hoveredId: gone(s.hoveredId) ? null : s.hoveredId,
      inspectedId: gone(s.inspectedId) ? null : s.inspectedId,
    })
    const a = s.activeAction
    if (a && gone(a.targetId)) dispatch({ type: 'cancel' })
  }

  /** Puts the player's deal customer back to waiting if they're in one of `phases`. */
  const endDeal = (phases: readonly CustomerPhase[], message?: (name: string) => string) => {
    const deal = dealCustomer(get().customers, PLAYER_ID)
    if (!deal || !phases.includes(deal.phase)) return
    commit(reduceCustomers(get().customers, { type: 'cancel', id: deal.id }))
    if (message) notify(message(deal.name))
  }

  const dispatch = (ev: ActionEvent) => {
    const prev = get().activeAction
    const { next, finished } = reduceAction(prev, ev)
    set({ activeAction: next })
    // Getting up from the desk mid-paperwork leaves the customer waiting.
    if (prev?.action === 'closeDeal' && next?.id !== prev.id && finished?.id !== prev.id) {
      endDeal(['signing'])
    }
    if (!finished) return
    switch (finished.action) {
      case 'inspect':
        return set({ inspectedId: finished.targetId })
      case 'wash':
        return wash(finished.targetId)
      case 'getCoffee':
        return notify('Ahh, fresh coffee.')
      case 'greet':
        return greet(finished.targetId)
      case 'offer':
        return offer(finished.targetId)
      case 'closeDeal':
        return closeDeal()
      case 'handOff':
        return handOff()
      case 'orderStock':
        return get().toggleStockPanel(true, 'stock')
      case 'advertise':
        return get().toggleStockPanel(true, 'marketing')
      case 'improve':
        return get().toggleStockPanel(true, 'upgrades')
      case 'calendar':
        return get().toggleStockPanel(true, 'calendar')
      case 'confront':
        return get().nazmaRunOff('player')
    }
  }

  /** Updates today's Nazma tally. */
  const tallyNazma = (change: Partial<NazmaStats>) => {
    const stats = get().dayStats
    set({ dayStats: { ...stats, nazma: { ...stats.nazma, ...change } } })
  }

  /** Stores Nazma's visit, dropping a confront aimed at him once he's no longer on the lot. */
  const setNazma = (nazma: NazmaVisit) => {
    set({ nazma })
    if (nazma.status === 'onLot') return
    const s = get()
    if (s.activeAction?.targetId === NAZMA_ID) dispatch({ type: 'cancel' })
    if (s.menu?.targetId === NAZMA_ID || s.hoveredId === NAZMA_ID) {
      set({
        menu: s.menu?.targetId === NAZMA_ID ? null : s.menu,
        hoveredId: s.hoveredId === NAZMA_ID ? null : s.hoveredId,
      })
    }
  }

  /** Car `id` washed by the player. */
  const wash = (id: string) => {
    const inventory = washCar(get().inventory, id)
    if (inventory === get().inventory) return
    set({ inventory })
    const car = inventory.find((c) => c.id === id)
    if (car) notify(`The ${carName(car.model)} is spotless.`)
  }

  const greet = (id: string) => {
    const s = get()
    const c = s.customers.find((x) => x.id === id)
    if (!c) return
    const carId = chooseTarget(c, availableCars(s.inventory))
    commit(reduceCustomers(s.customers, { type: 'greet', id, carId, by: PLAYER_ID }))
    if (carId === null) notify(`${c.name}: "Nothing here for me, sorry."`)
  }

  /** Asks customer `id` for their car: `price`, or the suggested ask (see `suggestedAsk`). */
  const offer = (id: string, price?: number) => {
    const s = get()
    const c = s.customers.find((x) => x.id === id)
    const car = s.inventory.find((x) => x.id === c?.targetCarId)
    if (!c || !car || car.status !== 'available') return notify("That car isn't for sale any more.")
    const ask = price === undefined ? suggestedAsk(c, car) : clampAsk(c, car, price)
    commit(reduceCustomers(s.customers, { type: 'offer', id, carId: car.id, price: ask }))
  }

  /** The customer salesperson `employeeId` is dealing with in `phases`, if any. */
  const staffCustomer = (employeeId: string, phases: readonly CustomerPhase[]) =>
    get().customers.find((c) => c.handlerId === employeeId && phases.includes(c.phase))

  /** The levers of the game's difficulty level. */
  const tuning = () => levelTuning(get())

  /** What the improvements up today add up to. */
  const upEffects = () => {
    const s = get()
    return effectsOf(installed(s.improvements, s.clock.day))
  }

  /**
   * What a new customer brings in with them today: the level's patience and
   * hoped-for discount, the showroom's cut to that discount, and on a sale
   * weekend a bigger hoped-for discount and a lean toward bargain hunters.
   */
  const arrivalOpts = () => {
    const event = eventOn(get().clock.day)
    const level = tuning()
    return {
      patienceFactor: level.patience,
      expectShift: level.expect,
      expectCut: upEffects().expectCut,
      ...(event && { extraDiscount: event.extraDiscount, skew: event.skew }),
    }
  }

  const sellerBonus = (c: Customer) => sellerBonusFor(get(), c)

  /**
   * Signs `c`'s paperwork: sells the car at the offer price, logs the sale and
   * sends them home happy. `signer` is the employee at the desk (finance, or
   * the salesperson), null for the player. Returns the sale, or null if the car
   * can't be sold.
   */
  const sign = (c: Customer, signer: Employee | null): Sale | null => {
    const s = get()
    const car = s.inventory.find((x) => x.id === c.offer?.carId)
    if (!c.offer || !car || !get().sellCar(car.id, c.offer.price)) return null
    const price = c.offer.price
    // Who made the sale. A salesperson let go since is no longer on the roster.
    const seller =
      c.sellerId && c.sellerId !== PLAYER_ID
        ? (s.roster.find((e) => e.id === c.sellerId)?.name ?? 'Former staff')
        : null
    const finance = signer?.role === 'finance' ? signer : null
    const sale: Sale = {
      customerName: c.name,
      carId: car.id,
      model: car.model,
      price,
      msrp: car.msrp,
      cost: car.cost,
      minute: s.clock.minute,
      soldBy: seller,
      signedBy: finance?.name ?? null,
      commission: (seller ? salesCommission(price, car.cost) : 0) + (finance ? FINANCE_FEE : 0),
      source: c.source,
    }
    set({
      dayStats: { ...get().dayStats, sales: [...get().dayStats.sales, sale] },
      monthSales: addSale(get().monthSales, car.msrp),
    })
    commit(reduceCustomers(get().customers, { type: 'signed', id: c.id }))
    return sale
  }

  const closeDeal = () => {
    const c = dealCustomer(get().customers, PLAYER_ID)
    const sale = c?.phase === 'signing' ? sign(c, null) : null
    if (!sale) {
      endDeal(['signing'])
      return notify('The deal fell through.')
    }
    notify(
      `Sold the ${carName(sale.model)} to ${sale.customerName} for ${formatMoney(sale.price)}!`,
    )
  }

  /** At the desk with a buyer: the finance manager takes them from here. */
  const handOff = () => {
    const s = get()
    // Things may have changed on the way over (e.g. the finance manager was let go).
    const blocker = actionBlocker('handOff', DESK_CHAIR_ID, s.customers, s.roster, s.inventory)
    if (blocker) return notify(blocker)
    const fm = financeOnDuty(s.roster)!
    const c = dealCustomer(s.customers, PLAYER_ID)!
    commit(reduceCustomers(s.customers, { type: 'handOff', id: c.id, to: fm.id }))
    const queued = get().customers.find((x) => x.id === c.id)?.phase === 'queued'
    notify(
      queued
        ? `${c.name} will wait in the lounge for ${fm.name}.`
        : `${fm.name} will take it from here.`,
    )
  }

  /**
   * Opens the doors on `day`: sold cars are gone, Nazma may have stolen one
   * off the lot (the bank calls in its loan if it was floored), the rest have
   * gathered a night's dust (more out on the lot after rain), yesterday's
   * orders are parked in their slots, finished ad campaigns end, there are new
   * arrivals (more while ads run, and more or fewer with reputation, the
   * weekday, the weather and any sale weekend) and applicants, and the staff
   * head in. On the 1st the manufacturer sets the month's quota, from
   * reputation. A sale weekend is announced a week ahead and on its first day.
   */
  const beginDay = (day: number) => {
    const weather = weatherOn(day)
    const date = calendarOf(day)
    const event = eventOn(day)
    const effects = WEATHER_EFFECTS[weather]
    customerRng = createRng(CUSTOMER_SEED + day)
    dealRng = createRng(DEAL_SEED + day)
    staffRng = createRng(STAFF_SEED + day)
    walkInRng = createRng(WALK_IN_SEED + day)
    const s = get()
    const delivered = deliver(s.orders, createRng(DELIVERY_SEED + day), day)
    const campaigns = unfinished(s.campaigns, day)
    const kept = dropSold(s.inventory)
    const level = tuning()
    const guarded = isGuarded(s.roster)
    const theft = planTheft(createRng(theftSeed(day)), day, kept, guarded, level.theftChance)
    const stolen = theft?.outcome === 'stolen' ? theft.car : null
    const inventory = [
      ...dirtyOvernight(stolen ? kept.filter((c) => c !== stolen) : kept, effects.lotDirt),
      ...delivered,
    ]
    const salesStaff = s.roster.filter((e) => e.role === 'sales' && !e.fired).length
    const nazma = isNazmaDay(day, guarded, visitOdds(level))
      ? planVisit(createRng(visitSeed(day)), inventory, s.roster, level.poachChance)
      : null
    const newMonth = date.dayOfMonth === 1
    const owner = isOwnerDay(day)
      ? {
          goal: generateGoal(createRng(OWNER_SEED + day), inventory, salesStaff, !!event),
          announced: false,
        }
      : null
    // GameClock picks up the new day and resyncs the running time.
    set({
      clock: startOfDay(day),
      weather,
      monthSales: newMonth ? emptyMonthSales() : s.monthSales,
      quota: newMonth
        ? monthlyQuota(date.month, ALL_SLOTS.length, s.reputation, level.quota)
        : s.quota,
      inventory,
      orders: [],
      campaigns,
      arrivals: planArrivals(
        customerRng,
        trafficBoost(campaigns, day, campaignScale(s.reputation)),
        {
          scale:
            visitorScale(s.reputation) *
            weekdayTraffic(day) *
            effects.traffic *
            (event?.traffic ?? 1) *
            level.traffic,
          referrals: referralVisitors(s.reputation),
        },
      ),
      cash: s.cash - (stolen?.floored ? stolen.cost : 0),
      dayStats: {
        ...emptyStats(),
        nazma: {
          ...emptyNazmaStats(),
          stolen: stolen ? [stolenRecord(stolen)] : [],
          foiled: theft?.outcome === 'foiled',
        },
      },
      missedYesterday: s.dayStats.missed,
      candidates: generateCandidates(staffRng, day),
      owner,
      nazma,
    })
    setRoster(reduceStaff(get().roster, { type: 'open' }))
    const notices = [
      s.dayStats.bailout > 0 && bailoutNotice(s.dayStats.bailout),
      eventNotice(day),
      theft && theftNotice(theft),
      delivered.length > 0 && deliveryNotice(delivered),
    ].filter((t): t is string => !!t)
    if (notices.length > 0) notify(notices.join(' '))
  }

  return {
    screen: 'title',
    moveOrder: null,
    showGrid: false,
    wallMode: 'cutaway',
    viewYaw: Math.PI / 4,
    activeAction: null,
    hoveredId: null,
    menu: null,
    inspectedId: null,
    notice: null,
    ...dayOne(DEFAULT_DIFFICULTY),
    clock: startOfDay(1),
    inventory: buildInventory(createRng(INVENTORY_SEED)),
    orders: [],
    campaigns: [],
    improvements: [],
    reputation: START_REPUTATION,
    weather: weatherOn(1),
    monthSales: emptyMonthSales(),
    customers: [],
    dayStats: emptyStats(),
    roster: [],
    owner: null,
    nazma: null,
    missedYesterday: {},
    staffOpen: false,
    stockOpen: false,
    computerTab: 'stock',
    helpOpen: false,
    controlsOpen: true,
    rotatePrompt: false,
    audio: DEFAULT_AUDIO_SETTINGS,
    audioOpen: false,
    timeScale: 1,
    issueMoveOrder: (tx, tz) => {
      dispatch({ type: 'cancel' })
      set({ moveOrder: { id: nextOrderId++, tx, tz }, menu: null })
      // Walking off mid-conversation; someone following just keeps following.
      endDeal(CONVERSATION_PHASES)
    },
    clearMoveOrder: () => set({ moveOrder: null }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    cycleWallMode: () =>
      set((s) => ({
        wallMode: WALL_MODES[(WALL_MODES.indexOf(s.wallMode) + 1) % WALL_MODES.length],
      })),
    setViewYaw: (viewYaw) => set({ viewYaw }),
    setHovered: (hoveredId) => {
      if (get().hoveredId !== hoveredId) set({ hoveredId })
    },
    openMenu: (targetId, x, y) => set({ menu: { targetId, x, y } }),
    closeMenu: () => set({ menu: null }),
    requestAction: (targetId, action) => {
      const s = get()
      const blocker =
        action === 'confront'
          ? confrontBlocker(s.nazma)
          : actionBlocker(action, targetId, s.customers, s.roster, s.inventory)
      if (blocker) {
        set({ menu: null })
        return notify(blocker)
      }
      // Turning to someone else ends the conversation; greeting someone else also
      // drops a customer who was following.
      const deal = dealCustomer(get().customers, PLAYER_ID)
      if (deal && deal.id !== targetId) {
        endDeal(isCustomerAction(action) ? DEAL_PHASES : CONVERSATION_PHASES)
      }
      set({ moveOrder: null, menu: null, inspectedId: null })
      dispatch({ type: 'request', id: nextActionId++, targetId, action })
    },
    arriveAction: (id) => dispatch({ type: 'arrive', id, now: performance.now() }),
    completeAction: (id) => dispatch({ type: 'complete', id }),
    cancelAction: () => dispatch({ type: 'cancel' }),
    cancelAll: () => {
      const s = get()
      if (s.helpOpen) return set({ helpOpen: false })
      if (s.audioOpen) return set({ audioOpen: false })
      if (s.menu) return set({ menu: null })
      if (s.staffOpen) return set({ staffOpen: false })
      if (s.stockOpen) return set({ stockOpen: false })
      const busy = s.activeAction || s.moveOrder || s.inspectedId
      dispatch({ type: 'cancel' })
      set({ moveOrder: null, inspectedId: null })
      // A first Esc stops what the player is doing; with nothing left to stop it
      // lets a customer who was following wait instead.
      if (busy) endDeal(CONVERSATION_PHASES)
      else endDeal(DEAL_PHASES, (name) => `${name} will wait for you.`)
    },
    walkAway: () => {
      dispatch({ type: 'cancel' })
      set({ moveOrder: null })
      endDeal(CONVERSATION_PHASES)
    },
    letWait: () => {
      dispatch({ type: 'cancel' })
      set({ moveOrder: null })
      endDeal(DEAL_PHASES, (name) => `${name} will wait for you.`)
    },
    closeInspect: () => set({ inspectedId: null }),
    showNotice: (text) => set({ notice: { id: nextNoticeId++, text } }),
    clearNotice: (id) => {
      if (get().notice?.id === id) set({ notice: null })
    },
    markTipSeen: (id) => {
      const seen = get().tipsSeen
      if (!seen.includes(id)) set({ tipsSeen: [...seen, id] })
    },
    tickClock: (t) => {
      const step = toStep(t)
      const s = get()
      if (step.day === s.clock.day && step.minute === s.clock.minute) return
      // Waiting customers lose patience, new ones arrive, and at closing everyone
      // heads out (`commit` applies the close).
      const minutes = step.day === s.clock.day ? step.minute - s.clock.minute : 0
      // A receptionist keeps waiting customers company, and a comfy waiting
      // area keeps them happy, so they last longer. Rain and heat wear down
      // those left waiting out on the lot.
      const except = s.activeAction?.targetId
      const { patienceSaved } = upEffects()
      const drain = minutes * patienceFactor(s.roster) * (1 - patienceSaved)
      const outsideFactor = WEATHER_EFFECTS[s.weather].lotPatience
      let customers = reduceCustomers(s.customers, {
        type: 'tick',
        minutes: drain,
        except,
        ...(outsideFactor !== 1 && {
          outside: waitingOutside(s.customers, s.inventory),
          outsideFactor,
        }),
      })
      const { schedule, due } = takeDue(s.arrivals, step.minute)
      const stock = availableCars(s.inventory)
      const arrived = due.map((source) =>
        generateCustomer(`customer-${nextCustomerId++}`, stock, customerRng, {
          source,
          ...arrivalOpts(),
        }),
      )
      customers = [...customers, ...arrived]
      set({
        clock: step,
        arrivals: schedule,
        dayStats: tallyMissed(recordVisitors(s.dayStats, arrived), arrived),
      })
      if (isClosed(step)) closeUp()
      commit(customers)
      settleDay()
    },
    sellCar: (id, price) => {
      const s = get()
      const car = s.inventory.find((c) => c.id === id)
      const inventory = markSold(s.inventory, id)
      if (!car || inventory === s.inventory) return false
      // The car is gone: drop anything that still points at it.
      if (s.activeAction?.targetId === id) dispatch({ type: 'cancel' })
      // The bank takes back what it lent on a floored car; the rest is ours.
      set({
        inventory,
        cash: s.cash + (price ?? car.msrp) - payoffOnSale(car),
        menu: s.menu?.targetId === id ? null : s.menu,
        hoveredId: s.hoveredId === id ? null : s.hoveredId,
        inspectedId: s.inspectedId === id ? null : s.inspectedId,
      })
      return true
    },
    orderCar: (model, financing) => {
      const s = get()
      const result = placeOrder(s, model, financing, s.clock.day, tuning().invoice)
      if (!result.ok) {
        notify(result.reason)
        return false
      }
      set({ orders: result.orders, cash: result.cash })
      const how = financing === 'cash' ? 'paid cash' : 'on the floor plan'
      notify(
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
        notify(result.reason)
        return false
      }
      const { label, cost, days } = CHANNELS[channel]
      set({
        cash: result.cash,
        campaigns: result.campaigns,
        dayStats: { ...s.dayStats, marketing: s.dayStats.marketing + cost },
      })
      notify(`${label} booked for ${formatMoney(cost)}. It runs for ${days} days from tomorrow.`)
      return true
    },
    buyImprovement: (id) => {
      const s = get()
      const result = buyImprovement(s, id, s.clock.day)
      if (!result.ok) {
        notify(result.reason)
        return false
      }
      const { label, cost } = IMPROVEMENTS[id]
      set({
        cash: result.cash,
        improvements: result.improvements,
        dayStats: { ...s.dayStats, improvements: s.dayStats.improvements + cost },
      })
      notify(`Bought the ${label.toLowerCase()} for ${formatMoney(cost)}. It goes up overnight.`)
      return true
    },
    cancelOrder: (id) => {
      const s = get()
      const order = s.orders.find((o) => o.id === id)
      if (!order) return
      set(cancelOrder(s, id))
      notify(`Cancelled the ${carName(order.model)}.`)
    },
    payOff: (carId) => {
      const s = get()
      const car = s.inventory.find((c) => c.id === carId)
      if (!car || car.status !== 'available' || !car.floored) return
      if (s.cash < car.cost) return notify('Not enough cash to pay it off.')
      set({
        cash: s.cash - car.cost,
        inventory: s.inventory.map((c) => (c === car ? { ...c, floored: false } : c)),
      })
      notify(`Paid off the ${carName(car.model)}.`)
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
    devSpawnCustomers: (n) => {
      const s = get()
      if (isClosed(s.clock) || n <= 0) return
      const stock = availableCars(s.inventory)
      const arrived = Array.from({ length: n }, () =>
        generateCustomer(`customer-${nextCustomerId++}`, stock, customerRng, arrivalOpts()),
      )
      set({ dayStats: tallyMissed(recordVisitors(s.dayStats, arrived), arrived) })
      commit([...s.customers, ...arrived])
    },
    walkIn: (variant) => {
      const s = get()
      if (s.screen !== 'playing' || isClosed(s.clock) || s.clock.minute > LAST_ARRIVAL_MINUTE) {
        return null
      }
      // Passers-by come alone: a couple would need a companion out of thin air.
      const opts = arrivalOpts()
      const picked = pickArchetype(walkInRng, opts.skew && skewWeights(opts.skew))
      const archetype = picked === 'couple' ? 'regular' : picked
      const id = `customer-${nextCustomerId++}`
      const c = generateCustomer(id, availableCars(s.inventory), walkInRng, {
        ...opts,
        variant,
        archetype,
        source: 'walk-in',
      })
      set({ dayStats: tallyMissed(recordVisitors(s.dayStats, [c]), [c]) })
      commit([...s.customers, c])
      return id
    },
    ownerArrived: () => {
      const owner = get().owner
      if (!owner || owner.announced) return
      set({ owner: { ...owner, announced: true } })
      notify(`The owner wants: ${goalLabel(owner.goal, formatMoney)}.`)
    },
    nazmaArrived: () => {
      const s = get()
      if (s.nazma?.status !== 'coming') return
      setNazma({ ...s.nazma, status: 'onLot' })
      tallyNazma({ visited: true })
      notify(
        s.clock.day === tuning().firstNazmaDay
          ? "That's Nazma, who used to work here. He has it in for the place. Click him to run him off!"
          : 'Nazma is back on the lot.',
      )
    },
    nazmaSmudge: (carId) => {
      const s = get()
      if (s.nazma?.status !== 'onLot' || nextTarget(s.nazma) !== carId) return
      setNazma({ ...s.nazma, progress: s.nazma.progress + 1 })
      const inventory = smudgeCar(s.inventory, carId)
      if (inventory === s.inventory) return
      set({ inventory })
      tallyNazma({ smudged: get().dayStats.nazma.smudged + 1 })
      const car = inventory.find((c) => c.id === carId)
      if (car) notify(`Nazma smeared grime all over the ${carName(car.model)}.`)
    },
    nazmaChat: () => {
      const s = get()
      if (s.nazma?.status !== 'onLot' || s.nazma.scheme !== 'poach' || s.nazma.chatting) return
      setNazma({ ...s.nazma, chatting: true })
    },
    nazmaPoach: (employeeId) => {
      const s = get()
      if (s.nazma?.status !== 'onLot' || nextTarget(s.nazma) !== employeeId) return
      setNazma({ ...s.nazma, progress: s.nazma.progress + 1, chatting: false })
      const roster = reduceStaff(s.roster, { type: 'poached', id: employeeId })
      if (roster === s.roster) return
      setRoster(roster)
      const e = roster.find((x) => x.id === employeeId)!
      tallyNazma({ poached: [...get().dayStats.nazma.poached, e.name] })
      notify(
        `${e.name} is thinking of quitting. Nazma made them an offer. Keep them from the staff panel before closing.`,
      )
    },
    nazmaRunOff: (by) => {
      const s = get()
      if (s.nazma?.status !== 'onLot') return
      setNazma({ ...s.nazma, status: 'runOff', chatting: false })
      tallyNazma({ runOff: by })
      notify(by === 'player' ? 'You ran Nazma off the lot.' : 'Your guard ran Nazma off the lot.')
    },
    nazmaLeft: () => {
      const s = get()
      if (s.nazma?.status === 'onLot') setNazma({ ...s.nazma, status: 'done' })
    },
    dispatchCustomer: (ev) => commit(reduceCustomers(get().customers, ev)),
    answerOffer: (id) => {
      const s = get()
      const c = s.customers.find((x) => x.id === id)
      if (c?.phase !== 'considering' || !c.offer) return
      const car = s.inventory.find((x) => x.id === c.offer?.carId)
      const res =
        car?.status === 'available'
          ? respondToAsk(c, car, c.offer.price, dealRng, sellerBonus(c))
          : ({ answer: 'walk', reason: 'gone' } as const)
      const counter = res.answer === 'counter' ? res.counter : undefined
      commit(reduceCustomers(s.customers, { type: 'respond', id, answer: res.answer, counter }))
      // Staff deals go on quietly; the sale itself is announced.
      if (c.handlerId !== PLAYER_ID) return
      if (res.answer === 'accept') notify(`${c.name}: "Deal! Lead the way."`)
      else if (res.answer === 'counter')
        notify(`${c.name}: "How about ${formatMoney(res.counter)}?"`)
      else notify(`${c.name}: "${walkLine(res.reason)}"`)
    },
    ask: (price) => {
      const c = dealCustomer(get().customers, PLAYER_ID)
      if (c?.phase === 'talking') offer(c.id, price)
    },
    staffClaim: (employeeId, customerId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      if (!e || e.role !== 'sales' || e.fired || e.status !== 'atPost') return false
      // One customer at a time, and never the one the player is heading to.
      if (s.customers.some((c) => c.handlerId === employeeId && c.phase !== 'leaving')) return false
      if (s.activeAction?.targetId === customerId) return false
      commit(reduceCustomers(s.customers, { type: 'claim', id: customerId, by: employeeId }))
      return get().customers.find((c) => c.id === customerId)?.handlerId === employeeId
    },
    staffGreet: (employeeId) => {
      const c = staffCustomer(employeeId, ['browsing', 'waiting'])
      if (!c) return
      const carId = chooseTarget(c, availableCars(get().inventory))
      commit(reduceCustomers(get().customers, { type: 'greet', id: c.id, carId, by: employeeId }))
    },
    staffOffer: (employeeId) => {
      const c = staffCustomer(employeeId, ['talking'])
      const car = get().inventory.find((x) => x.id === c?.targetCarId)
      if (!c) return
      // Sold to someone else while they talked: nothing left to offer.
      if (!car || car.status !== 'available') {
        commit(reduceCustomers(get().customers, { type: 'cancel', id: c.id }))
        return
      }
      const e = get().roster.find((x) => x.id === employeeId)
      const price = e ? staffAsk(e.skill, car, c.haggle) : suggestedAsk(c, car)
      const ev = { type: 'offer', id: c.id, carId: car.id, price } as const
      commit(reduceCustomers(get().customers, ev))
    },
    staffLead: (employeeId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const c = staffCustomer(employeeId, ['following'])
      if (!e || !c || c.chairId !== null) return
      const choice = leadChoice(e, s.customers, s.roster)
      if (!choice) {
        commit(reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
        return
      }
      if (choice.kind === 'desk') {
        commit(reduceCustomers(s.customers, { type: 'lead', id: c.id, chairId: choice.chairId }))
        return
      }
      const fm = financeOnDuty(s.roster)!
      commit(reduceCustomers(s.customers, { type: 'handOff', id: c.id, to: fm.id }))
    },
    staffSign: (employeeId, customerId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const c = s.customers.find((x) => x.id === customerId)
      if (!e || c?.phase !== 'signing' || c.handlerId !== employeeId) return
      const sale = sign(c, e)
      if (!sale) {
        commit(reduceCustomers(get().customers, { type: 'cancel', id: c.id }))
        return notify(`${e.name}: "The ${c.name} deal fell through."`)
      }
      notify(
        `${sale.soldBy ?? e.name} sold the ${carName(sale.model)} to ${c.name} for ${formatMoney(sale.price)}!`,
      )
    },
    staffWash: (employeeId, carId) => {
      const e = get().roster.find((x) => x.id === employeeId)
      if (e?.role !== 'porter' || e.status !== 'atPost') return
      const inventory = washCar(get().inventory, carId)
      if (inventory !== get().inventory) set({ inventory })
    },
    startNextDay: () => {
      const s = get()
      if (!isClosed(s.clock) || s.customers.length > 0) return
      settleDay()
      beginDay(s.clock.day + 1)
    },
    hire: (id) => {
      const s = get()
      const c = s.candidates.find((x) => x.id === id)
      if (!c) return
      const blocker = canHire(s.roster, c.role)
      if (blocker) return notify(blocker)
      set({ candidates: s.candidates.filter((x) => x !== c) })
      setRoster(reduceStaff(s.roster, { type: 'hire', employee: c, open: !isClosed(s.clock) }))
      notify(`${c.name} joins as ${ROLE_LABELS[c.role].toLowerCase()}.`)
    },
    fire: (id) => {
      const e = get().roster.find((x) => x.id === id)
      if (!e || e.fired) return
      setRoster(reduceStaff(get().roster, { type: 'fire', id }))
      // A salesperson still talking someone round lets them go back to waiting.
      const talking = get().customers.filter(
        (c) =>
          c.handlerId === id && ['browsing', 'waiting', 'talking', 'considering'].includes(c.phase),
      )
      let customers = get().customers
      for (const c of talking) customers = reduceCustomers(customers, { type: 'cancel', id: c.id })
      commit(customers)
      if (hasBuyersInHand(get().customers, id)) {
        notify(`You let ${e.name} go. They'll finish their paperwork first.`)
      } else notify(`You let ${e.name} go.`)
    },
    keepEmployee: (id) => {
      const e = get().roster.find((x) => x.id === id)
      if (!e?.quitting || e.fired) return
      const raise = retentionRaise(e.wage)
      setRoster(reduceStaff(get().roster, { type: 'keep', id, wage: e.wage + raise }))
      tallyNazma({ kept: [...get().dayStats.nazma.kept, { name: e.name, raise }] })
      notify(`${e.name} is staying, for ${formatMoney(raise)} a day more.`)
    },
    dispatchStaff: (ev) => setRoster(reduceStaff(get().roster, ev)),
    // The staff and stock panels share the left edge, so one closes the other.
    toggleStaffPanel: (open) =>
      set((s) => {
        const staffOpen = open ?? !s.staffOpen
        return { staffOpen, stockOpen: staffOpen ? false : s.stockOpen }
      }),
    toggleStockPanel: (open, tab) =>
      set((s) => {
        const switching = open === undefined && tab !== undefined && tab !== s.computerTab
        const stockOpen = open ?? (switching || !s.stockOpen)
        return {
          stockOpen,
          computerTab: tab ?? s.computerTab,
          staffOpen: stockOpen ? false : s.staffOpen,
        }
      }),
    toggleHelp: (open) => set((s) => ({ helpOpen: open ?? !s.helpOpen })),
    toggleControls: (open) => set((s) => ({ controlsOpen: open ?? !s.controlsOpen })),
    setRotatePrompt: (rotatePrompt) => set({ rotatePrompt }),
    setVolume: (bus, volume) => set((s) => ({ audio: withVolume(s.audio, bus, volume) })),
    toggleMute: (muted) => set((s) => ({ audio: { ...s.audio, muted: muted ?? !s.audio.muted } })),
    toggleAudioPanel: (open) => set((s) => ({ audioOpen: open ?? !s.audioOpen })),
    cycleTimeScale: () =>
      set((s) => {
        const i = DEV_TIME_SCALES.indexOf(s.timeScale as (typeof DEV_TIME_SCALES)[number])
        return { timeScale: DEV_TIME_SCALES[(i + 1) % DEV_TIME_SCALES.length] }
      }),
    // A new player gets the guide before day 1 starts.
    newGame: (difficulty = DEFAULT_DIFFICULTY) =>
      set({ screen: 'playing', helpOpen: true, ...dayOne(difficulty) }),
    loadGame: (save) => {
      // Only offered before the clock has run, so there are no customers,
      // actions or panels to clear.
      set({
        screen: 'playing',
        difficulty: save.difficulty,
        cash: save.cash,
        inventory: save.inventory,
        roster: save.roster,
        orders: save.orders,
        campaigns: save.campaigns,
        improvements: save.improvements,
        reputation: save.reputation,
        monthSales: save.monthSales,
        quota: save.quota,
        bailoutUsed: save.bailoutUsed,
        tipsSeen: save.tipsSeen,
      })
      beginDay(save.day + 1)
    },
  }
})
