import { Suspense } from 'react'
import { CameraRig } from './CameraRig'
import { ClickMarker } from './ClickMarker'
import { DebugGrid } from './DebugGrid'
import { Floors } from './Floors'
import { GameClock } from './GameClock'
import { Ground } from './Ground'
import { Player } from './Player'
import { Props } from './Props'
import { Walls } from './Walls'

export function Scene() {
  return (
    <>
      <CameraRig />
      <GameClock />
      <hemisphereLight args={['#dfe9ff', '#5a4a3a', 0.6]} />
      <directionalLight
        position={[12, 20, 8]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-normalBias={0.03}
      />
      <Ground />
      <Floors />
      <Walls />
      <Suspense fallback={null}>
        <Props />
      </Suspense>
      <DebugGrid />
      <ClickMarker />
      <Player />
    </>
  )
}
