import { Outlines, useCursor } from '@react-three/drei'
import { createPortal, type ThreeEvent } from '@react-three/fiber'
import { Fragment, useState, type ReactNode } from 'react'
import type { Mesh } from 'three'
import { useGame } from '../state/store'

const HOVER_COLOR = '#fde047'
const OUTLINE_PX = 3

/**
 * Makes its children hoverable and clickable. Hover draws an outline around every
 * mesh inside; a left click opens the action menu at the cursor.
 */
export function Interactable({ id, children }: { id: string; children: ReactNode }) {
  const highlighted = useGame((s) => s.hoveredId === id || s.menu?.targetId === id)
  const hovered = useGame((s) => s.hoveredId === id)
  const [meshes, setMeshes] = useState<Mesh[] | null>(null)
  useCursor(hovered)

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    // Collect the model's meshes on first hover, before any outline meshes exist,
    // so the outlines themselves are never collected. Opening the menu needs a hover
    // first, so this always runs before anything is highlighted.
    if (!meshes) {
      const found: Mesh[] = []
      e.eventObject.traverse((o) => {
        if ((o as Mesh).isMesh) found.push(o as Mesh)
      })
      setMeshes(found)
    }
    useGame.getState().setHovered(id)
  }
  const onOut = () => {
    if (useGame.getState().hoveredId === id) useGame.getState().setHovered(null)
  }
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.button !== 0) return
    useGame.getState().openMenu(id, e.nativeEvent.clientX, e.nativeEvent.clientY)
  }

  return (
    <group onPointerOver={onOver} onPointerOut={onOut} onPointerDown={onDown}>
      {children}
      {highlighted &&
        meshes?.map((m) => (
          <Fragment key={m.uuid}>
            {createPortal(<Outlines color={HOVER_COLOR} thickness={OUTLINE_PX} />, m)}
          </Fragment>
        ))}
    </group>
  )
}
