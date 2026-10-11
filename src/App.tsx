import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { sceneIdle, useGame } from './state/store'
import { CrashScreen } from './ui/CrashScreen'
import { HUD } from './ui/HUD'

export default function App() {
  // While nothing moves (paused, or the day's summary up) the scene is drawn
  // only when something in it changes.
  const idle = useGame(sceneIdle)
  return (
    // Without it, an error (such as the browser refusing WebGL) leaves a blank page.
    <CrashScreen>
      {/* Phones report a DPR of 3; 2 looks the same at a fraction of the fill cost.
          scene/Quality lowers it further for the graphics tier. */}
      <Canvas shadows="percentage" dpr={[1, 2]} frameloop={idle ? 'demand' : 'always'}>
        <Scene />
      </Canvas>
      <HUD />
    </CrashScreen>
  )
}
