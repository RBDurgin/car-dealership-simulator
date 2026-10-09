import { create } from 'zustand'
import { reduceAction, type ActionEvent, type ActiveAction } from '../sim/actions'
import { combineSkews, pickArchetype, skewWeights, usedStockSkew } from '../sim/archetypes'
import {
  DEFAULT_AUDIO_SETTINGS,
  withVolume,
  type AudioBus,
  type AudioSettings,
} from '../sim/audioSettings'
import { calendarOf, DAYS_PER_MONTH, weekdayTraffic } from '../sim/calendar'
import type { CustomerVariant } from '../sim/characters'
import { browseDirt, dirtyOvernight, smudgeCar, washCar } from '../sim/cleanliness'
import { dayOver, isClosed, startOfDay, toStep, type GameTime } from '../sim/clock'
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
import {
  buyExpansion,
  EXPANSIONS,
  expansionsUp,
  installedExpansions,
  type OwnedExpansion,
} from '../sim/expansions'
import { carName, type ActionId } from '../sim/interactables'
import {
  clampAllowance,
  clampAsk,
  clampBuy,
  quoteFor,
  respondToAsk,
  respondToBuyOffer,
  roundOf,
  staffAllowance,
  staffAsk,
  staffBuyOffer,
  suggestedAllowance,
  suggestedAsk,
  suggestedBuy,
  walkLine,
} from '../sim/negotiation'
import { DEFAULT_DIFFICULTY, TUNING, type Difficulty, type Tuning } from '../sim/difficulty'
import { assignVehicles } from '../sim/driving'
import { dailyInterest, payoffOnSale } from '../sim/floorPlan'
import { DESK_CHAIR_ID, type CarModel, type ExpansionId } from '../sim/layout'
import {
  availableCars,
  buildInventory,
  dropSold,
  restock,
  roundTo100,
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
  activeCampaigns,
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
  theftNightAfter,
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
  BASE_SLOTS,
  freeSlots,
  placeOrder,
  type Financing,
  type Order,
} from '../sim/ordering'
import {
  addDay,
  emptyCareer,
  atTopRank,
  rankUp,
  rankUpNotice,
  rankById,
  type Career,
} from '../sim/progression'
import { addSale, emptyMonthSales, holdback, monthlyQuota, type MonthSales } from '../sim/quota'
import { nextTier, START_TIER, TIER_PERKS, tierNotice, type FranchiseTier } from '../sim/franchise'
import {
  applyChange,
  campaignScale,
  referralVisitors,
  reputationChange,
  START_REPUTATION,
  visitorScale,
  type RepScale,
} from '../sim/reputation'
import {
  assignQuotes,
  blitzScale,
  BUST_REPUTATION,
  bustBoost,
  emptyRival,
  emptyRivalStats,
  marketShare,
  rivalDay,
  rivalHired,
  rivalMorning,
  rivalNotice,
  rivalStole,
  sabotageScale,
  type Rival,
  type RivalStats,
} from '../sim/rival'
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
import {
  appraiseFor,
  assignSellers,
  boughtRecord,
  buyBlocker,
  estimateRange,
  lotSlotFor,
  purchaseOf,
  reservedSlots,
  staffAppraisal,
  stockPurchases,
  vehicleOwnerId,
  vehicleTargetId,
  type Purchase,
} from '../sim/sellers'
import {
  bayCount,
  defaultService,
  emptySchedule,
  planServiceVisits,
  serviceDemand,
  type ServiceJob,
  type ServiceSchedule,
  type ServiceSettings,
} from '../sim/service'
import { assignTrades, tradeRecord } from '../sim/tradeIns'
import { nextUsedId, rollUsedCar, stockValue, usedStockCar } from '../sim/usedCars'
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
export type ComputerTab = 'stock' | 'marketing' | 'upgrades' | 'calendar' | 'rival'

/** Medium's starting cash; each level's is `TUNING[level].startingCash`. */
export const STARTING_CASH = TUNING[DEFAULT_DIFFICULTY].startingCash
const INVENTORY_SEED = 2026
const CUSTOMER_SEED = 7_000
const DEAL_SEED = 9_000
const STAFF_SEED = 11_000
const OWNER_SEED = 12_000
const WALK_IN_SEED = 14_000
const DELIVERY_SEED = 16_000
const DRIVE_SEED = 18_000
const RIVAL_SEED = 21_000
const QUOTE_SEED = 22_000
const SERVICE_SEED = 23_000
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
  /**
   * Used cars bought from sellers today. Each stands in customer parking,
   * holding a lot space, until the day is settled and it goes into stock.
   */
  purchases: Purchase[]
  /** The service department's jobs today, in the bays or waiting for one. Never saved. */
  serviceJobs: ServiceJob[]
  /** Today's service visits and how many have driven in. */
  serviceVisits: ServiceSchedule
  /** The shop rate and whether trade-ins are reconditioned on their own. Saved. */
  service: ServiceSettings
  /** Ad campaigns running or starting tomorrow. Finished ones are dropped each morning. */
  campaigns: Campaign[]
  /** Improvements bought, each with its day. One goes up the night after it's bought. */
  improvements: OwnedImprovement[]
  /** Expansions bought, each with its day. One goes up the night after it's bought. */
  expansions: OwnedExpansion[]
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
  /** Lifetime totals and the dealer rank reached. Added to when a day is settled. Saved. */
  career: Career
  /** The manufacturer's franchise tier, moved by the quota at month end. Saved. */
  franchise: FranchiseTier
  /** The win screen has been seen and play went on, so it doesn't show again. Saved. */
  won: boolean
  /** Guided tips already shown (Easy). Saved, so a resumed game doesn't repeat them. */
  tipsSeen: TipId[]
  /** Nazma's lot across the road. Moves each morning (opening) and when the day is settled. Saved. */
  rival: Rival
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
  /** Buys expansion `id`, paid in cash now, to go up overnight. False if it can't be. */
  buyExpansion: (id: ExpansionId) => boolean
  /** Cancels an order: cash comes back, or the floor plan credit is freed. */
  cancelOrder: (id: string) => void
  /** Pays the bank a floored car's cost from cash, so it stops accruing interest. */
  payOff: (carId: string) => void
  /** Dev cheat: refills sold spaces, skipping any `canPlace` vetoes. */
  devRestock: (canPlace?: (car: InventoryCar) => boolean) => void
  /** Dev cheat: a random used car on the first free lot space `canPlace` allows. */
  devUsedCar: (canPlace?: (car: InventoryCar) => boolean) => void
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
   * customer's counter and the last ask (or up to MSRP to open). With a
   * trade-in, `allowance` is what we allow for it (the suggested one if not
   * given); the trade is left out when there's no lot space for it.
   */
  ask: (price: number, allowance?: number) => void
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
  /** From the win screen: play goes on, and the win screen won't show again. */
  keepPlaying: () => void
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
/** Which arrivals come by car, and what they drive. Apart, so the rest of the day plays as before. */
let driveRng: Rng = createRng(DRIVE_SEED + 1)
/** Which shoppers have been to the rival's lot first. Apart, so the rest of the day plays as before. */
let quoteRng: Rng = createRng(QUOTE_SEED + 1)
/** Service clients and their quotes. Apart, so a day without a garage plays as before. */
let serviceRng: Rng = createRng(SERVICE_SEED + 1)

/**
 * Time stands still and the player can't move behind the title screen, the
 * guide or the rotate-your-device prompt.
 */
export function isPaused(s: Pick<GameState, 'screen' | 'helpOpen' | 'rotatePrompt'>): boolean {
  return s.screen === 'title' || s.helpOpen || s.rotatePrompt
}

/**
 * The win screen shows over the day summary once the top rank is reached,
 * until the player picks Keep playing.
 */
export function winShowing(
  s: Pick<GameState, 'screen' | 'clock' | 'customers' | 'career' | 'won'>,
): boolean {
  return s.screen === 'playing' && dayOver(s) && atTopRank(s.career) && !s.won
}

/** The levers of the game's difficulty level; a stable object, so fine as a selector. */
export function levelTuning(s: Pick<GameState, 'difficulty'>): Tuning {
  return TUNING[s.difficulty]
}

/** × each car's invoice: the level's factor and the franchise tier's. */
export function orderInvoice(s: Pick<GameState, 'difficulty' | 'franchise'>): number {
  return TUNING[s.difficulty].invoice * TIER_PERKS[s.franchise].invoice
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
/** The level's odds of a visit, scaled by his rival lot's `sabotageScale`. */
function visitOdds(t: Tuning, scale = 1): VisitOdds {
  return { chance: t.nazmaChance * scale, firstDay: t.firstNazmaDay }
}

/** The morning's word on a night's theft. */
export function theftNotice(theft: NightTheft, rival: string | null = null): string {
  if (theft.outcome === 'foiled') return 'Your guard ran someone off the lot last night.'
  const { car } = theft
  const where = rival ? ` It's for sale at ${rival} now.` : ''
  const stole = `Nazma stole the ${carName(car.model)} off the lot overnight.${where}`
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
  driveRng = createRng(DRIVE_SEED + 1)
  quoteRng = createRng(QUOTE_SEED + 1)
  serviceRng = createRng(SERVICE_SEED + 1)
  const tuning = TUNING[difficulty]
  return {
    difficulty,
    cash: tuning.startingCash,
    bailoutUsed: false,
    career: emptyCareer(),
    franchise: START_TIER,
    won: false,
    rival: emptyRival(),
    expansions: [] as OwnedExpansion[],
    tipsSeen: [] as TipId[],
    purchases: [] as Purchase[],
    // Day 1 has no garage.
    serviceJobs: [] as ServiceJob[],
    serviceVisits: emptySchedule(),
    service: defaultService(),
    quota: monthlyQuota(0, BASE_SLOTS, START_REPUTATION, tuning.quota),
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
      if (c.selling && c.vehicle) {
        notify(
          `${c.name} wants to sell their ${carName(c.vehicle.car.model)}. They're waiting by it.`,
        )
        continue
      }
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
   * pays the holdback on the month's sales (scaled by the franchise tier), and
   * the month's result moves the tier. The day's gross goes on the
   * career, which may earn a new rank. Nazma's lot across the road takes in
   * the day (see `rivalDay`). Used cars bought today go into stock, in the lot
   * spaces held for them, so the save keeps them.
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
    const monthEnd = calendarOf(s.clock.day).dayOfMonth === DAYS_PER_MONTH
    const career = addDay(s.career, s.dayStats, reputation, monthEnd, level.rankScale)
    const quota = monthEnd
      ? {
          quota: s.quota,
          sold: s.monthSales.count,
          payout: holdback(
            s.monthSales.count,
            s.quota,
            s.monthSales.msrp,
            TIER_PERKS[s.franchise].holdback,
          ),
          tier: {
            from: s.franchise,
            to: nextTier(
              s.franchise,
              { quota: s.quota, sold: s.monthSales.count },
              level.franchiseSlack,
            ),
          },
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
      career,
      franchise: quota?.tier.to ?? s.franchise,
      rival: rivalDay(
        s.rival,
        s.dayStats,
        createRng(RIVAL_SEED + s.clock.day),
        level.rivalStrength,
      ),
      ...(s.purchases.length > 0 && {
        inventory: [...s.inventory, ...stockPurchases(s.purchases, s.clock.day)],
        purchases: [],
      }),
      dayStats: {
        ...s.dayStats,
        wages,
        commissions,
        interest,
        owner,
        reputation: reputation - s.reputation,
        quota,
        bailout,
        rankUp: rankUp(s.career, career)?.id ?? null,
        settled: true,
      },
    })
  }

  /** Closing time: the staff head home, and anyone still thinking of quitting goes for good. */
  const closeUp = () => {
    const before = get().roster
    setRoster(reduceStaff(before, { type: 'close' }))
    const quitters = before.filter((e) => e.quitting && !e.fired)
    if (quitters.length === 0) return
    const quit = quitters.map((e) => e.name)
    const s = get()
    const rival = rivalHired(s.rival, quitters, tuning().rivalStrength)
    const joined = rival === s.rival ? [] : quitters.map((e) => ({ name: e.name, role: e.role }))
    set({ rival })
    tallyNazma({
      quit: [...s.dayStats.nazma.quit, ...quit],
      joined: [...s.dayStats.nazma.joined, ...joined],
      ...(joined.length > 0 && { rival: rival.name }),
    })
    notify(
      joined.length > 0
        ? `${quit.join(' and ')} quit to work for ${rival.name}.`
        : `${quit.join(' and ')} quit and won't be back.`,
    )
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
      case 'makeOffer':
        return greet(finished.targetId)
      case 'appraise':
        return appraiseCar(finished.targetId)
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
      case 'rival':
        return get().toggleStockPanel(true, 'rival')
      case 'confront':
        return get().nazmaRunOff('player')
    }
  }

  /** Updates today's Nazma tally. */
  const tallyNazma = (change: Partial<NazmaStats>) => {
    const stats = get().dayStats
    set({ dayStats: { ...stats, nazma: { ...stats.nazma, ...change } } })
  }

  /** Counts one more of the rival's quote-holders lost to him, or matched and sold to. */
  const tallyRival = (key: keyof Pick<RivalStats, 'lost' | 'matched'>) => {
    const stats = get().dayStats
    if (!stats.rival) return
    set({ dayStats: { ...stats, rival: { ...stats.rival, [key]: stats.rival[key] + 1 } } })
  }

  /** Some of `arrived` have been to the rival's lot first and carry his price. */
  const withQuotes = (arrived: readonly Customer[]) => {
    const s = get()
    return assignQuotes(arrived, s.rival, s.dayStats.rival?.share ?? 0, quoteRng)
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
    // A seller wants to talk about their own car.
    const carId = c.selling ? null : chooseTarget(c, availableCars(s.inventory))
    commit(reduceCustomers(s.customers, { type: 'greet', id, carId, by: PLAYER_ID }))
    if (c.selling) return
    if (carId === null) notify(`${c.name}: "Nothing here for me, sorry."`)
  }

  /**
   * Asks customer `id` for their car: `price`, or the suggested ask (see
   * `suggestedAsk`), with `allowance` (or the suggested one) for any trade-in.
   */
  const offer = (id: string, price?: number, allowance?: number) => {
    const s = get()
    const c = s.customers.find((x) => x.id === id)
    if (c?.selling) return buyOffer(c, price)
    const car = s.inventory.find((x) => x.id === c?.targetCarId)
    if (!c || !car || car.status !== 'available') return notify("That car isn't for sale any more.")
    const allow = tradeAllowance(c, allowance ?? suggestedAllowance(c))
    const ask = Math.max(
      allow ?? 0,
      price === undefined ? suggestedAsk(c, car, allow) : clampAsk(c, car, price, allow),
    )
    const ev = { type: 'offer', id, carId: car.id, price: ask, allowance: allow } as const
    commit(reduceCustomers(s.customers, ev))
  }

  /**
   * What we can allow for `c`'s trade-in: `allowance` within reason, or
   * undefined when they have none or there's no lot space to take it.
   */
  const tradeAllowance = (c: Customer, allowance: number): number | undefined =>
    c.trade && lotSlotFor(get()) ? clampAllowance(c, allowance) : undefined

  /**
   * Offers seller `c` `price` for their car, or the suggested offer (see
   * `suggestedBuy`). Not while there's no lot space for it or not enough cash.
   */
  const buyOffer = (c: Customer, price?: number) => {
    const s = get()
    const bid = price === undefined ? suggestedBuy(c) : clampBuy(c, price)
    const blocker = buyBlocker(s, bid)
    if (blocker) return notify(blocker)
    const ev = { type: 'offer', id: c.id, carId: vehicleTargetId(c.id), price: bid } as const
    commit(reduceCustomers(s.customers, ev))
  }

  /**
   * Seller `c` answers our offer. A yes buys the car: cash goes now, and the
   * car stays in customer parking, holding a lot space, until closing.
   */
  const answerSeller = (c: Customer) => {
    const s = get()
    const price = c.offer!.price
    const res = respondToBuyOffer(c, price, dealRng)
    if (res.answer === 'accept') {
      const id = nextUsedId([...s.inventory, ...s.purchases], s.clock.day)
      const blocker = buyBlocker(s, price)
      const purchase = blocker ? null : purchaseOf(c, price, s, id)
      if (!purchase) {
        // The last space went, or the cash, while they thought it over.
        commit(reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
        return notify(blocker ?? 'The deal fell through.')
      }
      set({
        cash: s.cash - price,
        purchases: [...s.purchases, purchase],
        dayStats: {
          ...s.dayStats,
          bought: [...s.dayStats.bought, boughtRecord(purchase, s.clock.day)],
        },
      })
      commit(reduceCustomers(get().customers, { type: 'respond', id: c.id, answer: 'accept' }))
      const buyer = s.roster.find((e) => e.id === c.handlerId)
      return notify(
        `${buyer ? `${buyer.name} bought` : 'Bought'} ${c.name}'s ${carName(purchase.car.model)} for ${formatMoney(price)}. It goes on the lot tonight.`,
      )
    }
    const counter = res.answer === 'counter' ? res.counter : undefined
    commit(reduceCustomers(s.customers, { type: 'respond', id: c.id, answer: res.answer, counter }))
    // Staff haggles go on quietly.
    if (c.handlerId !== PLAYER_ID) return
    if (res.answer === 'counter') notify(`${c.name}: "I'd want ${formatMoney(res.counter)}."`)
    else notify(`${c.name}: "${walkLine(res.reason)}"`)
  }

  /** The player finished looking over the car with target id `targetId`. */
  const appraiseCar = (targetId: string) => {
    const s = get()
    const c = s.customers.find((x) => x.id === vehicleOwnerId(targetId))
    const estimate =
      c && appraiseFor(c, s.clock.day, PLAYER_SKILL, dealRng, tuning().appraisalNoise)
    if (!c?.vehicle || !estimate) return
    commit(reduceCustomers(s.customers, { type: 'appraised', id: c.id, estimate }))
    const { low, high } = estimateRange(estimate)
    notify(
      `You'd put ${c.name}'s ${carName(c.vehicle.car.model)} at ${formatMoney(low)}–${formatMoney(high)}.`,
    )
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
   * With no used car for sale, few used-car shoppers come (`usedStockSkew`).
   */
  const arrivalOpts = () => {
    const event = eventOn(get().clock.day)
    const level = tuning()
    const skew = combineSkews(event?.skew ?? {}, usedStockSkew(availableCars(get().inventory)))
    return {
      patienceFactor: level.patience,
      expectShift: level.expect,
      expectCut: upEffects().expectCut,
      ...(event && { extraDiscount: event.extraDiscount }),
      ...(Object.keys(skew).length > 0 && { skew }),
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
    if (!c.offer || !car || car.status !== 'available') return null
    const { price, allowance } = c.offer
    // Their trade-in, if it's in the deal, takes a lot space; none left and the deal is off.
    const traded =
      allowance === undefined
        ? null
        : purchaseOf(c, allowance, s, nextUsedId([...s.inventory, ...s.purchases], s.clock.day))
    if (allowance !== undefined && !traded) return null
    if (!get().sellCar(car.id, price)) return null
    const quote = quoteFor(c, car)
    if (quote !== null && price <= quote) tallyRival('matched')
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
    const trade = traded && tradeRecord(c, traded.price, s.clock.day)
    if (trade) sale.trade = trade
    if (car.used) sale.used = true
    const stats = get().dayStats
    set({
      dayStats: {
        ...stats,
        sales: [...stats.sales, sale],
        bought: traded ? [...stats.bought, boughtRecord(traded, s.clock.day, true)] : stats.bought,
      },
      // Only new cars count toward the manufacturer's quota.
      monthSales: car.used ? get().monthSales : addSale(get().monthSales, car.msrp),
      // We pay for their car out of the price; it goes on the lot tonight.
      ...(traded && { cash: get().cash - traded.price, purchases: [...get().purchases, traded] }),
    })
    commit(reduceCustomers(get().customers, { type: 'signed', id: c.id, traded: !!traded }))
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
      `Sold the ${carName(sale.model)} to ${sale.customerName} for ${formatMoney(sale.price)}!${tradeLine(sale)}`,
    )
  }

  /** " Their Summit Sedan goes on the lot tonight." after a sale with a trade-in. */
  const tradeLine = (sale: Sale) =>
    sale.trade ? ` Their ${carName(sale.trade.model)} goes on the lot tonight.` : ''

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
   * Nazma announces his rival lot once the dealership is a Main Street one,
   * and while it's open it takes its share of the day's visitors, makes his
   * weekly move on Mondays, and the worse he does the more Nazma gets up to:
   * a car he steals goes on his lot. Kept under his bust floor for weeks, he
   * closes: the player's reputation goes up, his buyers come over for a week,
   * and Nazma stays away until he reopens.
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
    driveRng = createRng(DRIVE_SEED + day)
    quoteRng = createRng(QUOTE_SEED + day)
    serviceRng = createRng(SERVICE_SEED + day)
    const s = get()
    const delivered = deliver(s.orders, createRng(DELIVERY_SEED + day), day)
    const campaigns = unfinished(s.campaigns, day)
    const kept = dropSold(s.inventory)
    const level = tuning()
    const guarded = isGuarded(s.roster)
    const opening = rivalMorning(s.rival, day, s.career.rank, {
      strength: level.rivalStrength,
      undercut: level.rivalUndercut,
      comeback: level.rivalComeback,
    })
    // Driving him bust is worth reputation, and a mark on the career.
    const bust = opening.event === 'bust'
    // The more desperate his lot, the more Nazma gets up to.
    const sabotage = sabotageScale(opening.rival)
    const theftChance = level.theftChance * sabotage
    const last = s.rival.lastTheftDay
    const theft = planTheft(createRng(theftSeed(day)), day, kept, guarded, theftChance, last)
    const stolen = theft?.outcome === 'stolen' ? theft.car : null
    const tried = theftNightAfter(day, last, theftChance)
    const rival = stolen
      ? { ...rivalStole(opening.rival, stolen.model), lastTheftDay: day }
      : tried
        ? { ...opening.rival, lastTheftDay: day }
        : opening.rival
    const share = marketShare(rival, {
      reputation: s.reputation,
      campaigns: activeCampaigns(campaigns, day).length,
      day,
    })
    const inventory = [
      ...dirtyOvernight(stolen ? kept.filter((c) => c !== stolen) : kept, effects.lotDirt),
      ...delivered,
    ]
    const salesStaff = s.roster.filter((e) => e.role === 'sales' && !e.fired).length
    const nazma = isNazmaDay(day, guarded, visitOdds(level, sabotage))
      ? planVisit(createRng(visitSeed(day)), inventory, s.roster, level.poachChance * sabotage)
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
      quota: newMonth ? monthlyQuota(date.month, BASE_SLOTS, s.reputation, level.quota) : s.quota,
      inventory,
      orders: [],
      campaigns,
      arrivals: planArrivals(
        customerRng,
        trafficBoost(campaigns, day, campaignScale(s.reputation) * blitzScale(rival)),
        {
          scale:
            visitorScale(s.reputation) *
            weekdayTraffic(day) *
            effects.traffic *
            (event?.traffic ?? 1) *
            level.traffic *
            (1 - share) *
            bustBoost(rival, day),
          referrals: referralVisitors(s.reputation),
        },
      ),
      cash: s.cash - (stolen?.floored ? stolen.cost : 0),
      purchases: [],
      serviceJobs: [],
      serviceVisits: planServiceVisits(
        serviceRng,
        serviceDemand(day, s.career, {
          bays: bayCount(installedExpansions(s.expansions, day)),
          rate: s.service.rate,
          factor: level.serviceDemand,
        }),
      ),
      rival,
      ...(bust && {
        reputation: applyChange(s.reputation, BUST_REPUTATION),
        career: { ...s.career, rivalsBeaten: s.career.rivalsBeaten + 1 },
      }),
      dayStats: {
        ...emptyStats(),
        nazma: {
          ...emptyNazmaStats(),
          stolen: stolen ? [stolenRecord(stolen)] : [],
          foiled: theft?.outcome === 'foiled',
          rival: rival.status === 'open' ? rival.name : null,
        },
        rival: rival.status === 'open' ? emptyRivalStats(share) : null,
      },
      missedYesterday: s.dayStats.missed,
      candidates: generateCandidates(staffRng, day),
      owner,
      nazma,
    })
    setRoster(reduceStaff(get().roster, { type: 'open' }))
    const notices = [
      s.dayStats.rankUp && rankUpNotice(rankById(s.dayStats.rankUp)),
      s.dayStats.quota && tierNotice(s.dayStats.quota.tier.from, s.dayStats.quota.tier.to),
      s.dayStats.bailout > 0 && bailoutNotice(s.dayStats.bailout),
      opening.event && rivalNotice(rival, opening.event),
      eventNotice(day),
      theft && theftNotice(theft, rival.status === 'open' ? rival.name : null),
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
      // Looking over the car of the seller they're talking to doesn't end the talk.
      if (deal && deal.id !== targetId && deal.id !== vehicleOwnerId(targetId)) {
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
      // Some drive in, while there's room in customer parking. Some of those
      // are sellers, and some of the rest bring a car to trade.
      const level = tuning()
      const arrived = withQuotes(
        assignTrades(
          assignSellers(
            assignVehicles(
              due.map((source) =>
                generateCustomer(`customer-${nextCustomerId++}`, stock, customerRng, {
                  source,
                  ...arrivalOpts(),
                }),
              ),
              customers,
              driveRng,
              step.day,
              s.purchases.map((p) => p.spot),
            ),
            driveRng,
            step.day,
            { hope: level.sellerHope, noise: level.appraisalNoise },
          ),
          driveRng,
          step.day,
          { hope: level.tradeHope, noise: level.appraisalNoise },
        ),
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
      const book = { ...s, reserved: reservedSlots(s.purchases), tier: s.franchise }
      const result = placeOrder(book, model, financing, s.clock.day, orderInvoice(s))
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
    buyExpansion: (id) => {
      const s = get()
      const result = buyExpansion({ ...s, rank: s.career.rank }, id, s.clock.day)
      if (!result.ok) {
        notify(result.reason)
        return false
      }
      const { label, cost } = EXPANSIONS[id]
      set({
        cash: result.cash,
        expansions: result.expansions,
        dayStats: { ...s.dayStats, expansions: s.dayStats.expansions + cost },
      })
      notify(`Bought the ${label.toLowerCase()} for ${formatMoney(cost)}. It's built overnight.`)
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
    devUsedCar: (canPlace) => {
      const s = get()
      const day = s.clock.day
      const spec = rollUsedCar(createRng(Date.now()), day)
      const id = nextUsedId([...s.inventory, ...s.purchases], day)
      const cars = freeSlots(s.inventory, s.orders, reservedSlots(s.purchases), expansionsUp(s))
        .filter((slot) => slot.location === 'lot')
        .map((slot) => usedStockCar(id, spec, slot, 0, day, 0.5))
      const car = cars.find((c) => canPlace?.(c) ?? true)
      if (!car) return notify('No free lot space for a used car.')
      set({
        inventory: [...s.inventory, { ...car, cost: roundTo100(stockValue(car, day)! * 0.9) }],
      })
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
      const [c] = withQuotes([
        generateCustomer(id, availableCars(s.inventory), walkInRng, {
          ...opts,
          variant,
          archetype,
          source: 'walk-in',
        }),
      ])
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
          : s.rival.status === 'open'
            ? `Nazma crossed the road from ${s.rival.name}.`
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
      if (c.selling) return answerSeller(c)
      const car = s.inventory.find((x) => x.id === c.offer?.carId)
      const { price, allowance } = c.offer
      const res =
        car?.status === 'available'
          ? respondToAsk(c, car, price, dealRng, sellerBonus(c), allowance, s.clock.day)
          : ({ answer: 'walk', reason: 'gone' } as const)
      const counter = res.answer === 'counter' ? res.counter : undefined
      const insulted = res.answer === 'counter' && res.insulted
      const ev = { type: 'respond', id, answer: res.answer, counter, insulted } as const
      commit(reduceCustomers(s.customers, ev))
      if (res.answer === 'walk' && res.reason === 'rival') tallyRival('lost')
      // Staff deals go on quietly; the sale itself is announced.
      if (c.handlerId !== PLAYER_ID) return
      if (res.answer === 'accept') notify(`${c.name}: "Deal! Lead the way."`)
      else if (res.answer === 'counter') {
        const after = allowance === undefined ? '' : ' after my trade'
        const slight = insulted ? `That's all for my car? ` : ''
        notify(`${c.name}: "${slight}How about ${formatMoney(res.counter)}${after}?"`)
      } else notify(`${c.name}: "${walkLine(res.reason)}"`)
    },
    ask: (price, allowance) => {
      const c = dealCustomer(get().customers, PLAYER_ID)
      if (c?.phase === 'talking') offer(c.id, price, allowance)
    },
    staffClaim: (employeeId, customerId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      if (!e || e.role !== 'sales' || e.fired || e.status !== 'atPost') return false
      // One customer at a time, and never the one the player is heading to.
      if (s.customers.some((c) => c.handlerId === employeeId && c.phase !== 'leaving')) return false
      if (s.activeAction?.targetId === customerId) return false
      // A seller's car needs a lot space and some cash.
      if (s.customers.find((c) => c.id === customerId)?.selling && buyBlocker(s)) return false
      commit(reduceCustomers(s.customers, { type: 'claim', id: customerId, by: employeeId }))
      return get().customers.find((c) => c.id === customerId)?.handlerId === employeeId
    },
    staffGreet: (employeeId) => {
      const c = staffCustomer(employeeId, ['browsing', 'waiting'])
      if (!c) return
      const carId = c.selling ? null : chooseTarget(c, availableCars(get().inventory))
      commit(reduceCustomers(get().customers, { type: 'greet', id: c.id, carId, by: employeeId }))
    },
    staffOffer: (employeeId) => {
      const s = get()
      const c = staffCustomer(employeeId, ['talking'])
      const e = s.roster.find((x) => x.id === employeeId)
      if (!c || !e) return
      // What they make of the customer's car, if they're selling it or trading it in.
      const appraisal = staffAppraisal(c, e.id, s.clock.day, e.skill)?.estimate ?? 0
      if (c.selling) {
        const price = staffBuyOffer(e.skill, appraisal, c.haggle)
        // No room or cash for it any more: they give up on this one.
        if (buyBlocker(s, price)) {
          commit(reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
          return
        }
        const ev = { type: 'offer', id: c.id, carId: vehicleTargetId(c.id), price } as const
        commit(reduceCustomers(s.customers, ev))
        return
      }
      const car = s.inventory.find((x) => x.id === c.targetCarId)
      // Sold to someone else while they talked: nothing left to offer.
      if (!car || car.status !== 'available') {
        commit(reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
        return
      }
      const allow = c.trade
        ? tradeAllowance(c, staffAllowance(e.skill, appraisal, c.trade.hope, roundOf(c)))
        : undefined
      const price = Math.max(allow ?? 0, staffAsk(e.skill, car, c.haggle, allow, quoteFor(c, car)))
      const ev = { type: 'offer', id: c.id, carId: car.id, price, allowance: allow } as const
      commit(reduceCustomers(s.customers, ev))
    },
    staffLead: (employeeId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const c = staffCustomer(employeeId, ['following'])
      if (!e || !c || c.chairId !== null) return
      const choice = leadChoice(e, s.customers, s.roster, expansionsUp(s))
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
        `${sale.soldBy ?? e.name} sold the ${carName(sale.model)} to ${c.name} for ${formatMoney(sale.price)}!${tradeLine(sale)}`,
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
      const blocker = canHire(s.roster, c.role, expansionsUp(s))
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
        expansions: save.expansions,
        reputation: save.reputation,
        monthSales: save.monthSales,
        quota: save.quota,
        bailoutUsed: save.bailoutUsed,
        career: save.career,
        franchise: save.franchise,
        won: save.won,
        rival: save.rival,
        tipsSeen: save.tipsSeen,
        service: save.service,
      })
      beginDay(save.day + 1)
    },
    keepPlaying: () => set({ won: true }),
  }
})
