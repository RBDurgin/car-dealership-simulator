import type { ActiveAction } from '../sim/actions'
import type { AchievementId, EarnedAchievement } from '../sim/achievements'
import type { AudioBus, AudioSettings } from '../sim/audioSettings'
import type { GraphicsSetting } from '../sim/graphics'
import type { CallKind, ClientVisit } from '../sim/calls'
import type { Chargeback } from '../sim/chargebacks'
import type { Contract } from '../sim/contracts'
import type { FiStats } from '../sim/fi'
import type { CustomerVariant } from '../sim/characters'
import type { Appreciation, Client, ClientPerks, MonthCsi } from '../sim/clients'
import type { GameTime } from '../sim/clock'
import type { Customer, CustomerEvent } from '../sim/customers'
import type { DayStats } from '../sim/deal'
import type { Difficulty } from '../sim/difficulty'
import type { OwnedExpansion } from '../sim/expansions'
import type { ProductId } from '../sim/fi'
import type { ImprovementId, OwnedImprovement } from '../sim/improvements'
import type { ActionId } from '../sim/interactables'
import type { LenderId } from '../sim/lenders'
import type { InventoryCar } from '../sim/inventory'
import type { CarModel, ExpansionId } from '../sim/layout'
import type { Campaign, Channel } from '../sim/marketing'
import type { NazmaVisit, RunOffBy } from '../sim/nazma'
import type { Financing, Order } from '../sim/ordering'
import type { OwnerVisit } from '../sim/owner'
import type { Career } from '../sim/progression'
import type { MonthSales } from '../sim/quota'
import type { FranchiseTier } from '../sim/franchise'
import type { Rival } from '../sim/rival'
import type { SaveData } from '../sim/save'
import type { Purchase } from '../sim/sellers'
import type {
  Comeback,
  RateLevel,
  ServiceJob,
  ServiceSchedule,
  ServiceSettings,
} from '../sim/service'
import type { ArrivalSchedule } from '../sim/spawner'
import type { Employee, StaffEvent } from '../sim/staff'
import type { DayRecord, Lifetime, Records } from '../sim/stats'
import type { TipId } from '../sim/tips'
import type { WallMode } from '../sim/walls'
import type { Weather } from '../sim/weather'

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

/** The receptionist on the phone to someone in the client book. */
export interface ReceptionCall {
  employeeId: string
  clientId: string
  kind: CallKind
  /** Game minutes left on the call. */
  left: number
}

/** The office computer panel's tabs. */
export type ComputerTab =
  | 'stock'
  | 'marketing'
  | 'upgrades'
  | 'calendar'
  | 'rival'
  | 'service'
  | 'clients'
  | 'finance'
  | 'stats'

/**
 * The whole store: one state, built from the slices in `state/slices/`.
 * Discrete events only. Per-frame values live in refs / scene/runtime.ts.
 */
export interface GameState {
  /** The title screen is up: the clock and the player wait until a game is started. */
  screen: Screen
  /** Picked at New game and kept with the save. Never changes mid-game. */
  difficulty: Difficulty
  /** The dealership's name, picked at New game and kept with the save (see `sim/dealershipName.ts`). */
  dealershipName: string
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
  /**
   * Service clients who dropped their car off and went away, until the time
   * they were promised (or closing). Off the lot, so not in `customers`. Never saved.
   */
  serviceAway: Customer[]
  /** Clients whose job didn't hold, on their way back for a redo. Never saved. */
  serviceComebacks: Comeback[]
  /** The shop rate and whether trade-ins are reconditioned on their own. Saved. */
  service: ServiceSettings
  /** The client book: buyers and greeted walk-outs (see `sim/clients.ts`). Saved. */
  clients: Client[]
  /** The loyalty discount, referral fee and the receptionist's calls. Saved. */
  clientPerks: ClientPerks
  /** A client appreciation day booked, or null. Saved. */
  appreciation: Appreciation | null
  /** The month's new-car buyers' visit scores, for the manufacturer's CSI. Saved. */
  monthCsi: MonthCsi
  /** The month's F&I so far, for the Finance tab. Saved. */
  monthFi: FiStats
  /** Extended warranty contracts sold, until they run out (see `sim/contracts.ts`). Saved. */
  contracts: Contract[]
  /** Chargebacks still to land (see `sim/chargebacks.ts`). Saved. */
  chargebacks: Chargeback[]
  /** Clients due in on an appointment today, still to come. Planned each morning, never saved. */
  clientVisits: ClientVisit[]
  /** Clients phoned today who didn't pick up, or did: not called again today. Never saved. */
  callsTried: string[]
  /** Who the player's call at the desk phone is to (while `activeAction` is a call). */
  playerCall: string | null
  /** The receptionist's call between customers, or null. Never saved. */
  receptionCall: ReceptionCall | null
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
  /** A record of each day settled since `statsFrom` (see `sim/stats.ts`). Saved. */
  log: DayRecord[]
  /** Totals over every day settled, and personal records. Added to when a day is settled. Saved. */
  lifetime: Lifetime
  records: Records
  /** The first day the log and lifetime totals cover (later than 1 for a game from before them). Saved. */
  statsFrom: number
  /** The manufacturer's franchise tier, moved by the quota at month end. Saved. */
  franchise: FranchiseTier
  /** The win screen has been seen and play went on, so it doesn't show again. Saved. */
  won: boolean
  /** Guided tips already shown (Easy). Saved, so a resumed game doesn't repeat them. */
  tipsSeen: TipId[]
  /** Achievements earned this game, each once (see `sim/achievements.ts`). Saved. */
  achievements: EarnedAchievement[]
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
  /** The office computer panel (stock, marketing, upgrades, calendar, rival, service, clients) is open. */
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
  /** Graphics: Auto, High or Low; a per-device preference kept apart from the save, like `audio`. */
  graphics: GraphicsSetting
  /** The `QUALITY_TIERS` tier the scene draws at now (scene/Quality picks it). */
  qualityTier: number
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
  /**
   * Earns achievements `ids` today at the game's level, those not already
   * earned, and returns them (`state/achievements.ts` shows their notice).
   */
  earnAchievements: (ids: readonly AchievementId[]) => AchievementId[]
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
  /** Dev cheat: someone from the client book who isn't on the lot turns up. */
  devReturnClient: () => void
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
  /**
   * At the F&I menu: the player's buyer takes their loan from lender `id` at
   * `markup` points over its buy rate. Only before the first product.
   */
  fiLender: (id: LenderId, markup: number) => void
  /** At the F&I menu: presents product `id` at `price`, and the buyer answers at once. */
  fiPresent: (id: ProductId, price: number) => void
  /** At the F&I menu, with no lender willing: the buyer puts down enough for one to approve. */
  fiMoreDown: () => void
  /** At the F&I menu, with no lender willing: the buyer goes home without the car. */
  fiLetGo: () => void
  /** At the F&I menu: signs the contracts, and the sale goes through. */
  fiSign: () => void
  /** The player takes customer `id`, whom they're talking to, for a test drive (see `sim/testDrive.ts`). */
  testDrive: (id: string) => void
  /** Out on a test drive with the player: turn back for the lot now (the drive counts as cut short). */
  headBack: () => void
  /** The world: customer `id`'s test drive car is back in its space, and they get out. */
  driveBack: (id: string) => void
  /** The world: customer `id`'s test drive has come to a talking point, so 3 topics come up (see `sim/talkingPoints.ts`). */
  drivePrompt: (id: string) => void
  /** Out on a test drive: the player points out topic `index` (0–2) of the prompt that's up. */
  pickTopic: (index: number) => void
  /** Salesperson `employeeId` sets off to help customer `customerId`. False if they can't. */
  staffClaim: (employeeId: string, customerId: string) => boolean
  /** Salesperson `employeeId` reached the customer they claimed and greets them. */
  staffGreet: (employeeId: string) => void
  /** Salesperson `employeeId` makes their customer an offer. */
  staffOffer: (employeeId: string) => void
  /** Salesperson `employeeId` takes the customer they're talking to for the test drive they asked for. */
  staffTestDrive: (employeeId: string) => void
  /** Salesperson `employeeId` got in the test drive car with their customer: off they go. */
  staffBoard: (employeeId: string) => void
  /** The player hands customer `customerId`, whom they're talking to, to salesperson `employeeId` for their test drive. */
  sendWith: (customerId: string, employeeId: string) => void
  /** Salesperson `employeeId`'s customer said yes: off to finance, or to their desk. */
  staffLead: (employeeId: string) => void
  /** Finance, or a salesperson at their desk, finished the paperwork for the buyer opposite. */
  staffSign: (employeeId: string, customerId: string) => void
  /** Service advisor `employeeId` checks in service client `customerId` at the counter. */
  staffCheckIn: (employeeId: string, customerId: string) => void
  /** Service advisor `employeeId` offers the client the extra work found on job `jobId`. */
  staffRecommend: (employeeId: string, jobId: string) => void
  /** From the Service tab: the player phones a client who's away about the extra work found on job `jobId`. */
  callClient: (jobId: string) => void
  /**
   * The player heads for the desk phone to call client `clientId`, or (with
   * none) the top of the call list. False if there's nobody to call.
   */
  phoneClient: (clientId?: string) => boolean
  /** Turns the receptionist's calls between customers on or off. */
  setReceptionCalls: (on: boolean) => void
  /** Sets the loyalty discount returning clients are priced at, from their next visit. */
  setLoyaltyDiscount: (discount: ClientPerks['loyaltyDiscount']) => void
  /** Sets the fee paid to a client whose friend buys, from now on. */
  setReferralFee: (fee: ClientPerks['referralFee']) => void
  /** Books (and pays for) a client appreciation day on `day`. False if it can't be. */
  bookAppreciation: (day: number) => boolean
  /** Service client `customerId` reached their car, which is ready: they pay and get in. */
  serviceCollect: (customerId: string) => void
  /** Service client `customerId`, dropping their car off, walked off the lot until it's ready. */
  serviceWentAway: (customerId: string) => void
  /** Lot porter `employeeId` finished washing car `carId`. */
  staffWash: (employeeId: string, carId: string) => void
  /**
   * Mechanic `employeeId` reached bay `bay` and starts on job `jobId` (or takes
   * over one left stalled there). Its time then runs on the clock.
   */
  staffStartJob: (employeeId: string, jobId: string, bay: number) => void
  /** Sends used car `carId` to the shop for reconditioning, paying for the parts. False if it can't go. */
  recondition: (carId: string) => boolean
  /** Sends dinged car `carId` to the shop to have the dent fixed, paying for the parts. False if it can't go. */
  fixDing: (carId: string) => boolean
  /** Turns reconditioning used cars as they come in on or off. */
  setAutoRecon: (on: boolean) => void
  /** Sets the shop rate: quotes from now on, the number of clients from tomorrow. */
  setServiceRate: (rate: RateLevel) => void
  /** From the end-of-day summary: opens the doors on the next day. */
  startNextDay: () => void
  /** Puts one of today's candidates on the payroll. */
  hire: (id: string) => void
  /** Lets an employee go. They walk out and aren't paid for the day. */
  fire: (id: string) => void
  /** Keeps an employee who's thinking of quitting, with a raise (see `retentionRaise`). */
  keepEmployee: (id: string) => void
  /** Grants (the asked wage) or declines an employee's raise request after a level-up. */
  answerRaise: (id: string, grant: boolean) => void
  /** Switches `weekday` (0 = Monday) on or off as employee `id`'s day off, from the next morning. */
  toggleDayOff: (id: string, weekday: number) => void
  /** Gives everyone days off afresh with `autoRota`. */
  autoSchedule: () => void
  /** Dev: everyone on the lot gains a level's worth of experience now (Shift+G). */
  devGrowStaff: () => void
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
  setGraphics: (setting: GraphicsSetting) => void
  setQualityTier: (tier: number) => void
  cycleTimeScale: () => void
  /**
   * From the title screen: plays a fresh day 1 at `difficulty` (Medium if not
   * given) as the dealership `name` (tidied by `cleanName`).
   */
  newGame: (difficulty?: Difficulty, name?: string) => void
  /** From the title screen: resumes a saved game on the morning after its last day. */
  loadGame: (save: SaveData) => void
  /** From the win screen: play goes on, and the win screen won't show again. */
  keepPlaying: () => void
}
