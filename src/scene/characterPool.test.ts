import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { claimRig, freeRigs, releaseRig, takeRig } from './characterPool'

describe('characterPool', () => {
  it('clones once, then hands the same rig back out', () => {
    const model = new Group()
    let prepared = 0
    const prepare = () => prepared++
    const a = takeRig(model, prepare)
    expect(a).not.toBe(model)
    expect(prepared).toBe(1)
    releaseRig(model, a)
    expect(freeRigs(model)).toBe(1)
    expect(takeRig(model, prepare)).toBe(a)
    expect(prepared).toBe(1)
    expect(freeRigs(model)).toBe(0)
  })

  it('takes a released rig off the free list when its owner claims it again', () => {
    const model = new Group()
    const a = takeRig(model, () => {})
    releaseRig(model, a)
    claimRig(model, a)
    expect(freeRigs(model)).toBe(0)
    // Another passer-by gets a fresh one, not the rig still in use.
    expect(takeRig(model, () => {})).not.toBe(a)
  })

  it('never lists a rig twice', () => {
    const model = new Group()
    const a = takeRig(model, () => {})
    releaseRig(model, a)
    releaseRig(model, a)
    expect(freeRigs(model)).toBe(1)
  })
})
