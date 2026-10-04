import { OrthographicCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils, type OrthographicCamera as OrthoCamera } from 'three'
import { cameraState, playerPos } from './runtime'

// Classic isometric pitch (~35°); yaw starts at 45° and rotates in 90° steps.
const DISTANCE = 40
const PITCH = Math.atan(1 / Math.SQRT2)
const MIN_ZOOM = 20
const MAX_ZOOM = 90
const START_ZOOM = 40

export function CameraRig() {
  const camera = useRef<OrthoCamera>(null)
  const domElement = useThree((s) => s.gl.domElement)
  const yawTarget = useRef(cameraState.yaw)
  const zoomTarget = useRef(START_ZOOM)
  const focus = useRef({ x: playerPos.x, z: playerPos.z })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'KeyQ') yawTarget.current += Math.PI / 2
      else if (e.code === 'KeyE') yawTarget.current -= Math.PI / 2
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomTarget.current = MathUtils.clamp(
        zoomTarget.current * Math.exp(-e.deltaY * 0.001),
        MIN_ZOOM,
        MAX_ZOOM,
      )
    }
    window.addEventListener('keydown', onKey)
    domElement.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      domElement.removeEventListener('wheel', onWheel)
    }
  }, [domElement])

  useFrame((_, rawDelta) => {
    const cam = camera.current
    if (!cam) return
    const dt = Math.min(rawDelta, 0.05)

    cameraState.yaw = MathUtils.damp(cameraState.yaw, yawTarget.current, 8, dt)
    focus.current.x = MathUtils.damp(focus.current.x, playerPos.x, 6, dt)
    focus.current.z = MathUtils.damp(focus.current.z, playerPos.z, 6, dt)
    cam.zoom = MathUtils.damp(cam.zoom, zoomTarget.current, 10, dt)
    cam.updateProjectionMatrix()

    const { yaw } = cameraState
    const horizontal = DISTANCE * Math.cos(PITCH)
    cam.position.set(
      focus.current.x + horizontal * Math.sin(yaw),
      DISTANCE * Math.sin(PITCH),
      focus.current.z + horizontal * Math.cos(yaw),
    )
    cam.lookAt(focus.current.x, 0, focus.current.z)
  })

  return <OrthographicCamera ref={camera} makeDefault zoom={START_ZOOM} near={0.1} far={200} />
}
