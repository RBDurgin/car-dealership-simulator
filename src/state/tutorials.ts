import { PLAYER_ID } from '../sim/customers'
import { dealCustomer } from '../sim/deal'
import { stepDone, tutorialFor, type TutorialId } from '../sim/tutorials'
import { isPaused, winShowing } from './store'
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
 * as each is done. Returns a function that stops both.
 */
export function startTutorials(): () => void {
  pending = []
  const stopCards = subscribeDiff((prev, s) => {
    // A new or resumed game starts with nothing waiting.
    if (s.screen !== prev.screen || !s.tutorialsOn) pending = []
    if (!s.tutorialsOn) return
    const id = tutorialFor(prev, s, [...s.tutorialsSeen, ...pending])
    if (id) pending.push(id)
    if (pending.length === 0 || s.tutorialCard || s.coach || isPaused(s)) return
    if (dealCustomer(s.customers, PLAYER_ID) || winShowing(s)) return
    s.offerTutorial(pending.shift()!)
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
