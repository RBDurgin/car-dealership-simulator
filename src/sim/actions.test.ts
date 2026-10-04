import { describe, expect, it } from 'vitest'
import { isTimedActionDone, reduceAction, type ActiveAction } from './actions'
import type { ActionId } from './interactables'

const request = (id: number, action: ActionId) =>
  reduceAction(null, { type: 'request', id, targetId: 't', action }).next!

describe('reduceAction', () => {
  it('starts every request in the approaching phase', () => {
    expect(request(1, 'sit')).toMatchObject({ id: 1, phase: 'approaching', startedAt: null })
  })

  it('replaces the current action on a new request', () => {
    const { next } = reduceAction(request(1, 'sit'), {
      type: 'request',
      id: 2,
      targetId: 'u',
      action: 'getCoffee',
    })
    expect(next).toMatchObject({ id: 2, targetId: 'u', phase: 'approaching' })
  })

  it('finishes instant actions on arrival', () => {
    const { next, finished } = reduceAction(request(1, 'inspect'), {
      type: 'arrive',
      id: 1,
      now: 5,
    })
    expect(next).toBeNull()
    expect(finished).toMatchObject({ id: 1, action: 'inspect' })
  })

  it('runs timed actions until complete', () => {
    const performing = reduceAction(request(1, 'getCoffee'), { type: 'arrive', id: 1, now: 100 })
    expect(performing.next).toMatchObject({ phase: 'performing', startedAt: 100 })
    expect(isTimedActionDone(performing.next!, 101)).toBe(false)
    expect(isTimedActionDone(performing.next!, 100 + 2500)).toBe(true)

    const done = reduceAction(performing.next, { type: 'complete', id: 1 })
    expect(done.next).toBeNull()
    expect(done.finished).toMatchObject({ id: 1, action: 'getCoffee' })
  })

  it('keeps hold actions running until cancelled', () => {
    const sitting = reduceAction(request(1, 'sit'), { type: 'arrive', id: 1, now: 0 }).next!
    expect(sitting.phase).toBe('performing')
    expect(isTimedActionDone(sitting, 1e9)).toBe(false)
    expect(reduceAction(sitting, { type: 'complete', id: 1 }).next).toBe(sitting)
    expect(reduceAction(sitting, { type: 'cancel' })).toEqual({ next: null, finished: null })
  })

  it('ignores stale and out-of-order events', () => {
    const approaching = request(2, 'getCoffee')
    // Completing before arriving does nothing.
    expect(reduceAction(approaching, { type: 'complete', id: 2 }).next).toBe(approaching)
    // Events for an action that was replaced do nothing.
    expect(reduceAction(approaching, { type: 'arrive', id: 1, now: 0 }).next).toBe(approaching)
    const performing = reduceAction(approaching, { type: 'arrive', id: 2, now: 0 }).next!
    expect(reduceAction(performing, { type: 'arrive', id: 2, now: 9 }).next).toBe(performing)
    expect(reduceAction(performing, { type: 'complete', id: 1 }).next).toBe(performing)
    // Nothing happens when idle.
    expect(reduceAction(null, { type: 'complete', id: 2 })).toEqual({ next: null, finished: null })
  })

  it('cancels from any phase without finishing', () => {
    const phases: ActiveAction[] = [
      request(1, 'getCoffee'),
      reduceAction(request(1, 'getCoffee'), { type: 'arrive', id: 1, now: 0 }).next!,
    ]
    for (const a of phases) {
      expect(reduceAction(a, { type: 'cancel' })).toEqual({ next: null, finished: null })
    }
  })
})
