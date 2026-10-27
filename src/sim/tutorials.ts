import { auctionOpen, isAuctionDay } from './auction'
import type { Client } from './clients'
import { dayOver, type GameTime } from './clock'
import { bubbleOf, PLAYER_ID, type Customer, type CustomerPhase } from './customers'
import { dealCustomer, type Sale } from './deal'
import { financing } from './fi'
import type { RankId } from './progression'
import { usedCarManager, type Employee } from './staff'
import { bookGrew, financedAtMenu, newDriveBubble, newlyParked, type TipId } from './tips'

/**
 * Walkthroughs: a card when a feature first comes up, then, if the player
 * wants, a few guided steps that point at the right button or thing in the
 * world and move on when they do it. Pure: `tutorialFor` diffs two store
 * states like `tipFor`, and `state/tutorials.ts` shows the card and runs the
 * steps.
 */
export type TutorialId =
  | 'firstSale'
  | 'firstEvening'
  | 'runningThePlace'
  | 'auction'
  | 'usedCars'
  | 'testDrive'
  | 'fiMenu'
  | 'clientBook'
  | 'marketing'

/** Text that names a key, worded for a keyboard and for touch (see `COARSE`). */
export type Wording = string | { keys: string; touch: string }

/** `w` for a touch screen or a keyboard. */
export function wordingFor(w: Wording, touch: boolean): string {
  return typeof w === 'string' ? w : touch ? w.touch : w.keys
}

/** A HUD element a step rings: whatever carries `data-coach="<anchor>"`. */
export type CoachAnchor =
  | 'office'
  | 'staff'
  | `tab-${string}`
  | 'auction-inspect'
  | 'auction-bid'
  | 'auction-maxbid'
  | 'deal-ask'
  | 'deal-haggle'
  | 'deal-allowance'
  | 'deal-drive'
  | 'seller-offer'
  | 'drive-prompt'
  | 'fi-lenders'
  | 'fi-markup'
  | 'fi-products'
  | 'fi-sign'
  | 'clients-book'
  | 'clients-call'
  | 'clients-reception'
  | 'marketing-launch'
  | 'upgrades-buy'
  | 'summary-gross'
  | 'summary-net'
  | 'summary-reputation'
  | 'summary-next'
  | 'stock-order'
  | 'staff-hire'

/**
 * A thing in the world a step points an arrow at: a prop found in the live
 * layout's props (`computer`, `kiosk`, `desk`, `phone`), or the nearest of a
 * kind of customer: one waiting to be greeted (`customer`), a seller waiting
 * by their car (`seller`), a shopper with a 🔑 (`driveShopper`), or a car in
 * customer parking still to be appraised (`vehicle`).
 */
export type WorldTarget =
  'computer' | 'kiosk' | 'desk' | 'phone' | 'customer' | 'seller' | 'driveShopper' | 'vehicle'

/** A seller's car or a trade-in parked and not yet appraised: the `vehicle` target. */
export const toAppraise = (c: Customer) =>
  c.phase !== 'leaving' &&
  !!c.vehicle?.parked &&
  !!(c.selling ?? c.trade) &&
  !(c.selling ?? c.trade)!.appraised

/** A seller waiting by their car for someone to make an offer: the `seller` target. */
export const sellerWaiting = (c: Customer) =>
  !!c.selling && c.phase === 'waiting' && c.handlerId === null

/** A shopper with a 🔑 over them: the `driveShopper` target. */
export const wantsDriveNow = (c: Customer) => bubbleOf(c) === 'drive'

/** The slice of the store the triggers and the steps read. */
export interface CoachState {
  screen: 'title' | 'playing'
  clock: GameTime
  career: { rank: RankId }
  customers: readonly Customer[]
  dayStats: { sales: readonly Pick<Sale, 'soldBy'>[] }
  orders: readonly unknown[]
  stockOpen: boolean
  staffOpen: boolean
  computerTab: string
  /** Today's run at the dealer auction, null until it starts. */
  auction: { high: string | null } | null
  auctionWins: readonly unknown[]
  roster: readonly Employee[]
  /** Cars bought today, by the customer who sold them (a seller, or a buyer's trade). */
  purchases: readonly { customerId: string }[]
  clients: readonly Client[]
  /** Clients phoned today, and who the player is on the phone to. */
  callsTried: readonly string[]
  playerCall: string | null
  campaigns: readonly { startDay: number }[]
}

export interface Step {
  text: Wording
  /** HUD elements to ring: the first one on screen gets the ring. */
  ui?: readonly CoachAnchor[]
  world?: WorldTarget
  /** Passes once the player has done the step; without one, the step shows Next. */
  done?: (s: CoachState) => boolean
  /** Left out when this is false (e.g. a step about a role nobody has). */
  only?: (s: CoachState) => boolean
}

/**
 * When a walkthrough comes up: on an event (`applies` diffs two states), or
 * on a morning (`applies` reads the state as a day starts), so rank and
 * expansion unlocks never land mid-deal.
 */
export type Trigger =
  | { when: 'event'; applies: (prev: CoachState, next: CoachState) => boolean }
  | { when: 'morning'; applies: (s: CoachState) => boolean }

export interface Tutorial {
  title: string
  /** The card's bullets. */
  card: readonly Wording[]
  steps: readonly Step[]
  trigger: Trigger
  /** Whether the feature is open now, for the Tutorials tab and the catch-up. */
  unlocked: (s: CoachState) => boolean
  /** Easy's tips it replaces: marked seen when its card shows. */
  covers: readonly TipId[]
  /**
   * How long its steps last. `day`: they end when the day closes. `evening`:
   * they run over the day summary (hidden till then) and end when the next day
   * starts. Unset: they run till done, hidden while the day is over.
   */
  lasts?: 'day' | 'evening'
  /** Its card may come up in the middle of the player's deal (it's about the deal). */
  inDeal?: boolean
  /**
   * While its card waits to come up, whether it still has something to show:
   * once this is false it's dropped unseen, to come up the next time.
   */
  relevant?: (s: CoachState) => boolean
}

/** Days of a new game whose evening and morning walkthroughs still teach the basics. */
export const ONBOARDING_DAYS = 3

/** The morning marketing and upgrades are introduced, once the basics have settled in. */
export const MARKETING_DAY = 4

/** The player's deal in hand, if any. */
const playerDeal = (s: CoachState) => dealCustomer(s.customers, PLAYER_ID)

/** Whether the player's deal is in one of `phases`. */
function dealIn(s: CoachState, phases: readonly CustomerPhase[]): boolean {
  const c = playerDeal(s)
  return !!c && phases.includes(c.phase)
}

/** Whether the player has sold a car today (the summary's sales the player made). */
const playerSold = (s: CoachState) => s.dayStats.sales.some((x) => !x.soldBy)

/** The player's buyer at the F&I menu, if any. */
const atMenu = (s: CoachState) => {
  const c = playerDeal(s)
  return c?.phase === 'menu' ? c : null
}

/** The player's shopper's test drive, if they're on one (or back from it). */
const playerDrive = (s: CoachState) => {
  const d = playerDeal(s)?.drive
  return d?.by === PLAYER_ID ? d : null
}

const hasRole = (s: CoachState, role: Employee['role']) =>
  s.roster.some((e) => e.role === role && !e.fired)

/** Past the asking: they agreed, or are signing. */
const AGREED: readonly CustomerPhase[] = ['following', 'signing', 'menu']

export const TUTORIALS: Record<TutorialId, Tutorial> = {
  firstSale: {
    title: 'Your first sale',
    card: [
      'Customers come in, look over the cars and wait for someone to greet them.',
      'Greet one, ask a price for the car they want, and haggle until they say yes.',
      'Close the deal at your desk and sign the paperwork: what the car sold for over what it cost you is your gross.',
      'Each sale frees a space on the lot, to fill from the office computer.',
    ],
    steps: [
      {
        text: {
          keys: 'Click the floor to walk there, or use WASD. Q and E turn the view, and the wheel zooms.',
          touch:
            'Tap the floor to walk there. Pinch to zoom, and twist two fingers to turn the view.',
        },
      },
      {
        text: {
          keys: 'A customer waiting for you has a bubble over their head. Click them and choose Greet.',
          touch:
            'A customer waiting for you has a bubble over their head. Tap them and choose Greet.',
        },
        world: 'customer',
        done: (s) => !!playerDeal(s) || playerSold(s),
      },
      {
        text: 'Their panel shows the car they want, its MSRP, what it cost you and roughly what they hope to spend. Ask MSRP, or set a price with − and + and Ask.',
        ui: ['deal-ask'],
        done: (s) => {
          const c = playerDeal(s)
          return !!c?.offer || !!c?.haggle || dealIn(s, AGREED) || playerSold(s)
        },
      },
      {
        text: 'They say yes, counter or walk. On a counter, hold your price, split the difference or take theirs: they come up a little each round, but push too hard and they leave.',
        ui: ['deal-haggle', 'deal-ask'],
        done: (s) => dealIn(s, AGREED) || playerSold(s),
      },
      {
        text: {
          keys: 'They agreed, and follow you. Walk to your desk by the office door, click it and choose Close deal.',
          touch:
            'They agreed, and follow you. Walk to your desk by the office door, tap it and choose Close deal.',
        },
        world: 'desk',
        done: (s) => dealIn(s, ['signing', 'menu']) || playerSold(s),
      },
      {
        text: 'At the F&I menu, pick a lender if they’re financing, offer a product or two if you like, then sign the contracts.',
        ui: ['fi-sign'],
        done: playerSold,
      },
    ],
    trigger: { when: 'morning', applies: (s) => s.clock.day === 1 },
    unlocked: () => true,
    covers: ['haggle', 'restock'],
    lasts: 'day',
  },
  firstEvening: {
    title: 'The end of the day',
    card: [
      'At closing the doors shut, the last customers leave and the day summary comes up.',
      'It adds up the day: what you sold, what it cost you, and what you paid out.',
      'Your reputation moves with every customer: the higher it is, the more come in.',
      'The game saves at the end of each day, and carries on from the next morning.',
    ],
    steps: [
      {
        text: 'Gross profit is what your cars sold for over what you paid for them. F&I, and later service, add to it.',
        ui: ['summary-gross'],
      },
      {
        text: 'Wages and commissions are paid at closing, with any interest, ads and upgrades. What’s left is the Net.',
        ui: ['summary-net'],
      },
      {
        text: 'Reputation goes up with sales, and down for customers who left unhappy or found nothing they wanted.',
        ui: ['summary-reputation'],
      },
      {
        text: 'Start the next day when you’re ready.',
        ui: ['summary-next'],
        done: (s) => !dayOver(s),
      },
    ],
    trigger: {
      when: 'event',
      applies: (prev, next) => next.clock.day <= ONBOARDING_DAYS && dayOver(next) && !dayOver(prev),
    },
    unlocked: () => true,
    covers: [],
    lasts: 'evening',
  },
  runningThePlace: {
    title: 'Running the place',
    card: [
      'Cars you sell leave spaces on the lot. Order more on the office computer: they arrive the next morning.',
      'Pay cash, or put a car on the floor plan: the bank pays, and you pay a little interest each day until it sells.',
      'Hire staff from the Staff panel. A salesperson sells beside you; others greet, wash cars or run the finance desk.',
      'Wages are paid at closing whether they sell or not, so grow the team as sales grow.',
    ],
    steps: [
      {
        text: {
          keys: 'Open the office computer’s Stock tab: press I, use the Office button, or walk to the computer in the office.',
          touch:
            'Open the office computer’s Stock tab: tap Office, or walk to the computer in the office.',
        },
        ui: ['tab-stock', 'office'],
        world: 'computer',
        done: (s) => s.stockOpen && s.computerTab === 'stock',
      },
      {
        text: 'Pick a model and choose Buy (cash) or Floor plan. It goes in the first free space tomorrow morning.',
        ui: ['stock-order'],
        done: (s) => s.orders.length > 0,
      },
      {
        text: {
          keys: 'Now open the Staff panel: press H or use the Staff button.',
          touch: 'Now tap Staff.',
        },
        ui: ['staff'],
        done: (s) => s.staffOpen,
      },
      {
        text: 'Today’s applicants are at the bottom, with their skill and wage. Hire one if the wage pays for itself; you can let them go any time.',
        ui: ['staff-hire'],
        done: (s) => s.roster.some((e) => e.hiredDay === s.clock.day && !e.fired),
      },
    ],
    trigger: {
      when: 'morning',
      applies: (s) => s.clock.day >= 2 && s.clock.day <= ONBOARDING_DAYS,
    },
    unlocked: () => true,
    covers: [],
  },
  auction: {
    title: 'The dealer auction',
    card: [
      'Every Wednesday from 10:00 the dealer auction runs: used cars go on the block one at a time, and you bid against the other dealers.',
      'The run list goes up on Monday. Each lot has a grade from the sheet and an estimate of what the trade pays for it.',
      'A car you win costs its price plus a buyer’s fee, needs a free lot space, and is on your lot tomorrow.',
      'Leave room under the estimate for your margin when you sell it on.',
    ],
    steps: [
      {
        text: {
          keys: 'Open the office computer’s Auction tab: press J, use the Office button, or walk to the computer in the office.',
          touch:
            'Open the office computer’s Auction tab: tap Office, or walk to the computer in the office.',
        },
        ui: ['tab-auction', 'office'],
        world: 'computer',
        done: (s) => s.stockOpen && s.computerTab === 'auction',
      },
      {
        text: 'The sheet’s grades read a little kind. Inspect a lot before it runs for a closer look, for a small fee.',
        ui: ['auction-inspect'],
      },
      {
        text: 'From 10:00 each lot comes up on the block. Bid while the price leaves you a margin, or Pass to let the dealers have it.',
        ui: ['auction-bid'],
        done: (s) => s.auction?.high === PLAYER_ID || s.auctionWins.length > 0,
      },
      {
        text: 'Your used-car manager inspects the whole run and bids for you while you sell: set a max bid on each lot you want.',
        ui: ['auction-maxbid'],
        world: 'kiosk',
        only: (s) => !!usedCarManager(s.roster),
      },
    ],
    trigger: {
      when: 'morning',
      applies: (s) => auctionOpen(s.career) && isAuctionDay(s.clock.day),
    },
    unlocked: (s) => auctionOpen(s.career),
    covers: ['auction'],
  },
  usedCars: {
    title: 'Used cars',
    card: [
      'Some drivers park in customer parking with a car to sell for cash, and some shoppers bring one to trade in.',
      'Appraise the car before you name a number: at a glance you can be well off what it’s worth.',
      'Buy it under what it’ll sell for: it goes on your lot tomorrow as used stock, and loses a little value every day.',
      'With a trade, set an allowance as you ask: they weigh what they pay after it, and a lowball allowance offends them.',
    ],
    steps: [
      {
        text: {
          keys: 'Walk to the car in customer parking (the arrow), click the car itself and choose Appraise.',
          touch:
            'Walk to the car in customer parking (the arrow), tap the car itself and choose Appraise.',
        },
        world: 'vehicle',
        done: (s) => s.customers.some((c) => !!(c.selling ?? c.trade)?.appraised),
      },
      {
        text: {
          keys: 'A seller waits by their car. Click them and choose Make offer, then offer under the estimate: the panel shows your margin.',
          touch:
            'A seller waits by their car. Tap them and choose Make offer, then offer under the estimate: the panel shows your margin.',
        },
        ui: ['seller-offer'],
        world: 'seller',
        only: (s) => s.customers.some((c) => !!c.selling && c.phase !== 'leaving'),
        done: (s) => {
          const c = playerDeal(s)
          const sellers = new Set(s.customers.filter((x) => x.selling).map((x) => x.id))
          return (
            (!!c?.selling && (!!c.offer || !!c.haggle)) ||
            s.purchases.some((p) => sellers.has(p.customerId))
          )
        },
      },
      {
        text: 'Greet the buyer with the trade-in and ask your price: the second stepper sets what you allow for their car. What they pay after it is what they weigh.',
        ui: ['deal-allowance', 'deal-ask'],
        only: (s) => s.customers.some((c) => !!c.trade && c.phase !== 'leaving'),
        done: (s) => {
          const c = playerDeal(s)
          return (!!c?.trade && (c.offer?.allowance !== undefined || !!c.haggle)) || playerSold(s)
        },
      },
      {
        text: 'Cars you buy go on the lot tomorrow, priced for what they’re worth. Every day they sit they’re worth a little less, so don’t hold out for too much.',
      },
    ],
    trigger: {
      when: 'event',
      applies: (prev, next) =>
        newlyParked(prev.customers, next.customers, 'seller') ||
        newlyParked(prev.customers, next.customers, 'trade'),
    },
    unlocked: () => true,
    covers: ['seller', 'tradeIn'],
    inDeal: true,
    relevant: (s) => s.customers.some(toAppraise),
  },
  testDrive: {
    title: 'Test drives',
    card: [
      'A shopper with a 🔑 over them wants to drive the car before they talk price.',
      'Ride along: on the road they ask about the car, and pointing out what suits them makes a yes likelier and a smaller discount.',
      'Give them a price without the drive and they’re cooler on it.',
      'A salesperson can take the drive for you while you stay on the floor.',
    ],
    steps: [
      {
        text: 'Greet the shopper with the 🔑, then choose 🔑 Test drive in their panel.',
        ui: ['deal-drive'],
        world: 'driveShopper',
        done: (s) => !!playerDrive(s) || playerSold(s),
      },
      {
        text: {
          keys: 'They walk to the car. Choose Get in on their panel (or click the car) to set off.',
          touch: 'They walk to the car. Choose Get in on their panel (or tap the car) to set off.',
        },
        ui: ['deal-drive'],
        done: (s) => dealIn(s, ['driving']) || !!playerDrive(s)?.back || playerSold(s),
      },
      {
        text: {
          keys: 'On the road they ask about the car. Point out what suits them (press 1–3 or click): their kind of shopper is in their panel.',
          touch:
            'On the road they ask about the car. Tap what suits them: their kind of shopper is in their panel.',
        },
        ui: ['drive-prompt'],
        done: (s) => {
          const d = playerDrive(s)
          return !!d?.points.some((p) => p.topic) || !!d?.back || playerSold(s)
        },
      },
      {
        text: 'Back on the lot, ask your price: a good drive makes them warmer to it.',
        ui: ['deal-ask'],
        done: (s) => {
          const c = playerDeal(s)
          return (!!c?.drive?.back && (!!c.offer || !!c.haggle)) || playerSold(s)
        },
      },
      {
        text: 'With a salesperson free, Send with … in the shopper’s panel hands them the drive, and they carry on with the sale.',
        only: (s) => hasRole(s, 'sales'),
      },
    ],
    trigger: {
      when: 'event',
      applies: (prev, next) => newDriveBubble(prev.customers, next.customers),
    },
    unlocked: () => true,
    covers: ['testDrive'],
    inDeal: true,
    relevant: (s) => s.customers.some(wantsDriveNow),
  },
  fiMenu: {
    title: 'The F&I menu',
    card: [
      'This buyer is financing: you arrange the loan, and can sell them products on top.',
      'Each lender takes some credit tiers and not others. The markup over the lender’s buy rate earns you a reserve.',
      'Present products one at a time: each is answered at once.',
      'Every product shown and every point of markup makes the next yes harder, and a buyer pushed hard is less happy and likelier to cancel later.',
    ],
    steps: [
      {
        text: 'Pick a lender. The greyed-out ones won’t take this buyer, and say why.',
        ui: ['fi-lenders'],
      },
      {
        text: 'Set the markup: each point earns a reserve, but pushes their payment up.',
        ui: ['fi-markup'],
      },
      {
        text: 'Present a product at a price: they say yes or no at once. Turned down, it can be presented again for less.',
        ui: ['fi-products'],
        done: (s) => {
          const c = atMenu(s)
          return !c || (c.fi?.presented ?? 0) > 0
        },
      },
      {
        text: 'Sign the contracts when you’re done: the loan’s reserve and the products add to the deal’s gross.',
        ui: ['fi-sign'],
        done: (s) => !atMenu(s),
      },
    ],
    trigger: {
      when: 'event',
      applies: (prev, next) => financedAtMenu(prev.customers, next.customers),
    },
    unlocked: () => true,
    covers: ['fiMenu'],
    inDeal: true,
    relevant: (s) => {
      const c = atMenu(s)
      return !!c && financing(c)
    },
  },
  clientBook: {
    title: 'Your client book',
    card: [
      'Buyers go in your client book, and shoppers who talked to you but didn’t buy stay as prospects for two weeks.',
      'Each visit leaves them more or less happy: waits, haggling and the price all count.',
      'Happy clients come back to trade up, send friends and take your calls.',
      'Call a prospect back from the desk phone, and a be-back who books comes in ready to deal.',
    ],
    steps: [
      {
        text: {
          keys: 'Open the office computer’s Clients tab: press L, use the Office button, or walk to the computer in the office.',
          touch:
            'Open the office computer’s Clients tab: tap Office, or walk to the computer in the office.',
        },
        ui: ['tab-clients', 'office'],
        world: 'computer',
        done: (s) => s.stockOpen && s.computerTab === 'clients',
      },
      {
        text: 'Each row is someone from the book: client or prospect, how happy their last visit left them and why. A ★ over a waiting customer means they’ve been here before.',
        ui: ['clients-book'],
      },
      {
        text: {
          keys: 'Call someone: Call on their row, or walk to the desk phone in the office, click it and choose Call.',
          touch:
            'Call someone: Call on their row, or walk to the desk phone in the office, tap it and choose Call.',
        },
        ui: ['clients-call'],
        world: 'phone',
        done: (s) => !!s.playerCall || s.callsTried.length > 0,
      },
      {
        text: 'Your receptionist can work the list between customers: tick it here.',
        ui: ['clients-reception'],
        only: (s) => hasRole(s, 'receptionist'),
      },
    ],
    trigger: { when: 'event', applies: (prev, next) => bookGrew(prev.clients, next.clients) },
    unlocked: () => true,
    covers: ['clientBook', 'followUp'],
  },
  marketing: {
    title: 'Marketing and upgrades',
    card: [
      'Ads bring more people in: each channel reaches a different crowd, for a few days, paid up front.',
      'Running the same channel again brings less each time.',
      'Upgrades last: a bigger sign, a tube man out front, a nicer showroom. Each goes up overnight.',
      'Spend what the extra sales will pay back.',
    ],
    steps: [
      {
        text: {
          keys: 'Open the office computer’s Marketing tab: press M, or use the Office button.',
          touch: 'Open the office computer’s Marketing tab: tap Office.',
        },
        ui: ['tab-marketing', 'office'],
        done: (s) => s.stockOpen && s.computerTab === 'marketing',
      },
      {
        text: 'Book a campaign if you can spare the cash: it’s paid now and brings people in from tomorrow.',
        ui: ['marketing-launch'],
        done: (s) => s.campaigns.some((c) => c.startDay > s.clock.day),
      },
      {
        text: {
          keys: 'Now the Upgrades tab (U).',
          touch: 'Now the Upgrades tab.',
        },
        ui: ['tab-upgrades'],
        done: (s) => s.stockOpen && s.computerTab === 'upgrades',
      },
      {
        text: 'Each upgrade says what it does. It goes up overnight and works from then on; a better one in the same spot replaces it.',
        ui: ['upgrades-buy'],
      },
    ],
    trigger: { when: 'morning', applies: (s) => s.clock.day >= MARKETING_DAY },
    unlocked: (s) => s.clock.day >= MARKETING_DAY,
    covers: [],
  },
}

export const TUTORIAL_IDS = Object.keys(TUTORIALS) as TutorialId[]

export function isTutorialId(v: unknown): v is TutorialId {
  return (TUTORIAL_IDS as readonly unknown[]).includes(v)
}

/** A day has just started: the day moved on, or a game started or resumed from the title screen. */
function dayStarted(prev: CoachState, next: CoachState): boolean {
  return prev.screen !== 'playing' || prev.clock.day !== next.clock.day
}

/**
 * The first walkthrough not yet in `seen` that the change from `prev` to
 * `next` calls for, or null. Morning walkthroughs are checked only as a day
 * starts, event ones only while a game is under way.
 */
export function tutorialFor(
  prev: CoachState,
  next: CoachState,
  seen: readonly TutorialId[],
): TutorialId | null {
  if (next.screen !== 'playing') return null
  const morning = dayStarted(prev, next)
  if (!morning && prev === next) return null
  return (
    TUTORIAL_IDS.find((id) => {
      if (seen.includes(id)) return false
      const t = TUTORIALS[id].trigger
      if (t.when === 'morning') return morning && t.applies(next)
      return prev.screen === 'playing' && t.applies(prev, next)
    }) ?? null
  )
}

/**
 * Whether walkthrough `id`'s steps end with the change from `prev` to `next`:
 * as the day closes (`lasts: 'day'`) or the next one starts (`'evening'`).
 */
export function coachEnds(id: TutorialId, prev: CoachState, next: CoachState): boolean {
  const lasts = TUTORIALS[id].lasts
  if (lasts === 'day') return dayOver(next) && !dayOver(prev)
  if (lasts === 'evening') return dayOver(prev) && !dayOver(next)
  return false
}

/** Whether walkthrough `id`'s steps show in `s`: an evening one over the summary, the rest during the day. */
export function coachShows(id: TutorialId, s: CoachState): boolean {
  return dayOver(s) === (TUTORIALS[id].lasts === 'evening')
}

const shows = (step: Step, s: CoachState) => !step.only || step.only(s)

/** Walkthrough `id`'s steps that apply in `s`. */
export function stepsOf(id: TutorialId, s: CoachState): Step[] {
  return TUTORIALS[id].steps.filter((step) => shows(step, s))
}

/** The index of the first step of `id` after `step` (or from 0 with -1) that applies in `s`, or null at the end. */
export function nextStep(id: TutorialId, step: number, s: CoachState): number | null {
  const steps = TUTORIALS[id].steps
  for (let i = step + 1; i < steps.length; i++) if (shows(steps[i], s)) return i
  return null
}

/** Whether the player has done step `step` of `id` (never, for a step that shows Next). */
export function stepDone(id: TutorialId, step: number, s: CoachState): boolean {
  const done = TUTORIALS[id].steps[step]?.done
  return !!done && done(s)
}

/** The walkthroughs a new game opens with, on its first days. */
export const ONBOARDING: readonly TutorialId[] = ['firstSale', 'firstEvening', 'runningThePlace']

/**
 * Walkthroughs whose feature is open in `s` that haven't been seen, leaving
 * out the onboarding (a game already under way is past it).
 */
export function catchUpList(s: CoachState, seen: readonly TutorialId[]): TutorialId[] {
  return TUTORIAL_IDS.filter(
    (id) => !ONBOARDING.includes(id) && !seen.includes(id) && TUTORIALS[id].unlocked(s),
  )
}
