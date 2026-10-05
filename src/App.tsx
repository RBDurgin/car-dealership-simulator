import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'

export default function App() {
  return (
    <>
      {/* Phones report a DPR of 3; 2 looks the same at a fraction of the fill cost. */}
      <Canvas shadows="percentage" dpr={[1, 2]}>
        <Scene />
      </Canvas>
      <HUD />
    </>
  )
}
