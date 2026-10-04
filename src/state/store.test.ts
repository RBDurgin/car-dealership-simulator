import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

describe('game store actions', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('closes the menu and clears any move order when an action is chosen', () => {
    game().issueMoveOrder(3, 4)
    game().openMenu('display-1', 10, 10)
    game().requestAction('display-1', 'inspect')
    expect(game().moveOrder).toBeNull()
    expect(game().menu).toBeNull()
    expect(game().activeAction).toMatchObject({ targetId: 'display-1', phase: 'approaching' })
  })

  it('cancels the action when a move order is issued', () => {
    game().requestAction('office-chair', 'sit')
    game().issueMoveOrder(3, 4)
    expect(game().activeAction).toBeNull()
    expect(game().moveOrder).toMatchObject({ tx: 3, tz: 4 })
  })

  it('opens the info panel when an inspect finishes', () => {
    game().requestAction('display-1', 'inspect')
    game().arriveAction(game().activeAction!.id)
    expect(game().activeAction).toBeNull()
    expect(game().inspectedId).toBe('display-1')
  })

  it('shows a notice when a coffee finishes', () => {
    game().requestAction('coffee-machine', 'getCoffee')
    const id = game().activeAction!.id
    game().arriveAction(id)
    expect(game().activeAction?.phase).toBe('performing')
    game().completeAction(id)
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/coffee/i)
  })

  it('Esc closes the menu first, then cancels everything', () => {
    game().requestAction('office-chair', 'sit')
    game().openMenu('display-1', 0, 0)
    game().cancelAll()
    expect(game().menu).toBeNull()
    expect(game().activeAction).not.toBeNull()
    game().cancelAll()
    expect(game().activeAction).toBeNull()
  })
})
