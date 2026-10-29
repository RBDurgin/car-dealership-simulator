import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAuctionDay } from '../sim/auction'
import { CLOSE_MINUTE } from '../sim/clock'
import type { Client } from '../sim/clients'
import { PLAYER_ID, type Customer } from '../sim/customers'
import { createSave, parseSave } from '../sim/save'
import { ONBOARDING, TUTORIAL_IDS } from '../sim/tutorials'
import { isPaused, useGame } from './store'
import { startTips } from './tips'
import { startTutorials } from './tutorials'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

/** Plays a Main Street game (guide closed) through to the evening before the first auction. */
function toAuctionEve(level: 'easy' | 'medium' | 'hard' = 'medium', tutorialsOn?: boolean) {
  game().newGame(level, undefined, tutorialsOn)
  // Past the others (the onboarding would come up as the guide closes).
  useGame.setState({ tutorialsSeen: TUTORIAL_IDS.filter((id) => id !== 'auction') })
  game().toggleHelp(false)
  useGame.setState({ career: { ...game().career, rank: 'main-street' } })
  while (!isAuctionDay(game().clock.day + 1)) {
    endDay()
    game().startNextDay()
  }
  endDay()
}

describe('walkthrough state', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('starts on by the level, unless New game says otherwise', () => {
    game().newGame('easy')
    expect(game().tutorialsOn).toBe(true)
    game().newGame('medium')
    expect(game().tutorialsOn).toBe(true)
    game().newGame('hard')
    expect(game().tutorialsOn).toBe(false)
    game().newGame('hard', undefined, true)
    expect(game().tutorialsOn).toBe(true)
    game().newGame('medium', undefined, false)
    expect(game().tutorialsOn).toBe(false)
    expect(game().catchUp).toBe(false)
  })

  it('pauses the game under a card, but not during the steps', () => {
    game().newGame('medium')
    game().toggleHelp(false)
    expect(isPaused(game())).toBe(false)
    game().offerTutorial('auction')
    expect(isPaused(game())).toBe(true)
    game().startTutorial('auction')
    expect(game().tutorialCard).toBeNull()
    expect(game().coach).toEqual({ id: 'auction', step: 0 })
    expect(isPaused(game())).toBe(false)
  })

  it('marks the walkthrough and the tips it covers seen when its card shows', () => {
    game().newGame('easy')
    game().offerTutorial('auction')
    expect(game().tutorialsSeen).toEqual(['auction'])
    expect(game().tipsSeen).toContain('auction')
  })

  it('steps through, skipping the max bid step without a manager, and ends', () => {
    game().newGame('medium')
    game().startTutorial('auction')
    game().advanceCoach()
    expect(game().coach?.step).toBe(1)
    game().advanceCoach()
    expect(game().coach?.step).toBe(2)
    game().advanceCoach()
    expect(game().coach).toBeNull()
    game().startTutorial('auction')
    game().endTutorial()
    expect(game().coach).toBeNull()
  })

  it('keeps a walkthrough put off with Later for the Tutorials tab, until it’s started', () => {
    game().newGame('medium')
    game().offerTutorial('auction')
    game().laterTutorial()
    expect(game().tutorialCard).toBeNull()
    expect(game().tutorialsLater).toEqual(['auction'])
    game().toggleHelp(true)
    game().startTutorial('auction')
    expect(game().helpOpen).toBe(false)
    expect(game().tutorialsLater).toEqual([])
  })

  it('turning them off closes a card that’s up', () => {
    game().newGame('medium')
    game().offerTutorial('auction')
    game().setTutorialsOn(false)
    expect(game().tutorialCard).toBeNull()
    expect(game().tutorialsOn).toBe(false)
  })

  it('keeps the walkthroughs through a save, never a card or steps', () => {
    game().newGame('medium')
    game().offerTutorial('auction')
    game().laterTutorial()
    game().startTutorial('auction')
    endDay()
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().tutorialsSeen).toEqual(['auction'])
    expect(game().tutorialsOn).toBe(true)
    expect(game().coach).toBeNull()
    expect(game().tutorialCard).toBeNull()
  })
})

describe('the walkthrough watcher', () => {
  let stop: () => void
  beforeEach(() => {
    useGame.setState(initial, true)
    stop = startTutorials()
  })
  afterEach(() => stop())

  it('brings up the auction’s card on the first auction morning, and moves the steps on', () => {
    toAuctionEve()
    expect(game().tutorialCard).toBeNull()
    game().startNextDay()
    expect(game().tutorialCard).toBe('auction')
    game().startTutorial('auction')
    game().toggleStockPanel(true, 'auction')
    expect(game().coach?.step).toBe(1)
  })

  it('advances at once past a step already done', () => {
    game().newGame('medium')
    useGame.setState({ tutorialsSeen: [...ONBOARDING] })
    game().toggleHelp(false)
    game().toggleStockPanel(true, 'auction')
    game().startTutorial('auction')
    expect(game().coach?.step).toBe(1)
  })

  it('waits for the guide to close', () => {
    toAuctionEve()
    game().toggleHelp(true)
    game().startNextDay()
    expect(game().tutorialCard).toBeNull()
    game().toggleHelp(false)
    expect(game().tutorialCard).toBe('auction')
  })

  it('shows nothing with walkthroughs off, or on Hard', () => {
    toAuctionEve('medium', false)
    game().startNextDay()
    expect(game().tutorialCard).toBeNull()
    toAuctionEve('hard')
    game().startNextDay()
    expect(game().tutorialCard).toBeNull()
  })

  it('doesn’t come back once seen', () => {
    toAuctionEve()
    game().startNextDay()
    game().laterTutorial()
    for (let i = 0; i < 7; i++) {
      endDay()
      game().startNextDay()
    }
    expect(isAuctionDay(game().clock.day)).toBe(true)
    expect(game().tutorialCard).toBeNull()
  })

  it('opens a new game with the first sale once the guide closes', () => {
    game().newGame('medium')
    expect(game().tutorialCard).toBeNull()
    game().toggleHelp(false)
    expect(game().tutorialCard).toBe('firstSale')
    expect(game().tipsSeen).toEqual(expect.arrayContaining(['haggle', 'restock']))
    game().startTutorial('firstSale')
    expect(game().coach).toEqual({ id: 'firstSale', step: 0 })
  })

  it('ends the first sale at closing for the evening’s, then day two’s next morning', () => {
    game().newGame('medium')
    game().toggleHelp(false)
    game().startTutorial('firstSale')
    game().advanceCoach()
    endDay()
    expect(game().coach).toBeNull()
    expect(game().tutorialCard).toBe('firstEvening')
    game().startTutorial('firstEvening')
    expect(game().coach).toEqual({ id: 'firstEvening', step: 0 })
    game().advanceCoach()
    game().startNextDay()
    expect(game().coach).toBeNull()
    expect(game().tutorialCard).toBe('runningThePlace')
  })

  it('walks day two through ordering and hiring', () => {
    game().newGame('medium')
    useGame.setState({ tutorialsSeen: ['firstSale', 'firstEvening'] })
    game().toggleHelp(false)
    endDay()
    game().startNextDay()
    expect(game().tutorialCard).toBe('runningThePlace')
    game().startTutorial('runningThePlace')
    game().toggleStockPanel(true, 'stock')
    expect(game().coach?.step).toBe(1)
    expect(game().orderCar('sedan', 'floor')).toBeTruthy()
    expect(game().coach?.step).toBe(2)
    game().toggleStockPanel(false)
    game().toggleStaffPanel(true)
    expect(game().coach?.step).toBe(3)
    game().hire(game().candidates[0].id)
    expect(game().coach).toBeNull()
  })

  it('leaves the onboarding out with walkthroughs off', () => {
    game().newGame('hard')
    game().toggleHelp(false)
    expect(game().tutorialCard).toBeNull()
    endDay()
    expect(game().tutorialCard).toBeNull()
  })
})

describe('the early encounters', () => {
  let stop: () => void
  beforeEach(() => {
    useGame.setState(initial, true)
    // In the order the game starts them.
    const stopTutorials = startTutorials()
    const stopTips = startTips()
    stop = () => {
      stopTutorials()
      stopTips()
    }
  })
  afterEach(() => stop())

  /** An Easy game on day 2 with the onboarding seen, the guide closed and no notice up. */
  function play() {
    game().newGame('easy')
    useGame.setState({ tutorialsSeen: [...ONBOARDING, 'marketing'] })
    game().toggleHelp(false)
    useGame.setState({ notice: null })
  }

  /** The first shopper of the day, as `over` says. */
  function shopper(over: Partial<Customer> = {}): Customer {
    let minute = game().clock.minute
    while (game().customers.length === 0) {
      minute += 5
      game().tickClock({ day: game().clock.day, minute })
    }
    return { ...game().customers[0], ...over }
  }

  const tipShown = () => game().notice?.text.startsWith('Tip:') ?? false

  it('shows the client book’s card, and not the tips it covers', () => {
    play()
    useGame.setState({ clients: [{ id: 'client-1-1', status: 'prospect' } as Client] })
    expect(game().tutorialCard).toBe('clientBook')
    expect(game().tipsSeen).toEqual(expect.arrayContaining(['clientBook', 'followUp']))
    expect(tipShown()).toBe(false)
  })

  it('brings up test drives in the middle of the player’s deal', () => {
    play()
    const c = shopper({ handlerId: PLAYER_ID, phase: 'talking', wantsDrive: true, drive: null })
    useGame.setState({ customers: [c] })
    expect(game().tutorialCard).toBe('testDrive')
    expect(tipShown()).toBe(false)
  })

  it('keeps the tip back while the card waits, and drops a card that’s past', () => {
    play()
    game().startTutorial('clientBook')
    const c = shopper({ phase: 'waiting', handlerId: null, wantsDrive: true, drive: null })
    useGame.setState({ customers: [c] })
    // The steps are up: the card waits, and so does its tip.
    expect(game().tutorialCard).toBeNull()
    expect(tipShown()).toBe(false)
    expect(game().tipsSeen).toContain('testDrive')
    // They gave up on the drive: nothing to show any more.
    useGame.setState({ customers: [{ ...c, wantsDrive: false }] })
    game().endTutorial()
    expect(game().tutorialCard).toBeNull()
    expect(game().tutorialsSeen).not.toContain('testDrive')
    // The next 🔑 brings it up.
    useGame.setState({ customers: [{ ...c, id: 'another' }] })
    expect(game().tutorialCard).toBe('testDrive')
  })

  it('shows Easy’s tip as before with walkthroughs off', () => {
    play()
    game().setTutorialsOn(false)
    useGame.setState({ clients: [{ id: 'client-1-1', status: 'prospect' } as Client] })
    expect(game().tutorialCard).toBeNull()
    expect(tipShown()).toBe(true)
  })

  it('brings up marketing on day four’s morning', () => {
    game().newGame('medium')
    useGame.setState({ tutorialsSeen: [...ONBOARDING] })
    game().toggleHelp(false)
    for (let day = 1; day < 4; day++) {
      endDay()
      game().startNextDay()
      if (day < 3) expect(game().tutorialCard).toBeNull()
    }
    expect(game().tutorialCard).toBe('marketing')
    game().startTutorial('marketing')
    game().toggleStockPanel(true, 'marketing')
    expect(game().coach?.step).toBe(1)
    game().launchCampaign('newspaper')
    expect(game().coach?.step).toBe(2)
  })
})

describe('the rank unlocks and the team', () => {
  let stop: () => void
  beforeEach(() => {
    useGame.setState(initial, true)
    const stopTutorials = startTutorials()
    const stopTips = startTips()
    stop = () => {
      stopTutorials()
      stopTips()
    }
  })
  afterEach(() => stop())

  /** An Easy game with the early walkthroughs seen, the guide closed and no notice up. */
  function play(seen = TUTORIAL_IDS.filter((id) => !LATER.includes(id))) {
    game().newGame('easy')
    useGame.setState({ tutorialsSeen: seen })
    game().toggleHelp(false)
    useGame.setState({ notice: null })
  }
  const LATER = ['mainStreet', 'auction', 'rival', 'garage', 'showroomWing', 'staffGrowth']

  it('shows Main Street, then the auction, on a rank-up’s auction morning', () => {
    play()
    useGame.setState({ career: { ...game().career, rank: 'main-street' } })
    while (!isAuctionDay(game().clock.day + 1)) {
      endDay()
      game().startNextDay()
      game().laterTutorial()
    }
    // Main Street came up on the first morning; put back, it waits in the Tutorials tab.
    expect(game().tutorialsSeen).toContain('mainStreet')
    expect(game().tutorialsLater).toContain('mainStreet')
    expect(game().tipsSeen).toContain('expansion')
    endDay()
    game().startNextDay()
    expect(game().tutorialCard).toBe('auction')
  })

  it('brings up both the same morning, one after the other', () => {
    toAuctionEve()
    useGame.setState({ tutorialsSeen: game().tutorialsSeen.filter((id) => id !== 'mainStreet') })
    game().startNextDay()
    expect(game().tutorialCard).toBe('mainStreet')
    game().laterTutorial()
    expect(game().tutorialCard).toBe('auction')
  })

  it('holds the first raise ask’s card for the morning, and not the tip', () => {
    play()
    game().hire(game().candidates[0].id)
    endDay()
    const roster = game().roster.map((e) => ({ ...e, raiseAsk: { wage: e.wage + 20, day: 1 } }))
    useGame.setState({ roster })
    expect(game().tipsSeen).toContain('levelUp')
    expect(game().tutorialCard).toBeNull()
    expect(game().notice?.text.startsWith('Tip:') ?? false).toBe(false)
    game().startNextDay()
    expect(game().tutorialCard).toBe('staffGrowth')
    game().startTutorial('staffGrowth')
    game().toggleStaffPanel(true)
    expect(game().coach?.step).toBe(1)
    game().answerRaise(game().roster[0].id, true)
    expect(game().coach?.step).toBe(2)
  })

  it('brings up the garage the morning after it’s bought, and waits for a mechanic', () => {
    play()
    useGame.setState({ expansions: [{ id: 'service-bay', day: game().clock.day }] })
    expect(game().tutorialCard).toBeNull()
    endDay()
    game().startNextDay()
    expect(game().tutorialCard).toBe('garage')
    expect(game().tipsSeen).toEqual(expect.arrayContaining(['serviceBay', 'serviceClient']))
    game().startTutorial('garage')
    expect(game().coach).toEqual({ id: 'garage', step: 0 })
  })
})
