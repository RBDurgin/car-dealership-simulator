import type { Object3D } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

/**
 * Character rigs put back by passers-by, by the model they're cloned from. A
 * passer-by takes one when they step onto the sidewalk and gives it back when
 * they leave, so a day's stream of them costs as many `SkeletonUtils.clone`s
 * as the most on the sidewalk at once, not one each. Customers and staff keep
 * their own clones (they may be tinted, and stay longer).
 */
const free = new Map<Object3D, Object3D[]>()

/** A rig of `model` from the pool, or a fresh clone when none is free. */
export function takeRig(model: Object3D, prepare: (rig: Object3D) => void): Object3D {
  const rig = free.get(model)?.pop()
  if (rig) return rig
  const made = clone(model)
  prepare(made)
  return made
}

/**
 * Marks `rig` in use again. StrictMode runs an effect's cleanup and then the
 * effect again on the same rig, which `releaseRig` had put back meanwhile.
 */
export function claimRig(model: Object3D, rig: Object3D): void {
  const list = free.get(model)
  const at = list?.indexOf(rig) ?? -1
  if (at >= 0) list!.splice(at, 1)
}

/**
 * Puts `rig` back for the next passer-by of the same model. Called from an
 * effect's cleanup, after R3F has taken it out of the scene; it doesn't detach
 * it itself, as StrictMode's rerun keeps the same figure mounted.
 */
export function releaseRig(model: Object3D, rig: Object3D): void {
  const list = free.get(model) ?? []
  if (!list.includes(rig)) list.push(rig)
  free.set(model, list)
}

/** How many rigs of `model` are free (for tests). */
export function freeRigs(model: Object3D): number {
  return free.get(model)?.length ?? 0
}
