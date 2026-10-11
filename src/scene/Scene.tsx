import { lazy, Suspense } from 'react'
import { COARSE, COMPACT, matchesMedia } from '../input/useMediaQuery'
import { PERF } from '../state/perf'
import { CameraRig } from './CameraRig'
import { Chatter } from './Chatter'
import { ClickMarker } from './ClickMarker'
import { Customers } from './Customers'
import { DebugGrid } from './DebugGrid'
import { DrivenCars } from './DrivenCar'
import { Floors } from './Floors'
import { Garage } from './Garage'
import { GameClock } from './GameClock'
import { Ground } from './Ground'
import { Nazma } from './Nazma'
import { Owner } from './Owner'
import { Pedestrians } from './Pedestrians'
import { Player } from './Player'
import { Props } from './Props'
import { RivalLot } from './RivalLot'
import { Appreciation } from './Appreciation'
import { TubeMan } from './TubeMan'
import { Staff } from './Staff'
import { Walls } from './Walls'
import { WeatherEffects, WeatherLights } from './Weather'

/**
 * Phones and small screens get a 2048 shadow map instead of 4096: a quarter of the
 * memory and fill, and the softer edge doesn't show at phone sizes. Decided once at
 * load, because three.js only allocates the map once.
 */
const SHADOW_MAP_SIZE = matchesMedia(COMPACT) || matchesMedia(COARSE) ? 2048 : 4096

/** The `?perf` overlay, loaded only with the flag. */
const PerfOverlay = lazy(() => import('./PerfOverlay'))

export function Scene() {
  return (
    <>
      <CameraRig />
      <GameClock />
      <WeatherLights shadowMapSize={SHADOW_MAP_SIZE} />
      <Ground />
      <Floors />
      <Walls />
      <Suspense fallback={null}>
        <Props />
        <Garage />
        <RivalLot />
      </Suspense>
      <TubeMan />
      <Appreciation />
      <DebugGrid />
      <ClickMarker />
      <Player />
      <Customers />
      <DrivenCars />
      <Staff />
      <Pedestrians />
      <Owner />
      <Nazma />
      <Chatter />
      <WeatherEffects />
      {PERF && (
        <Suspense fallback={null}>
          <PerfOverlay />
        </Suspense>
      )}
    </>
  )
}
