import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, MathUtils, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { isCutaway, wallPieces, type WallMode, type WallPiece } from '../sim/walls'
import { useGame } from '../state/store'
import { grid, layout } from './runtime'

const WALL_HEIGHT: Record<WallMode, number> = { up: 2.4, cutaway: 0.35, down: 0.1 }
const THICKNESS = { solid: 0.16, glass: 0.08, fence: 0.05 }
const CAP = 0.05
const FENCE_HEIGHT = 0.8
const CAP_COLORS = { solid: new Color('#5b5f66'), glass: new Color('#2f3338') }

/** Footprint of one instanced box; `piece` indexes the animated height it follows. */
interface Slab {
  x: number
  z: number
  sx: number
  sz: number
  pieces: number[]
}

function slabFor(p: WallPiece, t: number): Omit<Slab, 'pieces'> {
  const c = grid.tileToWorld(p.tx, p.tz)
  // Arms run from just past the tile center (so corners overlap) to the tile edge.
  const len = 0.5 + t / 2
  const off = (0.5 - t / 2) / 2
  switch (p.dir) {
    case null:
      return { x: c.x, z: c.z, sx: t, sz: t }
    case 'e':
      return { x: c.x + off, z: c.z, sx: len, sz: t }
    case 'w':
      return { x: c.x - off, z: c.z, sx: len, sz: t }
    case 's':
      return { x: c.x, z: c.z + off, sx: t, sz: len }
    case 'n':
      return { x: c.x, z: c.z - off, sx: t, sz: len }
  }
}

const tmpM = new Matrix4()
const tmpP = new Vector3()
const tmpS = new Vector3()
const noRot = new Quaternion()

function writeSlabs(
  mesh: InstancedMesh | null,
  slabs: Slab[],
  heights: Float32Array,
  cap: boolean,
): void {
  if (!mesh) return
  slabs.forEach((s, i) => {
    let h = 0
    for (const p of s.pieces) h = Math.max(h, heights[p])
    if (cap) {
      tmpP.set(s.x, h + CAP / 2, s.z)
      tmpS.set(s.sx + 0.02, CAP, s.sz + 0.02)
    } else {
      tmpP.set(s.x, h / 2, s.z)
      tmpS.set(s.sx, h, s.sz)
    }
    mesh.setMatrixAt(i, tmpM.compose(tmpP, noRot, tmpS))
  })
  mesh.instanceMatrix.needsUpdate = true
  // Heights changed, so the cached bounds used for raycasting are stale.
  mesh.boundingSphere = null
  mesh.boundingBox = null
}

const swallowClick = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

/** Building walls (solid + glass) with Sims-style Up / Cutaway / Down modes. */
function BuildingWalls() {
  const wallMode = useGame((s) => s.wallMode)
  const viewYaw = useGame((s) => s.viewYaw)

  const { pieces, solid, glass, caps, mullions } = useMemo(() => {
    const pieces = wallPieces(layout).filter((p) => p.kind !== 'fence')
    const solid: Slab[] = []
    const glass: Slab[] = []
    const caps: Slab[] = []
    const byTile = new Map<string, number[]>()
    pieces.forEach((p, i) => {
      const kind = p.kind as 'solid' | 'glass'
      const slab = { ...slabFor(p, THICKNESS[kind]), pieces: [i] }
      ;(kind === 'solid' ? solid : glass).push(slab)
      caps.push(slab)
      if (kind === 'glass') {
        const key = `${p.tx},${p.tz}`
        byTile.set(key, [...(byTile.get(key) ?? []), i])
      }
    })
    // Window frame posts: every other glass tile, plus ends and corners.
    const mullions: Slab[] = []
    for (const ids of byTile.values()) {
      const { tx, tz } = pieces[ids[0]]
      const dirs = ids
        .map((i) => pieces[i].dir)
        .sort()
        .join('')
      const straight = dirs === 'ew' || dirs === 'ns'
      if (straight && (tx + tz) % 2 !== 0) continue
      const c = grid.tileToWorld(tx, tz)
      mullions.push({ x: c.x, z: c.z, sx: 0.12, sz: 0.12, pieces: ids })
    }
    return { pieces, solid, glass, caps, mullions }
  }, [])

  const targets = useMemo(
    () =>
      Float32Array.from(pieces, (p) =>
        wallMode === 'cutaway' && !isCutaway(layout, p, viewYaw)
          ? WALL_HEIGHT.up
          : WALL_HEIGHT[wallMode],
      ),
    [pieces, wallMode, viewYaw],
  )
  const heights = useRef<Float32Array | null>(null)
  const settled = useRef(false)

  const solidRef = useRef<InstancedMesh>(null)
  const glassRef = useRef<InstancedMesh>(null)
  const capRef = useRef<InstancedMesh>(null)
  const mullionRef = useRef<InstancedMesh>(null)

  const writeAll = () => {
    const h = heights.current!
    writeSlabs(solidRef.current, solid, h, false)
    writeSlabs(glassRef.current, glass, h, false)
    writeSlabs(capRef.current, caps, h, true)
    writeSlabs(mullionRef.current, mullions, h, false)
  }

  // First mount: snap straight to the targets, no animation.
  useLayoutEffect(() => {
    heights.current = targets.slice()
    const cap = capRef.current
    if (cap) {
      caps.forEach((s, i) => cap.setColorAt(i, CAP_COLORS[pieces[s.pieces[0]].kind as 'solid']))
      if (cap.instanceColor) cap.instanceColor.needsUpdate = true
    }
    writeAll()
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  // Mode or view changed: let useFrame ease toward the new targets.
  useLayoutEffect(() => {
    settled.current = false
  }, [targets])

  useFrame((_, rawDelta) => {
    const h = heights.current
    if (!h || settled.current) return
    const dt = Math.min(rawDelta, 0.05)
    let moving = false
    for (let i = 0; i < h.length; i++) {
      const next = MathUtils.damp(h[i], targets[i], 12, dt)
      h[i] = Math.abs(next - targets[i]) < 1e-3 ? targets[i] : next
      if (h[i] !== targets[i]) moving = true
    }
    writeAll()
    settled.current = !moving
  })

  return (
    <group>
      <instancedMesh
        ref={solidRef}
        args={[undefined, undefined, solid.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
        onPointerDown={swallowClick}
        onPointerUp={swallowClick}
      >
        <boxGeometry />
        <meshStandardMaterial color="#ece7dd" />
      </instancedMesh>
      <instancedMesh
        ref={glassRef}
        args={[undefined, undefined, glass.length]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshStandardMaterial
          color="#9fd3ee"
          transparent
          opacity={0.28}
          depthWrite={false}
          roughness={0.05}
          metalness={0.1}
        />
      </instancedMesh>
      <instancedMesh
        ref={mullionRef}
        args={[undefined, undefined, mullions.length]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry />
        <meshStandardMaterial color="#2f3338" />
      </instancedMesh>
      <instancedMesh
        ref={capRef}
        args={[undefined, undefined, caps.length]}
        castShadow
        frustumCulled={false}
        onPointerDown={swallowClick}
        onPointerUp={swallowClick}
      >
        <boxGeometry />
        <meshStandardMaterial />
      </instancedMesh>
    </group>
  )
}

/** Static perimeter fence: a post per tile with two rails. Unaffected by wall modes. */
function Fence() {
  const { posts, rails } = useMemo(() => {
    const pieces = wallPieces(layout).filter((p) => p.kind === 'fence')
    const seen = new Set<string>()
    const posts: { x: number; z: number }[] = []
    const rails: Omit<Slab, 'pieces'>[] = []
    for (const p of pieces) {
      const key = `${p.tx},${p.tz}`
      if (!seen.has(key)) {
        seen.add(key)
        posts.push(grid.tileToWorld(p.tx, p.tz))
      }
      rails.push(slabFor(p, THICKNESS.fence))
    }
    return { posts, rails }
  }, [])

  const postRef = useRef<InstancedMesh>(null)
  const railRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const postMesh = postRef.current
    const railMesh = railRef.current
    if (!postMesh || !railMesh) return
    posts.forEach((p, i) => {
      tmpP.set(p.x, FENCE_HEIGHT / 2, p.z)
      tmpS.set(0.1, FENCE_HEIGHT, 0.1)
      postMesh.setMatrixAt(i, tmpM.compose(tmpP, noRot, tmpS))
    })
    rails.forEach((r, i) => {
      for (const [j, y] of [0.35, FENCE_HEIGHT - 0.06].entries()) {
        tmpP.set(r.x, y, r.z)
        tmpS.set(r.sx, 0.06, r.sz)
        railMesh.setMatrixAt(i * 2 + j, tmpM.compose(tmpP, noRot, tmpS))
      }
    })
    postMesh.instanceMatrix.needsUpdate = true
    railMesh.instanceMatrix.needsUpdate = true
  }, [posts, rails])

  return (
    <group>
      <instancedMesh ref={postRef} args={[undefined, undefined, posts.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#3d4148" />
      </instancedMesh>
      <instancedMesh ref={railRef} args={[undefined, undefined, rails.length * 2]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#3d4148" />
      </instancedMesh>
    </group>
  )
}

export function Walls() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyV' && !e.repeat) useGame.getState().cycleWallMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <BuildingWalls />
      <Fence />
    </>
  )
}
