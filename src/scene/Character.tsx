import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import type { AnimationAction, Group, Mesh, MeshStandardMaterial } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import {
  CUSTOMER_VARIANTS,
  STAFF_VARIANTS,
  type CharacterAnim,
  type CharacterVariant,
} from '../sim/characters'

const BASE = `${import.meta.env.BASE_URL}models/characters`
/** The Kenney Mini Characters are ~0.67 units tall; this brings them to ~1.2. */
const CHARACTER_SCALE = 1.8
const FADE_SECONDS = 0.2
/**
 * Ground covered by one loop of each locomotion clip at CHARACTER_SCALE (two steps of
 * leg length × the clip's swing: ±60° walk, ±90° sprint). Used to sync feet to speed.
 */
const STRIDE: Partial<Record<CharacterAnim, number>> = { walk: 1.1, sprint: 1.28 }

const FILES: Record<CharacterVariant, string> = {
  salesperson: 'character-male-d',
  ...Object.fromEntries(
    [...CUSTOMER_VARIANTS, ...STAFF_VARIANTS].map((v) => [v, `character-${v}`]),
  ),
} as Record<CharacterVariant, string>

const urlFor = (variant: CharacterVariant) => `${BASE}/${FILES[variant]}.glb`

for (const v of Object.keys(FILES) as CharacterVariant[]) useGLTF.preload(urlFor(v))

/** The Kenney characters' clothes and hands; the head is a separate mesh. */
const BODY_MESH = 'body-mesh'

/**
 * An animated, skinned character facing +z. The clip is read from `anim` every frame
 * and crossfaded on change, so callers drive it from `useFrame` without re-rendering.
 * `moveSpeed` (units/s) speeds up walk/sprint so the feet don't slide. `bodyTint`
 * multiplies the colour of their clothes (on this copy only), e.g. for a dark suit.
 */
export function Character({
  variant,
  anim,
  moveSpeed,
  bodyTint,
}: {
  variant: CharacterVariant
  anim: RefObject<CharacterAnim>
  moveSpeed?: number
  bodyTint?: string
}) {
  const { scene, animations } = useGLTF(urlFor(variant))
  // Skinned meshes need SkeletonUtils.clone so each copy gets its own skeleton.
  const object = useMemo(() => {
    const root = clone(scene)
    root.traverse((o) => {
      if (!(o as Mesh).isMesh) return
      const mesh = o as Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Clones share materials, so tint a copy of this one's.
      if (bodyTint && mesh.name === BODY_MESH) {
        const material = (mesh.material as MeshStandardMaterial).clone()
        material.color.set(bodyTint)
        mesh.material = material
      }
    })
    return root
  }, [scene, bodyTint])
  const root = useRef<Group>(null)
  const { actions } = useAnimations(animations, root)
  const playing = useRef<AnimationAction | null>(null)

  useFrame(() => {
    const next = actions[anim.current]
    // Also restarts the current clip if something stopped it: drei's useAnimations
    // cleanup stops every action when StrictMode re-runs effects in dev.
    if (!next || (next === playing.current && next.isRunning())) return
    const stride = STRIDE[anim.current]
    const timeScale = stride && moveSpeed ? (moveSpeed * next.getClip().duration) / stride : 1
    next.reset().setEffectiveTimeScale(timeScale).fadeIn(FADE_SECONDS).play()
    if (playing.current !== next) playing.current?.fadeOut(FADE_SECONDS)
    playing.current = next
  })

  return (
    <group ref={root} scale={CHARACTER_SCALE}>
      <primitive object={object} />
    </group>
  )
}
