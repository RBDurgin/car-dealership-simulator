import { describe, expect, it } from 'vitest'
import { isAuctionDay } from './auction'
import { CLOSE_MINUTE, OPEN_MINUTE } from './clock'
import { PLAYER_ID } from './customers'
import type { Employee } from './staff'
import type { Customer } from './customers'
import {
  catchUpList,
  MARKETING_DAY,
  ONBOARDING,
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
  type TutorialId,
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
  purchases: [],
  clients: [],
  callsTried: [],
  playerCall: null,
  campaigns: [],
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
    // Marketing's morning has passed.
    const seen: TutorialId[] = ['marketing']
    expect(tutorialFor(prev, { ...next, career: { rank: 'corner-lot' } }, seen)).toBeNull()
    expect(
      tutorialFor(state({ clock: at(WEDNESDAY) }), state({ clock: at(WEDNESDAY + 1) }), seen),
    ).toBeNull()
    expect(tutorialFor(prev, { ...next, screen: 'title' }, seen)).toBeNull()
    expect(tutorialFor(prev, next, ['auction', ...seen])).toBeNull()
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
    const encounters = ['usedCars', 'testDrive', 'fiMenu', 'clientBook', 'marketing']
    expect(catchUpList(state({ career: { rank: 'corner-lot' } }), [])).toEqual(encounters)
    expect(catchUpList(state({ career: { rank: 'corner-lot' }, clock: at(3) }), [])).toEqual(
      encounters.filter((id) => id !== 'marketing'),
    )
    expect(catchUpList(state(), encounters as TutorialId[])).toEqual(['auction'])
    expect(catchUpList(state(), ['auction', ...(encounters as TutorialId[])])).toEqual([])
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
    const resumed = state({ clock: at(5), career: { rank: 'corner-lot' } })
    expect(tutorialFor(title, resumed, ['marketing'])).toBeNull()
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
      tutorialFor(state({ ...corner, clock: at(4) }), state({ ...corner, clock: at(5) }), [
        'marketing',
      ]),
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

/** A customer with what the triggers and steps read. */
const cust = (over: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    handlerId: null,
    phase: 'waiting',
    offer: null,
    haggle: null,
    selling: null,
    trade: null,
    vehicle: null,
    wantsDrive: false,
    drive: null,
    patience: 1,
    ...over,
  }) as Customer

const look = (appraised = false) => ({ hope: 1, estimate: { estimate: 1 }, appraised })
const car = (parked: boolean) => ({ car: {}, spot: 0, parked }) as unknown as Customer['vehicle']

/** A mid-day change from `before` to `after` customers, past the onboarding. */
const change = (before: Customer[], after: Customer[], seen: TutorialId[] = []) =>
  tutorialFor(state({ customers: before }), state({ customers: after }), seen)

describe('the early encounters', () => {
  it('brings up used cars when a seller or a trade-in parks', () => {
    const seller = (parked: boolean) =>
      cust({ selling: look() as Customer['selling'], vehicle: car(parked), phase: 'arriving' })
    expect(change([seller(false)], [seller(true)])).toBe('usedCars')
    const trader = (parked: boolean) =>
      cust({ trade: look() as Customer['trade'], vehicle: car(parked), phase: 'arriving' })
    expect(change([trader(false)], [trader(true)])).toBe('usedCars')
    expect(change([seller(true)], [seller(true)])).toBeNull()
    expect(change([seller(false)], [seller(true)], ['usedCars'])).toBeNull()
    expect(TUTORIALS.usedCars.covers).toEqual(['seller', 'tradeIn'])
  })

  it('keeps used cars while a car waits to be appraised', () => {
    const parked = cust({ selling: look() as Customer['selling'], vehicle: car(true) })
    const relevant = TUTORIALS.usedCars.relevant!
    expect(relevant(state({ customers: [parked] }))).toBe(true)
    const done = { ...parked, selling: look(true) as Customer['selling'] }
    expect(relevant(state({ customers: [done] }))).toBe(false)
    expect(relevant(state({ customers: [{ ...parked, phase: 'leaving' }] }))).toBe(false)
  })

  it('walks used cars through appraising, an offer and an allowance', () => {
    const seller = cust({ selling: look(true) as Customer['selling'], vehicle: car(true) })
    expect(stepDone('usedCars', 0, state({ customers: [cust()] }))).toBe(false)
    expect(stepDone('usedCars', 0, state({ customers: [seller] }))).toBe(true)
    // The seller's step only with a seller about, the trade's only with a trade.
    expect(stepsOf('usedCars', state({ customers: [seller] }))).toHaveLength(3)
    const offered = { ...seller, handlerId: PLAYER_ID, phase: 'considering' as const }
    expect(stepDone('usedCars', 1, state({ customers: [{ ...offered }] }))).toBe(false)
    const asked = { ...offered, offer: { carId: 'x', price: 1 } } as Customer
    expect(stepDone('usedCars', 1, state({ customers: [asked] }))).toBe(true)
    expect(
      stepDone('usedCars', 1, state({ customers: [seller], purchases: [{ customerId: 'c1' }] })),
    ).toBe(true)
    const trader = cust({
      trade: look(true) as Customer['trade'],
      handlerId: PLAYER_ID,
      phase: 'considering',
      offer: { carId: 'x', price: 1 } as Customer['offer'],
    })
    expect(stepsOf('usedCars', state({ customers: [trader] }))).toHaveLength(3)
    expect(stepDone('usedCars', 2, state({ customers: [trader] }))).toBe(false)
    const allowed = { ...trader, offer: { carId: 'x', price: 1, allowance: 500 } } as Customer
    expect(stepDone('usedCars', 2, state({ customers: [allowed] }))).toBe(true)
  })

  it('brings up test drives when a 🔑 shows, even mid-deal', () => {
    expect(change([cust()], [cust({ wantsDrive: true })])).toBe('testDrive')
    expect(change([], [cust({ wantsDrive: true })])).toBe('testDrive')
    expect(change([cust({ wantsDrive: true })], [cust({ wantsDrive: true })])).toBeNull()
    expect(TUTORIALS.testDrive.inDeal).toBe(true)
    expect(TUTORIALS.testDrive.covers).toEqual(['testDrive'])
  })

  it('moves the test drive on as the drive does', () => {
    const drive = (over = {}) =>
      ({
        carId: 'x',
        by: PLAYER_ID,
        points: [],
        offered: null,
        back: false,
        ...over,
      }) as unknown as Customer['drive']
    const mine = (over: Partial<Customer>) =>
      state({ customers: [cust({ handlerId: PLAYER_ID, phase: 'talking', ...over })] })
    expect(stepDone('testDrive', 0, mine({ wantsDrive: true }))).toBe(false)
    expect(stepDone('testDrive', 0, mine({ drive: drive() }))).toBe(true)
    expect(stepDone('testDrive', 1, mine({ drive: drive() }))).toBe(false)
    expect(stepDone('testDrive', 1, mine({ phase: 'driving', drive: drive() }))).toBe(true)
    const pointed = drive({ points: [{ topic: 'comfort', fit: 'good' }] })
    expect(stepDone('testDrive', 2, mine({ phase: 'driving', drive: pointed }))).toBe(true)
    const back = drive({ back: true })
    expect(stepDone('testDrive', 3, mine({ drive: back }))).toBe(false)
    const asked = { carId: 'x', price: 1 } as Customer['offer']
    expect(stepDone('testDrive', 3, mine({ drive: back, offer: asked }))).toBe(true)
    // A salesperson's drive isn't the player's.
    const theirs = drive({ by: 'staff-1-1' })
    expect(stepDone('testDrive', 0, mine({ drive: theirs }))).toBe(false)
    const seller = { id: 's', role: 'sales', fired: false } as Employee
    expect(stepsOf('testDrive', state())).toHaveLength(4)
    expect(stepsOf('testDrive', state({ roster: [seller] }))).toHaveLength(5)
  })

  it('brings up the F&I menu for the player’s financed buyer, but not a cash one', () => {
    const fi = { lender: 'x', markup: 0, down: 0, products: [], presented: 0 }
    const credit = (finance: boolean) =>
      ({ tier: 'A', finance, down: 0.2 }) as unknown as Customer['credit']
    const buyer = (phase: Customer['phase'], finance = true) =>
      cust({
        handlerId: PLAYER_ID,
        phase,
        credit: credit(finance),
        budget: 99_999,
        archetype: 'regular',
        offer: { carId: 'x', price: 20_000 } as Customer['offer'],
        fi: phase === 'menu' ? (fi as Customer['fi']) : null,
      })
    expect(change([buyer('signing')], [buyer('menu')])).toBe('fiMenu')
    expect(change([buyer('signing', false)], [buyer('menu', false)])).toBeNull()
    expect(TUTORIALS.fiMenu.relevant!(state({ customers: [buyer('menu')] }))).toBe(true)
    expect(TUTORIALS.fiMenu.relevant!(state({ customers: [buyer('following')] }))).toBe(false)
    const at = (c: Customer) => state({ customers: [c] })
    expect(stepDone('fiMenu', 2, at(buyer('menu')))).toBe(false)
    const shown = { ...buyer('menu'), fi: { ...fi, presented: 1 } as Customer['fi'] }
    expect(stepDone('fiMenu', 2, at(shown))).toBe(true)
    expect(stepDone('fiMenu', 3, at(shown))).toBe(false)
    expect(stepDone('fiMenu', 3, state())).toBe(true)
  })

  it('brings up the client book with its first entry, then a call', () => {
    const book = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}` })) as never[]
    expect(tutorialFor(state(), state({ clients: book(1) }), [])).toBe('clientBook')
    expect(tutorialFor(state({ clients: book(1) }), state({ clients: book(1) }), [])).toBeNull()
    expect(TUTORIALS.clientBook.covers).toEqual(['clientBook', 'followUp'])
    expect(stepDone('clientBook', 0, state({ stockOpen: true, computerTab: 'clients' }))).toBe(true)
    expect(stepDone('clientBook', 2, state())).toBe(false)
    expect(stepDone('clientBook', 2, state({ playerCall: 'k0' }))).toBe(true)
    expect(stepDone('clientBook', 2, state({ callsTried: ['k0'] }))).toBe(true)
  })

  it('brings up marketing on day four’s morning, or the first morning after', () => {
    const corner = { career: { rank: 'corner-lot' as const } }
    const morning = (from: number, to: number) =>
      tutorialFor(state({ ...corner, clock: at(from) }), state({ ...corner, clock: at(to) }), [
        ...ONBOARDING,
      ])
    expect(morning(2, 3)).toBeNull()
    expect(morning(3, MARKETING_DAY)).toBe('marketing')
    expect(morning(9, 10)).toBe('marketing')
    const booked = state({ ...corner, clock: at(4), campaigns: [{ startDay: 5 }] })
    expect(stepDone('marketing', 1, state({ ...corner, clock: at(4) }))).toBe(false)
    expect(stepDone('marketing', 1, booked)).toBe(true)
  })
})
