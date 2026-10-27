import { PLAYER_ID } from '../sim/customers'
import { dealCustomer } from '../sim/deal'
import { coachEnds, stepDone, tutorialFor, type TutorialId } from '../sim/tutorials'
import { isPaused, useGame, winShowing } from './store'
import { subscribeDiff, subscribeTo } from './subscribe'
import type { GameState } from './types'

/** Walkthroughs that came up while something else was showing, oldest first. */
let pending: TutorialId[] = []

/** Whether the coach's current step is done in `s`. */
const stepPassed = (s: GameState) => !!s.coach && stepDone(s.coach.id, s.coach.step, s)

/**
 * Walkthroughs while they're on: watches the store for a feature coming up
 * (see `tutorialFor`) and shows its card once nothing else is (no card, steps,
 * guide or deal in hand), marking it seen. While its steps run, moves them on
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
      if (id) pending.push(id)
    }
    if (s.coach && coachEnds(s.coach.id, prev, s)) s.endTutorial()
    // Ending the steps may have shown a card already.
    const now = useGame.getState()
    // Anything seen meanwhile (its card shown some other way) is dropped.
    if (pending.some((id) => now.tutorialsSeen.includes(id))) {
      pending = pending.filter((id) => !now.tutorialsSeen.includes(id))
    }
    if (!now.tutorialsOn || pending.length === 0 || now.tutorialCard || now.coach) return
    if (isPaused(now) || dealCustomer(now.customers, PLAYER_ID) || winShowing(now)) return
    now.offerTutorial(pending.shift()!)
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
