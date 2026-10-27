import { auctionOpen, isAuctionDay } from './auction'
import { dayOver, type GameTime } from './clock'
import { PLAYER_ID, type Customer, type CustomerPhase } from './customers'
import { dealCustomer, type Sale } from './deal'
import type { RankId } from './progression'
import { usedCarManager, type Employee } from './staff'
import type { TipId } from './tips'

/**
 * Walkthroughs: a card when a feature first comes up, then, if the player
 * wants, a few guided steps that point at the right button or thing in the
 * world and move on when they do it. Pure: `tutorialFor` diffs two store
 * states like `tipFor`, and `state/tutorials.ts` shows the card and runs the
 * steps.
 */
export type TutorialId = 'firstSale' | 'firstEvening' | 'runningThePlace' | 'auction'

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
  | 'fi-sign'
  | 'summary-gross'
  | 'summary-net'
  | 'summary-reputation'
  | 'summary-next'
  | 'stock-order'
  | 'staff-hire'

/**
 * A thing in the world a step points an arrow at: a prop found in the live
 * layout's props, or (`customer`) the nearest customer waiting to be greeted.
 */
export type WorldTarget = 'computer' | 'kiosk' | 'desk' | 'customer'

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
}

/** Days of a new game whose evening and morning walkthroughs still teach the basics. */
export const ONBOARDING_DAYS = 3

/** The player's deal in hand, if any. */
const playerDeal = (s: CoachState) => dealCustomer(s.customers, PLAYER_ID)

/** Whether the player's deal is in one of `phases`. */
function dealIn(s: CoachState, phases: readonly CustomerPhase[]): boolean {
  const c = playerDeal(s)
  return !!c && phases.includes(c.phase)
}

/** Whether the player has sold a car today (the summary's sales the player made). */
const playerSold = (s: CoachState) => s.dayStats.sales.some((x) => !x.soldBy)

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
