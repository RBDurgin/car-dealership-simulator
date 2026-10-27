import { auctionOpen, isAuctionDay } from './auction'
import { PLAYER_ID } from './customers'
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
export type TutorialId = 'auction'

/** Text that names a key, worded for a keyboard and for touch (see `COARSE`). */
export type Wording = string | { keys: string; touch: string }

/** `w` for a touch screen or a keyboard. */
export function wordingFor(w: Wording, touch: boolean): string {
  return typeof w === 'string' ? w : touch ? w.touch : w.keys
}

/** A HUD element a step rings: whatever carries `data-coach="<anchor>"`. */
export type CoachAnchor =
  'office' | 'staff' | `tab-${string}` | 'auction-inspect' | 'auction-bid' | 'auction-maxbid'

/** A thing in the world a step points an arrow at, found in the live layout's props. */
export type WorldTarget = 'computer' | 'kiosk'

/** The slice of the store the triggers and the steps read. */
export interface CoachState {
  screen: 'title' | 'playing'
  clock: { day: number }
  career: { rank: RankId }
  stockOpen: boolean
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
}

export const TUTORIALS: Record<TutorialId, Tutorial> = {
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

/** Walkthroughs whose feature is open in `s` that haven't been seen. */
export function catchUpList(s: CoachState, seen: readonly TutorialId[]): TutorialId[] {
  return TUTORIAL_IDS.filter((id) => !seen.includes(id) && TUTORIALS[id].unlocked(s))
}
