import { nextStep, TUTORIALS } from '../../sim/tutorials'
import type { Kit } from '../core'
import type { GameState } from '../types'

type TutorialKeys =
  | 'offerTutorial'
  | 'startTutorial'
  | 'laterTutorial'
  | 'advanceCoach'
  | 'endTutorial'
  | 'setTutorialsOn'

/**
 * Walkthroughs: the card and the guided steps (see `sim/tutorials.ts`). What's
 * saved (on, seen, later, catch-up) and the card and coach start with `dayOne`;
 * `state/tutorials.ts` decides when a card comes up and when a step is done.
 */
export function tutorialsSlice(k: Kit): Pick<GameState, TutorialKeys> {
  const { get, set } = k
  return {
    offerTutorial: (id) => {
      const s = get()
      for (const tip of TUTORIALS[id].covers) s.markTipSeen(tip)
      const seen = get().tutorialsSeen
      set({ tutorialCard: id, tutorialsSeen: seen.includes(id) ? seen : [...seen, id] })
    },
    startTutorial: (id) => {
      const s = get()
      const step = nextStep(id, -1, s)
      set({
        tutorialCard: null,
        helpOpen: false,
        tutorialsLater: s.tutorialsLater.filter((x) => x !== id),
        coach: step === null ? null : { id, step },
      })
    },
    laterTutorial: () => {
      const { tutorialCard: id, tutorialsLater } = get()
      if (!id) return
      set({
        tutorialCard: null,
        tutorialsLater: tutorialsLater.includes(id) ? tutorialsLater : [id, ...tutorialsLater],
      })
    },
    advanceCoach: () => {
      const s = get()
      if (!s.coach) return
      const step = nextStep(s.coach.id, s.coach.step, s)
      set({ coach: step === null ? null : { id: s.coach.id, step } })
    },
    endTutorial: () => set({ coach: null }),
    setTutorialsOn: (on) =>
      set((s) => ({ tutorialsOn: on, tutorialCard: on ? s.tutorialCard : null })),
  }
}
