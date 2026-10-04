import { CameraRig } from './CameraRig'
import { Ground } from './Ground'

export function Scene() {
  return (
    <>
      <CameraRig />
      <hemisphereLight args={['#dfe9ff', '#5a4a3a', 0.6]} />
      <directionalLight
        position={[12, 20, 8]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <Ground />
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d9534f" />
      </mesh>
    </>
  )
}
