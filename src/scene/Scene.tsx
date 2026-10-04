import { CameraRig } from './CameraRig'
import { ClickMarker } from './ClickMarker'
import { DebugGrid } from './DebugGrid'
import { Ground } from './Ground'
import { Obstacles } from './Obstacles'
import { Player } from './Player'

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
      <Obstacles />
      <DebugGrid />
      <ClickMarker />
      <Player />
    </>
  )
}
