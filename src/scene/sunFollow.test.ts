import { describe, expect, it } from 'vitest'
import { snappedSunTarget, type Vec3 } from './sunFollow'

const SUN: Vec3 = { x: 12, y: 20, z: 8 }

describe('snappedSunTarget', () => {
  it('stays within half a texel of the focus across the shadow plane', () => {
    const texel = 60 / 2048
    for (const focus of [
      { x: 0, y: 0, z: 0 },
      { x: 13.37, y: 0, z: -4.2 },
      { x: -28.9, y: 0, z: 11.05 },
    ]) {
      const t = snappedSunTarget(focus, SUN, texel)
      // Off the focus only sideways to the sun, by at most half a texel on each axis.
      const off = { x: t.x - focus.x, y: t.y - focus.y, z: t.z - focus.z }
      const len = Math.hypot(SUN.x, SUN.y, SUN.z)
      expect(Math.abs((off.x * SUN.x + off.y * SUN.y + off.z * SUN.z) / len)).toBeLessThan(1e-9)
      expect(Math.hypot(off.x, off.y, off.z)).toBeLessThanOrEqual((texel * Math.SQRT2) / 2 + 1e-9)
    }
  })

  it('holds still while the focus moves less than a texel', () => {
    const texel = 0.25
    const a = snappedSunTarget({ x: 1.1, y: 0, z: 1.1 }, SUN, texel)
    const b = snappedSunTarget({ x: 1.11, y: 0, z: 1.105 }, SUN, texel)
    const side = (p: Vec3) => {
      const n = Math.hypot(SUN.x, SUN.y, SUN.z)
      const k = (p.x * SUN.x + p.y * SUN.y + p.z * SUN.z) / n
      return { x: p.x - (SUN.x / n) * k, y: p.y - (SUN.y / n) * k, z: p.z - (SUN.z / n) * k }
    }
    const [sa, sb] = [side(a), side(b)]
    expect(sb.x).toBeCloseTo(sa.x, 9)
    expect(sb.y).toBeCloseTo(sa.y, 9)
    expect(sb.z).toBeCloseTo(sa.z, 9)
  })
})
