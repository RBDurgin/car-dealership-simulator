import { Suspense } from 'react'
import { COARSE, COMPACT, matchesMedia } from '../input/useMediaQuery'
import { CameraRig } from './CameraRig'
import { ClickMarker } from './ClickMarker'
import { Customers } from './Customers'
import { DebugGrid } from './DebugGrid'
import { Floors } from './Floors'
import { GameClock } from './GameClock'
import { Ground } from './Ground'
import { Owner } from './Owner'
import { Pedestrians } from './Pedestrians'
import { Player } from './Player'
import { Props } from './Props'
import { Staff } from './Staff'
import { Walls } from './Walls'

/**
 * Phones and small screens get a 2048 shadow map instead of 4096: a quarter of the
 * memory and fill, and the softer edge doesn't show at phone sizes. Decided once at
 * load, because three.js only allocates the map once.
 */
const SHADOW_MAP_SIZE = matchesMedia(COMPACT) || matchesMedia(COARSE) ? 2048 : 4096

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
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
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
      <Customers />
      <Staff />
      <Pedestrians />
      <Owner />
    </>
  )
}
