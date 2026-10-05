import { describe, expect, it } from 'vitest'
import { classifyTap, pinchZoom, TAP_MAX_MOVE, TAP_MAX_MS } from './gestures'

const down = { x: 100, y: 200, t: 1000 }

describe('classifyTap', () => {
  it('accepts a quick one-finger press that barely moves', () => {
    expect(classifyTap(down, { x: 103, y: 196, t: 1120 }, 1)).toBe(true)
    expect(classifyTap(down, { x: 100 + TAP_MAX_MOVE, y: 200, t: 1000 + TAP_MAX_MS }, 1)).toBe(true)
  })

  it('rejects a drag', () => {
    expect(classifyTap(down, { x: 100 + TAP_MAX_MOVE + 1, y: 200, t: 1100 }, 1)).toBe(false)
    expect(classifyTap(down, { x: 108, y: 208, t: 1100 }, 1)).toBe(false)
  })

  it('rejects a long press', () => {
    expect(classifyTap(down, { x: 100, y: 200, t: 1000 + TAP_MAX_MS + 1 }, 1)).toBe(false)
  })

  it('rejects any press that had a second finger down', () => {
    expect(classifyTap(down, { x: 100, y: 200, t: 1050 }, 2)).toBe(false)
    expect(classifyTap(down, { x: 100, y: 200, t: 1050 }, 0)).toBe(false)
  })
})

describe('pinchZoom', () => {
  it('zooms in as the fingers spread and out as they close', () => {
    expect(pinchZoom(100, 120)).toBeCloseTo(1.2)
    expect(pinchZoom(100, 80)).toBeCloseTo(0.8)
    expect(pinchZoom(100, 100)).toBe(1)
  })

  it('clamps a single jumpy step', () => {
    expect(pinchZoom(10, 100)).toBe(2)
    expect(pinchZoom(100, 10)).toBe(0.5)
  })

  it('ignores degenerate distances', () => {
    expect(pinchZoom(0, 50)).toBe(1)
    expect(pinchZoom(50, 0)).toBe(1)
    expect(pinchZoom(Number.NaN, 50)).toBe(1)
  })
})
