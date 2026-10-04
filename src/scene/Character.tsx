import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import type { AnimationAction, Group, Mesh } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { CUSTOMER_VARIANTS, type CharacterAnim, type CharacterVariant } from '../sim/characters'

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
  ...Object.fromEntries(CUSTOMER_VARIANTS.map((v) => [v, `character-${v}`])),
} as Record<CharacterVariant, string>

const urlFor = (variant: CharacterVariant) => `${BASE}/${FILES[variant]}.glb`

for (const v of Object.keys(FILES) as CharacterVariant[]) useGLTF.preload(urlFor(v))

/**
 * An animated, skinned character facing +z. The clip is read from `anim` every frame
 * and crossfaded on change, so callers drive it from `useFrame` without re-rendering.
 * `moveSpeed` (units/s) speeds up walk/sprint so the feet don't slide.
 */
export function Character({
  variant,
  anim,
  moveSpeed,
}: {
  variant: CharacterVariant
  anim: RefObject<CharacterAnim>
  moveSpeed?: number
}) {
  const { scene, animations } = useGLTF(urlFor(variant))
  // Skinned meshes need SkeletonUtils.clone so each copy gets its own skeleton.
  const object = useMemo(() => {
    const root = clone(scene)
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return root
  }, [scene])
  const root = useRef<Group>(null)
  const { actions } = useAnimations(animations, root)
  const playing = useRef<AnimationAction | null>(null)

  useFrame(() => {
    const next = actions[anim.current]
    if (!next || next === playing.current) return
    const stride = STRIDE[anim.current]
    const timeScale = stride && moveSpeed ? (moveSpeed * next.getClip().duration) / stride : 1
    next.reset().setEffectiveTimeScale(timeScale).fadeIn(FADE_SECONDS).play()
    playing.current?.fadeOut(FADE_SECONDS)
    playing.current = next
  })

  return (
    <group ref={root} scale={CHARACTER_SCALE}>
      <primitive object={object} />
    </group>
  )
}
