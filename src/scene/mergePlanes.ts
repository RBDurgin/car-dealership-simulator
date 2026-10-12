import { PlaneGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** A flat rectangle on the ground, centred on `x`/`z` at height `y`. */
export interface FlatRect {
  x: number
  z: number
  w: number
  h: number
  y: number
}

/**
 * Flat rectangles facing up, as one geometry, so a floor's zones of one
 * colour, the parking stripes or the road's dashes are each a single draw
 * call. Null when there are none. The caller disposes it.
 */
export function mergePlanes(rects: readonly FlatRect[]): BufferGeometry | null {
  if (rects.length === 0) return null
  const parts = rects.map((r) =>
    new PlaneGeometry(r.w, r.h).rotateX(-Math.PI / 2).translate(r.x, r.y, r.z),
  )
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return merged
}
