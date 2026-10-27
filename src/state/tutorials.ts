import { PLAYER_ID } from '../sim/customers'
import { dealCustomer } from '../sim/deal'
import { coachEnds, stepDone, tutorialFor, TUTORIALS, type TutorialId } from '../sim/tutorials'
import { isPaused, useGame, winShowing } from './store'
import { subscribeDiff, subscribeTo } from './subscribe'
import type { GameState } from './types'

/** Walkthroughs that came up while something else was showing, oldest first. */
let pending: TutorialId[] = []

/** Whether the coach's current step is done in `s`. */
const stepPassed = (s: GameState) => !!s.coach && stepDone(s.coach.id, s.coach.step, s)

/** Whether walkthrough `id`'s card can come up in `s`, as far as the player's deal goes. */
const dealAllows = (id: TutorialId, s: GameState) =>
  !!TUTORIALS[id].inDeal || !dealCustomer(s.customers, PLAYER_ID)

/** Whether walkthrough `id`, waiting for its card, still has something to show in `s`. */
const stillRelevant = (id: TutorialId, s: GameState) => {
  const relevant = TUTORIALS[id].relevant
  return !relevant || relevant(s)
}

/**
 * Walkthroughs while they're on: watches the store for a feature coming up
 * (see `tutorialFor`) and shows its card once nothing else is (no card, steps
 * or guide, and no deal in hand unless it's about the deal), marking it seen.
 * The tips it covers are marked seen as soon as it comes up, so a tip never
 * shows while its card waits. One that's no longer `relevant` by then is
 * dropped unseen, to come up the next time. While its steps run, moves them on
 * as each is done, and ends a walkthrough that lasts the day (or the evening)
 * when it's over. Returns a function that stops both.
 */
export function startTutorials(): () => void {
  pending = []
  const stopCards = subscribeDiff((prev, s) => {
    // A new or resumed game starts with nothing waiting.
    if (s.screen !== prev.screen || !s.tutorialsOn) pending = []
    if (s.tutorialsOn) {
      const id = tutorialFor(prev, s, [...s.tutorialsSeen, ...pending])
      if (id) {
        pending.push(id)
        for (const tip of TUTORIALS[id].covers) s.markTipSeen(tip)
      }
    }
    if (s.coach && coachEnds(s.coach.id, prev, s)) s.endTutorial()
    // Ending the steps may have shown a card already.
    const now = useGame.getState()
    // Anything seen meanwhile (its card shown some other way), or past, is dropped.
    if (pending.some((id) => now.tutorialsSeen.includes(id) || !stillRelevant(id, now))) {
      pending = pending.filter((id) => !now.tutorialsSeen.includes(id) && stillRelevant(id, now))
    }
    if (!now.tutorialsOn || pending.length === 0 || now.tutorialCard || now.coach) return
    if (isPaused(now) || winShowing(now)) return
    const next = pending.find((id) => dealAllows(id, now))
    if (!next) return
    pending = pending.filter((id) => id !== next)
    now.offerTutorial(next)
  })
  const stopSteps = subscribeTo(
    (s) => s,
    (s) => {
      if (stepPassed(s)) s.advanceCoach()
    },
    (a, b) => a.coach === b.coach && stepPassed(a) === stepPassed(b),
  )
  return () => {
    stopCards()
    stopSteps()
  }
}
