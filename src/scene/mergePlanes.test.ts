import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'
import { mergePlanes } from './mergePlanes'

describe('mergePlanes', () => {
  it('is null for no rects', () => {
    expect(mergePlanes([])).toBeNull()
  })

  it('lays every rect flat where it belongs, facing up, in one geometry', () => {
    const geo = mergePlanes([
      { x: 0, z: 0, w: 2, h: 4, y: 0.01 },
      { x: 10, z: -5, w: 1, h: 1, y: 0.03 },
    ])!
    // Four corners and two triangles a rect.
    expect(geo.getAttribute('position').count).toBe(8)
    expect(geo.getIndex()!.count).toBe(12)
    const box = new Box3().setFromBufferAttribute(geo.getAttribute('position') as never)
    expect(box.min.x).toBe(-1)
    expect(box.min.y).toBeCloseTo(0.01)
    expect(box.min.z).toBe(-5.5)
    expect(box.max.x).toBe(10.5)
    expect(box.max.y).toBeCloseTo(0.03)
    expect(box.max.z).toBe(2)
    const normal = geo.getAttribute('normal')
    for (let i = 0; i < normal.count; i++) expect(normal.getY(i)).toBeCloseTo(1)
  })
})
