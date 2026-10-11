import { Outlines, useCursor } from '@react-three/drei'
import { createPortal, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useState, type ReactNode } from 'react'
import type { BufferGeometry, Material, Mesh, Object3D } from 'three'
import { isTap, isTouch } from '../input/touch'
import { useGame } from '../state/store'

const HOVER_COLOR = '#fde047'
const OUTLINE_PX = 3

/**
 * Makes its children hoverable and clickable. Hover draws an outline around every
 * mesh inside; a left click (or a tap) opens the action menu at the cursor. While
 * `disabled` (e.g. a customer walking out) clicks pass through to whatever is underneath.
 * Touch never hovers, so the outline can't stick; the menu's target is still outlined.
 */
export function Interactable({
  id,
  disabled = false,
  children,
}: {
  id: string
  disabled?: boolean
  children: ReactNode
}) {
  const highlighted = useGame((s) => s.hoveredId === id || s.menu?.targetId === id)
  const hovered = useGame((s) => s.hoveredId === id)
  const [meshes, setMeshes] = useState<Mesh[] | null>(null)
  useCursor(hovered)

  // Collect the model's meshes on first hover or tap, before any outline meshes
  // exist, so the outlines themselves are never collected. Opening the menu needs
  // one of those first, so this always runs before anything is highlighted.
  const collectMeshes = (root: Object3D) => {
    if (meshes) return
    const found: Mesh[] = []
    root.traverse((o) => {
      if ((o as Mesh).isMesh) found.push(o as Mesh)
    })
    setMeshes(found)
  }
  const openMenu = (e: ThreeEvent<PointerEvent>) => {
    collectMeshes(e.eventObject)
    useGame.getState().openMenu(id, e.nativeEvent.clientX, e.nativeEvent.clientY)
  }

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (isTouch(e.nativeEvent)) return
    collectMeshes(e.eventObject)
    useGame.getState().setHovered(id)
  }
  const onOut = () => {
    if (useGame.getState().hoveredId === id) useGame.getState().setHovered(null)
  }
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.button === 0 && !isTouch(e.nativeEvent)) openMenu(e)
  }
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (isTouch(e.nativeEvent) && isTap(e.pointerId)) openMenu(e)
  }

  // Same tree either way, so toggling `disabled` doesn't remount the children.
  return (
    <group
      onPointerOver={disabled ? undefined : onOver}
      onPointerOut={disabled ? undefined : onOut}
      onPointerDown={disabled ? undefined : onDown}
      onPointerUp={disabled ? undefined : onUp}
    >
      {children}
      {highlighted && !disabled && meshes?.map((m) => <MeshOutline key={m.uuid} mesh={m} />)}
    </group>
  )
}

/**
 * The hover outline round one mesh. drei's `Outlines` draws it from a creased
 * copy of the mesh's geometry, and means to free it on unmount, but by then
 * React has cleared the ref it reads, so every hover or tap leaked a geometry
 * per mesh (the geometries that climbed all day in 18a–18d). This finds the
 * copy and its material once they're made and frees them itself.
 */
function MeshOutline({ mesh }: { mesh: Mesh }) {
  useEffect(() => {
    const made: (BufferGeometry | Material)[] = []
    for (const group of mesh.children) {
      const outline = group.children[0] as Mesh | undefined
      if (!outline?.isMesh || !('isShaderMaterial' in outline.material)) continue
      if (outline.geometry !== mesh.geometry) made.push(outline.geometry)
      made.push(outline.material as Material)
    }
    return () => made.forEach((m) => m.dispose())
  }, [mesh])
  return createPortal(<Outlines color={HOVER_COLOR} thickness={OUTLINE_PX} />, mesh)
}
