import { OrthographicCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils, type OrthographicCamera as OrthoCamera } from 'three'
import { onPinch, onTwist, useTouchTracking } from '../input/touch'
import { cameraState, playerPos, rotateView } from './runtime'

// Classic isometric pitch (~35°); yaw starts at 45° and rotates in 90° steps.
const DISTANCE = 40
const PITCH = Math.atan(1 / Math.SQRT2)
const MIN_ZOOM = 20
const MAX_ZOOM = 90
const START_ZOOM = 40

export function CameraRig() {
  const camera = useRef<OrthoCamera>(null)
  const domElement = useThree((s) => s.gl.domElement)
  const zoomTarget = useRef(START_ZOOM)

  useTouchTracking()

  useEffect(() => {
    const zoomBy = (factor: number) => {
      zoomTarget.current = MathUtils.clamp(zoomTarget.current * factor, MIN_ZOOM, MAX_ZOOM)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'KeyQ') rotateView(1)
      else if (e.code === 'KeyE') rotateView(-1)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(Math.exp(-e.deltaY * 0.001))
    }
    window.addEventListener('keydown', onKey)
    domElement.addEventListener('wheel', onWheel, { passive: false })
    const offPinch = onPinch(zoomBy)
    // A clockwise twist orbits the camera counter-clockwise (rotateView(1)), so the lot turns with the fingers.
    const offTwist = onTwist(rotateView)
    return () => {
      window.removeEventListener('keydown', onKey)
      domElement.removeEventListener('wheel', onWheel)
      offPinch()
      offTwist()
    }
  }, [domElement])

  useFrame((_, rawDelta) => {
    const cam = camera.current
    if (!cam) return
    const dt = Math.min(rawDelta, 0.05)

    cameraState.yaw = MathUtils.damp(cameraState.yaw, cameraState.yawTarget, 8, dt)
    const { focus } = cameraState
    focus.x = MathUtils.damp(focus.x, playerPos.x, 6, dt)
    focus.z = MathUtils.damp(focus.z, playerPos.z, 6, dt)
    cam.zoom = MathUtils.damp(cam.zoom, zoomTarget.current, 10, dt)
    cam.updateProjectionMatrix()

    const { yaw } = cameraState
    const horizontal = DISTANCE * Math.cos(PITCH)
    cam.position.set(
      focus.x + horizontal * Math.sin(yaw),
      DISTANCE * Math.sin(PITCH),
      focus.z + horizontal * Math.cos(yaw),
    )
    cam.lookAt(focus.x, 0, focus.z)
  })

  return <OrthographicCamera ref={camera} makeDefault zoom={START_ZOOM} near={0.1} far={200} />
}
