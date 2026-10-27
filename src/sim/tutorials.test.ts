import { describe, expect, it } from 'vitest'
import { isAuctionDay } from './auction'
import { PLAYER_ID } from './customers'
import type { Employee } from './staff'
import {
  catchUpList,
  isTutorialId,
  nextStep,
  stepDone,
  stepsOf,
  TUTORIAL_IDS,
  TUTORIALS,
  tutorialFor,
  wordingFor,
  type CoachState,
} from './tutorials'

/** The first auction day (a Wednesday). */
const WEDNESDAY = [1, 2, 3, 4, 5, 6, 7].find(isAuctionDay)!

const state = (over: Partial<CoachState> = {}): CoachState => ({
  screen: 'playing',
  clock: { day: WEDNESDAY - 1 },
  career: { rank: 'main-street' },
  stockOpen: false,
  computerTab: 'stock',
  auction: null,
  auctionWins: [],
  roster: [],
  ...over,
})

const manager = { id: 'staff-1-1', role: 'buyer', fired: false } as Employee

describe('the walkthrough catalogue', () => {
  it('has a card, steps and its covered tips for each walkthrough', () => {
    for (const id of TUTORIAL_IDS) {
      const t = TUTORIALS[id]
      expect(t.card.length).toBeGreaterThanOrEqual(3)
      expect(t.steps.length).toBeGreaterThanOrEqual(2)
      expect(isTutorialId(id)).toBe(true)
    }
    expect(isTutorialId('nope')).toBe(false)
    expect(TUTORIALS.auction.covers).toEqual(['auction'])
  })

  it('words a key for the keyboard or for touch', () => {
    expect(wordingFor('Plain', true)).toBe('Plain')
    expect(wordingFor({ keys: 'Press J', touch: 'Tap Office' }, false)).toBe('Press J')
    expect(wordingFor({ keys: 'Press J', touch: 'Tap Office' }, true)).toBe('Tap Office')
  })
})

describe('tutorialFor', () => {
  it('brings up the auction as an auction day starts at Main Street', () => {
    const prev = state()
    expect(tutorialFor(prev, state({ clock: { day: WEDNESDAY } }), [])).toBe('auction')
  })

  it('brings it up on resuming a save onto an auction morning', () => {
    const title = state({ screen: 'title', clock: { day: 1 }, career: { rank: 'corner-lot' } })
    expect(tutorialFor(title, state({ clock: { day: WEDNESDAY } }), [])).toBe('auction')
  })

  it('waits for the morning: nothing mid-day, even on an auction day', () => {
    const morning = state({ clock: { day: WEDNESDAY } })
    expect(tutorialFor(morning, { ...morning, stockOpen: true }, [])).toBeNull()
    // A rank-up on a Wednesday evening waits for the next auction morning.
    const before = state({ clock: { day: WEDNESDAY }, career: { rank: 'corner-lot' } })
    expect(tutorialFor(before, morning, [])).toBeNull()
  })

  it('stays away before Main Street, on other days, on the title screen and once seen', () => {
    const prev = state()
    const next = state({ clock: { day: WEDNESDAY } })
    expect(tutorialFor(prev, { ...next, career: { rank: 'corner-lot' } }, [])).toBeNull()
    expect(
      tutorialFor(
        state({ clock: { day: WEDNESDAY } }),
        state({ clock: { day: WEDNESDAY + 1 } }),
        [],
      ),
    ).toBeNull()
    expect(tutorialFor(prev, { ...next, screen: 'title' }, [])).toBeNull()
    expect(tutorialFor(prev, next, ['auction'])).toBeNull()
  })
})

describe('the auction walkthrough’s steps', () => {
  it('opens the Auction tab, then waits for a bid', () => {
    expect(stepDone('auction', 0, state())).toBe(false)
    expect(stepDone('auction', 0, state({ stockOpen: true, computerTab: 'stock' }))).toBe(false)
    expect(stepDone('auction', 0, state({ stockOpen: true, computerTab: 'auction' }))).toBe(true)
    // The inspect step only explains: Next.
    expect(stepDone('auction', 1, state({ stockOpen: true, computerTab: 'auction' }))).toBe(false)
    expect(stepDone('auction', 2, state({ auction: { high: 'dealer-1' } }))).toBe(false)
    expect(stepDone('auction', 2, state({ auction: { high: PLAYER_ID } }))).toBe(true)
    expect(stepDone('auction', 2, state({ auctionWins: [{}] }))).toBe(true)
  })

  it('leaves out the max bid step without a used-car manager', () => {
    expect(stepsOf('auction', state())).toHaveLength(3)
    expect(stepsOf('auction', state({ roster: [manager] }))).toHaveLength(4)
    expect(nextStep('auction', -1, state())).toBe(0)
    expect(nextStep('auction', 2, state())).toBeNull()
    expect(nextStep('auction', 2, state({ roster: [manager] }))).toBe(3)
    expect(nextStep('auction', 3, state({ roster: [manager] }))).toBeNull()
  })
})

describe('catchUpList', () => {
  it('lists the unlocked walkthroughs not yet seen', () => {
    expect(catchUpList(state({ career: { rank: 'corner-lot' } }), [])).toEqual([])
    expect(catchUpList(state(), [])).toEqual(['auction'])
    expect(catchUpList(state(), ['auction'])).toEqual([])
  })
})
