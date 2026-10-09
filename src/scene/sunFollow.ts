export interface Vec3 {
  x: number
  y: number
  z: number
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
function normalize(a: Vec3): Vec3 {
  return scale(a, 1 / Math.hypot(a.x, a.y, a.z))
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

/**
 * Where the sun's target goes to centre its shadow camera on `focus`: the same
 * point, moved within the shadow map's plane to a whole number of texels, so the
 * shadows stay put on the ground as the camera eases along instead of
 * shimmering. `toSun` points from the target to the light; the axes are the
 * shadow camera's, as `lookAt` with +y up makes them.
 */
export function snappedSunTarget(focus: Vec3, toSun: Vec3, texel: number): Vec3 {
  const back = normalize(toSun)
  const right = normalize(cross({ x: 0, y: 1, z: 0 }, back))
  const up = cross(back, right)
  const snap = (v: number) => Math.round(v / texel) * texel
  return add(
    add(scale(right, snap(dot(focus, right))), scale(up, snap(dot(focus, up)))),
    scale(back, dot(focus, back)),
  )
}
