import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAuctionDay } from '../sim/auction'
import { CLOSE_MINUTE } from '../sim/clock'
import { createSave, parseSave } from '../sim/save'
import { ONBOARDING } from '../sim/tutorials'
import { isPaused, useGame } from './store'
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
  // Past the onboarding, which would otherwise come up as the guide closes.
  useGame.setState({ tutorialsSeen: [...ONBOARDING] })
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
