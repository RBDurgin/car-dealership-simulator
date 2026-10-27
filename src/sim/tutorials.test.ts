import { describe, expect, it } from 'vitest'
import { isAuctionDay } from './auction'
import { CLOSE_MINUTE, OPEN_MINUTE } from './clock'
import { PLAYER_ID } from './customers'
import type { Employee } from './staff'
import type { Customer } from './customers'
import {
  catchUpList,
  coachEnds,
  coachShows,
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

/** An auction day (a Wednesday) past the onboarding's days. */
const WEDNESDAY = [8, 9, 10, 11, 12, 13, 14].find(isAuctionDay)!

/** Opening time on `day`. */
const at = (day: number) => ({ day, minute: OPEN_MINUTE })

const state = (over: Partial<CoachState> = {}): CoachState => ({
  screen: 'playing',
  clock: at(WEDNESDAY - 1),
  career: { rank: 'main-street' },
  customers: [],
  dayStats: { sales: [] },
  orders: [],
  stockOpen: false,
  staffOpen: false,
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
    expect(tutorialFor(prev, state({ clock: at(WEDNESDAY) }), [])).toBe('auction')
  })

  it('brings it up on resuming a save onto an auction morning', () => {
    const title = state({ screen: 'title', clock: at(1), career: { rank: 'corner-lot' } })
    expect(tutorialFor(title, state({ clock: at(WEDNESDAY) }), [])).toBe('auction')
  })

  it('waits for the morning: nothing mid-day, even on an auction day', () => {
    const morning = state({ clock: at(WEDNESDAY) })
    expect(tutorialFor(morning, { ...morning, stockOpen: true }, [])).toBeNull()
    // A rank-up on a Wednesday evening waits for the next auction morning.
    const before = state({ clock: at(WEDNESDAY), career: { rank: 'corner-lot' } })
    expect(tutorialFor(before, morning, [])).toBeNull()
  })

  it('stays away before Main Street, on other days, on the title screen and once seen', () => {
    const prev = state()
    const next = state({ clock: at(WEDNESDAY) })
    expect(tutorialFor(prev, { ...next, career: { rank: 'corner-lot' } }, [])).toBeNull()
    expect(
      tutorialFor(state({ clock: at(WEDNESDAY) }), state({ clock: at(WEDNESDAY + 1) }), []),
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

/** The player's customer in `phase`, with what the steps read. */
const dealing = (phase: Customer['phase'], over: Partial<Customer> = {}) =>
  ({ id: 'c1', handlerId: PLAYER_ID, phase, offer: null, haggle: null, ...over }) as Customer

/** Closing time on day `day`, with `customers` still on the lot. */
const closing = (day: number, customers: Customer[] = []) =>
  state({ clock: { day, minute: CLOSE_MINUTE }, customers })

describe('the onboarding', () => {
  it('starts a new game with the first sale, and nothing on a later resume', () => {
    const title = state({ screen: 'title', clock: at(1) })
    expect(tutorialFor(title, state({ clock: at(1) }), [])).toBe('firstSale')
    expect(tutorialFor(title, state({ clock: at(5), career: { rank: 'corner-lot' } }), [])).toBe(
      null,
    )
  })

  it('explains the first evening as the day ends, in the first days only', () => {
    const leaving = [dealing('leaving', { handlerId: null })]
    expect(tutorialFor(closing(1, leaving), closing(1), [])).toBe('firstEvening')
    expect(tutorialFor(state({ clock: at(1) }), state({ clock: at(1) }), [])).toBeNull()
    expect(tutorialFor(closing(8, leaving), closing(8), [])).toBeNull()
    expect(tutorialFor(closing(1, leaving), closing(1), ['firstEvening'])).toBeNull()
  })

  it('shows ordering and hiring on day two’s morning', () => {
    const corner = { career: { rank: 'corner-lot' as const } }
    expect(
      tutorialFor(state({ ...corner, clock: at(1) }), state({ ...corner, clock: at(2) }), []),
    ).toBe('runningThePlace')
    expect(
      tutorialFor(state({ ...corner, clock: at(4) }), state({ ...corner, clock: at(5) }), []),
    ).toBeNull()
  })

  it('moves the first sale on as the deal does', () => {
    const at1 = (over: Partial<CoachState> = {}) => state({ clock: at(1), ...over })
    // Moving only explains.
    expect(stepDone('firstSale', 0, at1())).toBe(false)
    expect(stepDone('firstSale', 1, at1())).toBe(false)
    expect(stepDone('firstSale', 1, at1({ customers: [dealing('talking')] }))).toBe(true)
    expect(stepDone('firstSale', 2, at1({ customers: [dealing('talking')] }))).toBe(false)
    const asked = dealing('considering', { offer: { carId: 'x', price: 1 } as Customer['offer'] })
    expect(stepDone('firstSale', 2, at1({ customers: [asked] }))).toBe(true)
    expect(stepDone('firstSale', 3, at1({ customers: [asked] }))).toBe(false)
    expect(stepDone('firstSale', 3, at1({ customers: [dealing('following')] }))).toBe(true)
    expect(stepDone('firstSale', 4, at1({ customers: [dealing('following')] }))).toBe(false)
    expect(stepDone('firstSale', 4, at1({ customers: [dealing('menu')] }))).toBe(true)
    expect(stepDone('firstSale', 5, at1({ customers: [dealing('menu')] }))).toBe(false)
    // A sale a salesperson made isn't the player's.
    expect(stepDone('firstSale', 5, at1({ dayStats: { sales: [{ soldBy: 'Ann' }] } }))).toBe(false)
    const sold = at1({ dayStats: { sales: [{ soldBy: null }] } })
    for (let i = 1; i <= 5; i++) expect(stepDone('firstSale', i, sold)).toBe(true)
  })

  it('moves day two on as stock is ordered and someone hired', () => {
    const day2 = (over: Partial<CoachState> = {}) => state({ clock: at(2), ...over })
    expect(stepDone('runningThePlace', 0, day2({ stockOpen: true, computerTab: 'stock' }))).toBe(
      true,
    )
    expect(stepDone('runningThePlace', 1, day2())).toBe(false)
    expect(stepDone('runningThePlace', 1, day2({ orders: [{}] }))).toBe(true)
    expect(stepDone('runningThePlace', 2, day2({ staffOpen: true }))).toBe(true)
    const hired = (hiredDay: number) => [{ id: 'e', hiredDay, fired: false } as Employee]
    expect(stepDone('runningThePlace', 3, day2({ roster: hired(1) }))).toBe(false)
    expect(stepDone('runningThePlace', 3, day2({ roster: hired(2) }))).toBe(true)
  })

  it('ends the first sale at closing, and the evening’s as the next day starts', () => {
    const leaving = [dealing('leaving', { handlerId: null })]
    expect(coachEnds('firstSale', closing(1, leaving), closing(1))).toBe(true)
    expect(coachEnds('firstSale', state({ clock: at(1) }), state({ clock: at(1) }))).toBe(false)
    expect(coachEnds('firstEvening', closing(1), state({ clock: at(2) }))).toBe(true)
    expect(coachEnds('firstEvening', closing(1, leaving), closing(1))).toBe(false)
    expect(coachEnds('auction', closing(1, leaving), closing(1))).toBe(false)
    expect(stepDone('firstEvening', 3, closing(1))).toBe(false)
    expect(stepDone('firstEvening', 3, state({ clock: at(2) }))).toBe(true)
  })

  it('shows the evening’s steps over the summary, the rest during the day', () => {
    expect(coachShows('firstEvening', closing(1))).toBe(true)
    expect(coachShows('firstEvening', state())).toBe(false)
    expect(coachShows('firstSale', closing(1))).toBe(false)
    expect(coachShows('auction', state())).toBe(true)
  })
})
