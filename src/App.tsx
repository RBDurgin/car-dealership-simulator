import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { CrashScreen } from './ui/CrashScreen'
import { HUD } from './ui/HUD'

export default function App() {
  return (
    // Without it, an error (such as the browser refusing WebGL) leaves a blank page.
    <CrashScreen>
      {/* Phones report a DPR of 3; 2 looks the same at a fraction of the fill cost. */}
      <Canvas shadows="percentage" dpr={[1, 2]}>
        <Scene />
      </Canvas>
      <HUD />
    </CrashScreen>
  )
}
