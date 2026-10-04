import { OrthographicCamera } from '@react-three/drei'

// Classic isometric angles: 45° yaw, ~35° pitch.
const DISTANCE = 40
const YAW = Math.PI / 4
const PITCH = Math.atan(1 / Math.SQRT2)

const position: [number, number, number] = [
  DISTANCE * Math.cos(PITCH) * Math.sin(YAW),
  DISTANCE * Math.sin(PITCH),
  DISTANCE * Math.cos(PITCH) * Math.cos(YAW),
]

export function CameraRig() {
  return (
    <OrthographicCamera
      makeDefault
      position={position}
      zoom={40}
      near={0.1}
      far={200}
      onUpdate={(camera) => camera.lookAt(0, 0, 0)}
    />
  )
}
