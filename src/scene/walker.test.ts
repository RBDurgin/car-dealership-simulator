import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from '../state/store'
import { report } from './walker'

const initial = useGame.getState()

describe('report', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('skips a report that changed nothing until the store changes', () => {
    const who = {}
    let calls = 0
    const noOp = () => ++calls
    expect(report(who, 'lead', noOp)).toBe(1)
    expect(report(who, 'lead', noOp)).toBeUndefined()
    expect(calls).toBe(1)
    // A different report is made, and so is the same one once the store has changed.
    report(who, 'claim:c1', noOp)
    expect(calls).toBe(2)
    useGame.setState({ timeScale: 4 })
    report(who, 'claim:c1', noOp)
    expect(calls).toBe(3)
  })

  it('makes a report that changed the store again, as it may change it again', () => {
    const who = {}
    let calls = 0
    const send = () => {
      calls++
      useGame.setState({ cash: useGame.getState().cash + 1 })
    }
    report(who, 'browsed', send)
    report(who, 'browsed', send)
    expect(calls).toBe(2)
  })

  it('keeps each walker apart', () => {
    let calls = 0
    report({}, 'arrive', () => calls++)
    report({}, 'arrive', () => calls++)
    expect(calls).toBe(2)
  })
})
