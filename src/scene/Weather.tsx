import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  type DirectionalLight,
  Euler,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { COARSE, COMPACT, matchesMedia } from '../input/useMediaQuery'
import { isIndoor } from '../sim/layout'
import type { Weather } from '../sim/weather'
import { cameraState, grid, layout, playerPos } from './runtime'
import { snappedSunTarget } from './sunFollow'
import { useWeather } from './useWeather'

/** Phones and small screens get a third of the drops (decided once, like the shadow map). */
const DROPS = matchesMedia(COMPACT) || matchesMedia(COARSE) ? 450 : 1400
/** Drops fall in a square this far either side of the player, from up to this high. */
const SPREAD = 28
const HEIGHT = 14
const FALL_SPEED = { min: 16, max: 22 }
/** A light wind, in world units per unit of fall, so the streaks slant a little. */
const WIND = 0.12
/** Tries to find a spot out of doors before a drop sits a turn out. */
const SPAWN_TRIES = 4

/** The scene's light by weather: sky and ground of the hemisphere, and the sun. */
const LIGHT: Record<
  Weather,
  { sky: string; ground: string; hemi: number; sun: string; sunIntensity: number }
> = {
  sunny: { sky: '#dfe9ff', ground: '#5a4a3a', hemi: 0.6, sun: '#ffffff', sunIntensity: 1.8 },
  cloudy: { sky: '#dde2e8', ground: '#5a554e', hemi: 1.1, sun: '#eef1f5', sunIntensity: 1.35 },
  rain: { sky: '#b4c1d6', ground: '#4a4d56', hemi: 1.3, sun: '#d2dcee', sunIntensity: 1.25 },
  hot: { sky: '#fff0d4', ground: '#6b5236', hemi: 0.6, sun: '#ffe9c4', sunIntensity: 2.0 },
}

/** Rain hazes the distance a little. */
const RAIN_FOG = { color: '#7d8796', near: 45, far: 120 }

/** Where the sun sits from the point it shines on. */
const SUN = { x: 12, y: 20, z: 8 }
/** Half the width of the square the sun casts shadows over, centred on the camera's focus. */
const SHADOW_REACH = 30

/**
 * The sun and sky, tinted by the day's weather. The sun follows the camera, so
 * shadows fall wherever the player is on a map wider than its shadow camera.
 */
export function WeatherLights({ shadowMapSize }: { shadowMapSize: number }) {
  const weather = useWeather()
  const l = LIGHT[weather]
  const sun = useRef<DirectionalLight>(null)
  const texel = (2 * SHADOW_REACH) / shadowMapSize

  useFrame(() => {
    const light = sun.current
    if (!light) return
    const { focus } = cameraState
    const t = snappedSunTarget({ x: focus.x, y: 0, z: focus.z }, SUN, texel)
    light.target.position.set(t.x, t.y, t.z)
    // The target isn't in the scene, so nothing else updates its matrix.
    light.target.updateMatrixWorld()
    light.position.set(t.x + SUN.x, t.y + SUN.y, t.z + SUN.z)
  })

  return (
    <>
      <hemisphereLight args={[l.sky, l.ground, l.hemi]} />
      <directionalLight
        ref={sun}
        position={[SUN.x, SUN.y, SUN.z]}
        color={l.sun}
        intensity={l.sunIntensity}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-SHADOW_REACH}
        shadow-camera-right={SHADOW_REACH}
        shadow-camera-top={SHADOW_REACH}
        shadow-camera-bottom={-SHADOW_REACH}
        shadow-normalBias={0.03}
      />
      {weather === 'rain' && (
        <fog attach="fog" args={[RAIN_FOG.color, RAIN_FOG.near, RAIN_FOG.far]} />
      )}
    </>
  )
}

/** Somewhere out of doors near the player for a drop to start, or null if none turned up. */
function spawnSpot(): { x: number; z: number } | null {
  for (let i = 0; i < SPAWN_TRIES; i++) {
    const x = playerPos.x + (Math.random() * 2 - 1) * SPREAD
    const z = playerPos.z + (Math.random() * 2 - 1) * SPREAD
    const { tx, tz } = grid.worldToTile(x, z)
    if (!grid.inBounds(tx, tz) || !isIndoor(layout, tx, tz)) return { x, z }
  }
  return null
}

interface Drops {
  /** x, y, z of each drop. */
  pos: Float32Array
  /** Each drop's fall speed. */
  speed: Float32Array
}

/** Drops spread through the air around the player, at any height. */
function scatterDrops(): Drops {
  const pos = new Float32Array(DROPS * 3)
  const speed = new Float32Array(DROPS)
  for (let i = 0; i < DROPS; i++) {
    const spot = spawnSpot()
    pos[i * 3] = spot?.x ?? 0
    pos[i * 3 + 1] = spot ? Math.random() * HEIGHT : -1
    pos[i * 3 + 2] = spot?.z ?? 0
    speed[i] = FALL_SPEED.min + Math.random() * (FALL_SPEED.max - FALL_SPEED.min)
  }
  return { pos, speed }
}

/**
 * Rain streaks, all in one instanced mesh. Each drop falls, then starts again
 * at the top somewhere near the player, never over the showroom's roof line.
 * Positions live in typed arrays and are written straight into the instance
 * matrices each frame.
 */
function Rain() {
  const mesh = useRef<InstancedMesh>(null)
  // Made on the first frame, so render stays pure.
  const drops = useRef<Drops | null>(null)
  const geometry = useMemo(() => new BoxGeometry(0.025, 0.55, 0.025), [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#cfdcee',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    [],
  )
  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      p: new Vector3(),
      q: new Quaternion().setFromEuler(new Euler(0, 0, -Math.atan(WIND))),
      one: new Vector3(1, 1, 1),
    }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((_, rawDelta) => {
    const m = mesh.current
    if (!m) return
    const dt = Math.min(rawDelta, 0.05)
    drops.current ??= scatterDrops()
    const { pos, speed } = drops.current
    for (let i = 0; i < DROPS; i++) {
      const j = i * 3
      pos[j + 1] -= speed[i] * dt
      pos[j] += speed[i] * WIND * dt
      if (pos[j + 1] < 0) {
        const spot = spawnSpot()
        if (spot) {
          pos[j] = spot.x
          pos[j + 2] = spot.z
          pos[j + 1] = HEIGHT + Math.random() * 2
        } else pos[j + 1] = HEIGHT
      }
      tmp.p.set(pos[j], pos[j + 1], pos[j + 2])
      tmp.m.compose(tmp.p, tmp.q, tmp.one)
      m.setMatrixAt(i, tmp.m)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometry, material, DROPS]} frustumCulled={false} />
}

/** What the sky is doing: rain on rainy days, nothing otherwise. */
export function WeatherEffects() {
  return useWeather() === 'rain' ? <Rain /> : null
}
